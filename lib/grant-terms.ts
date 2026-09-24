/**
 * THE TERMS OF A GRANT, AS THE ISSUE FORM SETS THEM AND SAYS THEM.
 *
 * The limits come first, mirrored from GrantEscrow, so a form can refuse bad terms before a
 * wallet opens rather than letting someone sign a transaction the contract will reject. That
 * makes them a second copy of a constant, which is the defect shape this project is most
 * prone to — so `lib/grant-terms.test.ts` reads them out of the Solidity source and fails if
 * they drift.
 *
 * Then the arithmetic the form does before anything is priced: how long a schedule is in
 * seconds (months and years from real calendar dates), the release fee as basis points, a
 * future start, and the amounts the form prints (units cut down, never rounded up; a top-up
 * rounded up, so topping up that much is always enough). All pure, all in bigint where money
 * is involved, and all tested. The browser and the server both import this file, so it
 * imports nothing but other pure helpers.
 */
import {dateUTC, stampUTC} from "./format";
import {held as no, ok as yes, type Outcome} from "./outcome";

/** GrantEscrow.MAX_TIP_BPS. A keeper taking more than this of every release is not a keeper. */
export const MAX_TIP_BPS = 200;

/** What the form offers until the company changes it. The contract has no default. */
export const DEFAULT_TIP_BPS = 50;

/** GrantEscrow.MAX_DURATION, in seconds. A grant nobody could finish is not a grant. */
export const MAX_DURATION_DAYS = 3650;
export const MAX_DURATION_SECONDS = MAX_DURATION_DAYS * 86_400;

/** GrantEscrow refuses a zero duration (`ZeroDuration`); one second is the shortest it takes. */
export const MIN_DURATION_SECONDS = 1;

/** The token a grant is paid in, by its own name. X Layer has two USDTs; this is the one. */
export const STABLE_NAME = "USD₮0";

// --- the schedule ------------------------------------------------------------------------

export const SCHEDULE_UNITS = ["minutes", "hours", "days", "months", "years"] as const;
export type ScheduleUnit = (typeof SCHEDULE_UNITS)[number];

/** A length as a person says it: "6 months", "2 hours". */
export type Span = {value: number; unit: ScheduleUnit};

const FIXED_SECONDS: Record<"minutes" | "hours" | "days", number> = {
  minutes: 60,
  hours: 3_600,
  days: 86_400,
};

/**
 * A calendar month later, in UTC. The 31st of a month lands on the last day of a shorter
 * one (31 Jan + 1 month = 28 or 29 Feb), rather than spilling into the month after, which
 * is how a date library that simply bumps the month would place it.
 */
export function addMonthsUTC(unixSeconds: number, months: number): number {
  const d = new Date(unixSeconds * 1000);
  const total = d.getUTCMonth() + months;
  const year = d.getUTCFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDay);
  return (
    Date.UTC(year, month, day, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()) / 1000
  );
}

/**
 * How many seconds a span is when it starts at `from`. Minutes, hours and days are fixed;
 * months and years are counted on the calendar, so "2 years" from 24 Sep 2026 ends on
 * 24 Sep 2028 and is 731 days long (2028 is a leap year). Rounded down to a whole second.
 */
export function spanSeconds(from: number, span: Span): number {
  if (span.unit === "months" || span.unit === "years") {
    const months = span.unit === "years" ? span.value * 12 : span.value;
    return addMonthsUTC(from, months) - from;
  }
  return Math.floor(span.value * FIXED_SECONDS[span.unit]);
}

/** The number a person typed for a span, checked. Months and years are whole numbers. */
export function parseSpan(text: string, unit: ScheduleUnit): Outcome<Span> {
  const t = text.trim();
  if (t === "") return no("Enter a number.");
  if (!/^\d+(\.\d+)?$/.test(t) && !/^\.\d+$/.test(t)) return no("Use a number, like 2 or 1.5.");
  const value = Number(t);
  if (!Number.isFinite(value)) return no("Use a number, like 2 or 1.5.");
  if ((unit === "months" || unit === "years") && !Number.isInteger(value)) {
    return no(`Use whole ${unit}, or switch to days.`);
  }
  return yes({value, unit});
}

/**
 * THE CONTRACT'S OWN RULES FOR A SCHEDULE, in the order GrantEscrow checks them:
 * `ZeroDuration`, `DurationTooLong`, `CliffAfterDuration`. The server runs this before it
 * prices anything, and the form runs it before it asks.
 */
export function checkSchedule(durationSeconds: number, cliffSeconds: number): Outcome<void> {
  if (!Number.isInteger(durationSeconds) || !Number.isInteger(cliffSeconds)) {
    return no("A schedule is counted in whole seconds.");
  }
  if (durationSeconds < MIN_DURATION_SECONDS) return no("Vesting needs a length.");
  if (durationSeconds > MAX_DURATION_SECONDS) {
    return no(
      `A grant can vest over at most ${MAX_DURATION_DAYS.toLocaleString("en-US")} days. ` +
        `This one is ${Math.ceil(durationSeconds / 86_400).toLocaleString("en-US")} days.`,
    );
  }
  if (cliffSeconds < 0) return no("A cliff cannot be negative.");
  if (cliffSeconds > durationSeconds) return no("The cliff can't be longer than the vesting.");
  return yes(undefined);
}

export type GrantSchedule = {
  /** Unix seconds: when vesting starts. */
  start: number;
  durationSeconds: number;
  cliffSeconds: number;
  cliffAt: number;
  endsAt: number;
};

/** A schedule from two spans and a start, checked against the contract's rules. */
export function scheduleFor(start: number, length: Span, cliff: Span): Outcome<GrantSchedule> {
  const durationSeconds = spanSeconds(start, length);
  const cliffSeconds = cliff.value === 0 ? 0 : spanSeconds(start, cliff);
  const checked = checkSchedule(durationSeconds, cliffSeconds);
  if (!checked.ok) return no(checked.why);
  return yes({
    start,
    durationSeconds,
    cliffSeconds,
    cliffAt: start + cliffSeconds,
    endsAt: start + durationSeconds,
  });
}

const SINGULAR: Record<ScheduleUnit, string> = {
  minutes: "minute",
  hours: "hour",
  days: "day",
  months: "month",
  years: "year",
};

const number = (n: number) => n.toLocaleString("en-US", {maximumFractionDigits: 2});

/** "6 months", "1 year", "1.5 hours". */
export function spanWords(span: Span): string {
  return `${number(span.value)} ${span.value === 1 ? SINGULAR[span.unit] : span.unit}`;
}

/** "6-month cliff", "1-year cliff", "no cliff". */
export function cliffWords(span: Span): string {
  if (span.value === 0) return "no cliff";
  return `${number(span.value)}-${SINGULAR[span.unit]} cliff`;
}

/** "2 years, 6-month cliff" — the way a preset is named on its card and in the summary. */
export function scheduleWords(length: Span, cliff: Span): string {
  return `${spanWords(length)}, ${cliffWords(cliff)}`;
}

/** Shorter than this, a schedule's moments are said with their time, not only their date. */
export const SHORT_SCHEDULE_SECONDS = 2 * 86_400;

/**
 * A moment on a schedule, said the way its length needs: "24 Mar 2027" on a two-year grant,
 * "24 Sep 2026, 14:05 UTC" on a two-hour one, where the date alone would say nothing.
 */
export function stampOrDate(unixSeconds: number, durationSeconds: number): string {
  return durationSeconds < SHORT_SCHEDULE_SECONDS ? stampUTC(unixSeconds) : dateUTC(unixSeconds);
}

// --- the release fee ---------------------------------------------------------------------

/** "0.5%" from 50 basis points, "2%" from 200. */
export function feeText(bps: number): string {
  return `${number(bps / 100)}%`;
}

/** A fee as typed, "0.5" or "0.5%", to basis points. At most two decimals; 0 to MAX_TIP_BPS. */
export function parseFeePercent(text: string): Outcome<number> {
  const t = text.trim().replace(/\s*%$/, "");
  if (t === "") return no("Enter a fee, or 0 for none.");
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(t) ?? /^()\.(\d{1,2})$/.exec(t);
  if (!m) return no("Use a percentage like 0.5, with at most two decimals.");
  // String arithmetic, not floats: 0.29 × 100 is 28.999999999999996 in a float.
  const bps = Number(m[1] || "0") * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if (bps > MAX_TIP_BPS) return no(`The release fee can be at most ${feeText(MAX_TIP_BPS)}.`);
  return yes(bps);
}

/** The contract's rule for a fee: a whole number of basis points, 0 to MAX_TIP_BPS. */
export function checkTip(bps: number): Outcome<number> {
  if (!Number.isInteger(bps) || bps < 0) return no("A release fee is a whole number of basis points.");
  if (bps > MAX_TIP_BPS) return no(`The release fee can be at most ${feeText(MAX_TIP_BPS)}.`);
  return yes(bps);
}

// --- a future start ----------------------------------------------------------------------

/** How far ahead a start may be set. Further than this is almost always a typo in the year. */
export const MAX_START_AHEAD_SECONDS = MAX_DURATION_SECONDS;

/**
 * A `datetime-local` value ("2026-09-25T14:30") read as the person's own clock, as the input
 * shows it. Null for anything else. Built with the local-time constructor rather than parsed,
 * so no engine's reading of a bare date-time string can change the answer.
 */
export function localInputToUnix(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return null;
  // new Date(2026, 1, 31) quietly becomes 3 March; a date that moved was not a real date.
  if (date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) return null;
  return Math.floor(ms / 1000);
}

/** The other way, for an input's `min`: the person's own clock, to the minute. */
export function unixToLocalInput(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * THE START, AS THE CONTRACT TAKES IT. Zero means "when the grant is issued", decided by the
 * chain. Anything else must still be in the future at the moment it is checked: GrantEscrow
 * accepts a start in the past, and one would hand over part of the grant the moment it lands.
 */
export function checkStart(start: number, now: number): Outcome<number> {
  if (start === 0) return yes(0);
  if (!Number.isInteger(start) || start < 0) return no("Pick a date and time.");
  if (start <= now) return no("Pick a start in the future, or leave it empty to start when it's issued.");
  if (start > now + MAX_START_AHEAD_SECONDS) return no("Pick a start within the next ten years.");
  return yes(start);
}

// --- amounts, as the form prints them ----------------------------------------------------

const grouped = (whole: bigint) => whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * Raw token units to a decimal, CUT to `dp` places — never rounded up, because a figure the
 * person receives or is guaranteed must not be stated above what the chain will deliver.
 * A nonzero amount never prints as zero: below the last place, it widens to two significant
 * digits, still cut.
 */
export function floorUnits(raw: bigint, decimals: number, dp = 4): string {
  if (raw < 0n) return `-${floorUnits(-raw, decimals, dp)}`;
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const frac = (raw % scale).toString().padStart(decimals, "0");
  let places = Math.min(dp, decimals);
  if (whole === 0n && raw > 0n && /^0*$/.test(frac.slice(0, places))) {
    const firstDigit = frac.search(/[1-9]/);
    places = Math.min(decimals, firstDigit + 2);
  }
  return places > 0 ? `${grouped(whole)}.${frac.slice(0, places)}` : grouped(whole);
}

/**
 * USD₮0 base units as dollars, exactly: two decimals, more only when the amount has them.
 * "$500.00", "$0.123456". Never rounded, because a button says what will leave the wallet.
 */
export function usdExact(base: bigint): string {
  const whole = base / 1_000_000n;
  const frac = (base % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "").padEnd(2, "0");
  return `$${grouped(whole)}.${frac}`;
}

/** A USD₮0 shortfall rounded UP to the cent, so topping up this much is always enough. */
export function ceilCents(base: bigint): string {
  if (base <= 0n) return "0.00";
  const cents = (base + 9_999n) / 10_000n;
  return `${grouped(cents / 100n)}.${(cents % 100n).toString().padStart(2, "0")}`;
}

/** An OKB shortfall in wei, rounded UP to six decimals: 12_300_000_000_000n is "0.000013". */
export function ceilOkb(wei: bigint): string {
  if (wei <= 0n) return "0";
  const step = 10n ** 12n;
  const micro = (wei + step - 1n) / step;
  const whole = micro / 1_000_000n;
  const frac = (micro % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${grouped(whole)}.${frac}` : grouped(whole);
}

/**
 * What one whole unit cost at a quote, in dollars to the cent: "767.34". Arithmetic on the
 * quote's own two numbers, rounded to the nearest cent, and said with "≈" wherever it is
 * shown. Null when the quote delivers nothing.
 */
export function unitPrice(stableBase: bigint, units: bigint, decimals: number): string | null {
  if (units <= 0n || stableBase < 0n) return null;
  const numerator = stableBase * 10n ** BigInt(decimals) * 100n;
  const denominator = units * 1_000_000n;
  const cents = (numerator + denominator / 2n) / denominator;
  return `${grouped(cents / 100n)}.${(cents % 100n).toString().padStart(2, "0")}`;
}

// --- the route ---------------------------------------------------------------------------

/** The most tokens a certificate prints for a route; the server refuses a longer one. */
export const MAX_ROUTE_TOKENS = 12;
/** And the longest name it prints for one of them. */
export const MAX_ROUTE_TOKEN_LENGTH = 40;

type HopToken = {tokenSymbol?: string; tokenContractAddress?: string} | undefined;

/**
 * THE ROUTE AS TOKENS, "USD₮0 → USDG → wSPYx → SPYx", from the aggregator's hops. Each token
 * is named once, in the order the route first reaches it, so a split through two venues does
 * not print its middle twice. It always starts with what was paid and ends with the stock
 * bought, whatever the hops said. A route too long to print keeps its two ends.
 */
export function routeTokens(
  hops: ReadonlyArray<{fromToken?: HopToken; toToken?: HopToken}>,
  from: {address: string; symbol: string},
  to: {address: string; symbol: string},
): string[] {
  const seen = new Set([from.address.toLowerCase(), to.address.toLowerCase()]);
  const middle: string[] = [];
  for (const hop of hops) {
    for (const token of [hop.fromToken, hop.toToken]) {
      const symbol = token?.tokenSymbol?.trim().slice(0, MAX_ROUTE_TOKEN_LENGTH);
      const key = token?.tokenContractAddress?.toLowerCase() ?? symbol?.toLowerCase();
      if (!key || !symbol || seen.has(key)) continue;
      seen.add(key);
      middle.push(symbol);
    }
  }
  return [from.symbol, ...middle.slice(0, MAX_ROUTE_TOKENS - 2), to.symbol];
}

/**
 * A route as the server will store it: 2 to MAX_ROUTE_TOKENS names, each 1 to
 * MAX_ROUTE_TOKEN_LENGTH printable characters. Anything else is refused whole.
 */
export function checkRoute(hops: unknown): Outcome<string[]> {
  if (!Array.isArray(hops)) return no("A route is a list of token names.");
  if (hops.length < 2 || hops.length > MAX_ROUTE_TOKENS) {
    return no(`A route names 2 to ${MAX_ROUTE_TOKENS} tokens.`);
  }
  const out: string[] = [];
  for (const h of hops) {
    if (typeof h !== "string") return no("A route is a list of token names.");
    const t = h.trim();
    // Letters, digits, marks, currency signs such as ₮, and a few joiners. Nothing else.
    if (t.length === 0 || t.length > MAX_ROUTE_TOKEN_LENGTH || !/^[\p{L}\p{N}\p{M}\p{Sc}._+\- ()]+$/u.test(t)) {
      return no("A token name in the route is not one a certificate can print.");
    }
    out.push(t);
  }
  return yes(out);
}

// --- the person's choice -----------------------------------------------------------------

/**
 * WHOSE STOCK A GRANT IS IN. A person who has signed a choice has said which stock they want
 * to be paid in; a grant in that stock follows their choice, and a grant in any other is the
 * company's decision. The company may make it — a grant is theirs to give — but the form and
 * the record say which it was. (The split in a choice does not apply: a grant is all stock.)
 */
export function grantDecision(
  choice: {asset: string | null} | null,
  asset: string,
): "their-choice" | "company" {
  return choice?.asset && choice.asset.toLowerCase() === asset.toLowerCase() ? "their-choice" : "company";
}

/**
 * The note under the recipient: "They chose NVDAx.", or "They chose NVDAx; you're granting
 * SPYx." Null when they have not chosen.
 */
export function choiceNote(
  choice: {symbol: string | null; asset: string | null} | null,
  granting: {symbol: string; address: string},
): string | null {
  if (!choice) return null;
  if (!choice.asset || !choice.symbol) {
    return "They chose to be paid in dollars, not stock. A grant is always stock.";
  }
  if (choice.asset.toLowerCase() === granting.address.toLowerCase()) return `They chose ${choice.symbol}.`;
  return `They chose ${choice.symbol}; you're granting ${granting.symbol}.`;
}
