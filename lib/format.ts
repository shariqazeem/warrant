/**
 * Shared display formatters, carried from Scrip and re-decimalled for X Layer. Pure and framework-agnostic, so a server component and a
 * client leaf render the SAME string from the same number.
 *
 * Every locale is pinned to "en-US" on purpose: `toLocaleString(undefined, …)` renders
 * "$1,000" on a US server and "$1.000" in a European browser, which is a hydration mismatch
 * on every SSR-ed amount.
 */

const group = (v: number, min: number, max: number): string =>
  v.toLocaleString("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });

/** USD in prose. Whole amounts read clean ($500); fractional amounts always show cents. */
export const usd = (n: number): string => {
  const v = Math.round(n * 100) / 100;
  return `${v < 0 ? "-" : ""}$${group(Math.abs(v), Number.isInteger(v) ? 0 : 2, 2)}`;
};

/** The same amount with the cents ALWAYS shown, for stacked or aligned columns. */
export const usdAligned = (n: number): string => `$${group(Math.round(n * 100) / 100, 2, 2)}`;

/** USDT's own precision on X Layer. A payment cannot be smaller than one of these. */
export const STABLE_DP = 6;

/**
 * USDT base units → dollars in prose. SIX decimals on X Layer, not eighteen — reading this
 * wrong renders a payment a million times its size, so the decimals are never inferred.
 *
 * A NONZERO PAYMENT NEVER RENDERS AS "$0". Rounding to cents turns $0.000001 into "$0",
 * which on a stub anchored to a real transaction reads as "nothing was paid" — a number
 * the chain does not agree with. Below a cent, the figure widens to the precision that
 * shows it rather than collapsing.
 */
export const usdt = (base: bigint | number): string => {
  const raw = BigInt(base);
  if (raw !== 0n && raw < 10_000n && raw > -10_000n) {
    const v = Number(raw) / 1e6;
    const text = v.toFixed(STABLE_DP).replace(/0+$/, "").replace(/\.$/, "");
    return `${v < 0 ? "-" : ""}$${text.replace("-", "")}`;
  }
  return usd(Number(raw) / 1e6);
};

export const usdtAligned = (base: bigint | number): string => usdAligned(Number(base) / 1e6);

/**
 * UNITS OF THE ASSET — the largest thing on any page they appear on.
 *
 * Four decimals resolves well under a cent at the prices on this rail: 1 wNVDAx is a few
 * hundred dollars, so 0.0001 is a few cents — under the dollar a reader would care about,
 * and four places is what a stub can carry. Trailing zeros are kept: a ragged decimal
 * column is how a reader misreads a balance.
 */
export const UNIT_DP = 4;
/** The most places a holding is ever printed at; below this it is dust. */
export const UNIT_DP_MAX = 8;
export const units = (n: number, dp = UNIT_DP): string => group(n, dp, dp);

/** Raw token units → a display number at the MINT's decimals. */
export const fromBase = (base: bigint | number, decimals: number): number =>
  Number(base) / 10 ** decimals;

/**
 * The places a holding needs: four, or as many as it takes to show four significant
 * figures, up to eight. At four places a small grant prints fewer digits than its own
 * vesting counter, and "0.0038873 vested of 0.0038" reads as more vested than was granted.
 */
export function unitPlaces(raw: bigint, decimals: number): number {
  const abs = raw < 0n ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  if (abs === 0n || abs >= base) return UNIT_DP;
  const leadingZeros = decimals - abs.toString().length;
  return Math.min(UNIT_DP_MAX, Math.max(UNIT_DP, leadingZeros + UNIT_DP));
}

/**
 * Raw units at the mint's decimals → "0.6516", "0.003887". ONE RULE WHEREVER A HOLDING IS
 * PRINTED, on a certificate, a payslip or the public record: ROUNDED DOWN, never up, because
 * each of them says what someone holds and a figure rounded up is one the chain does not
 * agree with. (Grant No. 000004 held 0.003887 SPYx. Rounding printed 0.0039 on the record
 * while its certificate said 0.0038: two figures for one grant, on one page.)
 */
export const unitsFromRaw = (raw: bigint | number, decimals: number, dp?: number): string => {
  const exact = typeof raw === "bigint" ? raw : BigInt(Math.trunc(raw));
  const places = dp ?? unitPlaces(exact, decimals);
  const negative = exact < 0n;
  const abs = negative ? -exact : exact;
  const base = 10n ** BigInt(decimals);
  const whole = (abs / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = negative ? "-" : "";
  if (places <= 0) return `${sign}${whole}`;
  const fraction = (abs % base).toString().padStart(decimals, "0").padEnd(places, "0").slice(0, places);
  return `${sign}${whole}.${fraction}`;
};

/** Basis points as a percentage: 1000 → "10%", 2550 → "25.5%". */
export const bps = (n: number): string => `${group(n / 100, 0, 2)}%`;

/** Wei → OKB, the gas token on X Layer. */
export const okb = (wei: bigint | number): string => `${group(Number(wei) / 1e18, 4, 6)} OKB`;

/** Shorten an address or a transaction hash: "0x1E4a59…D41d". */
export const short = (a: string): string => (a.length > 12 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a);

/**
 * What one whole unit cost, from what was actually paid and what actually arrived. This is
 * arithmetic on a settled payment, not a quote and not a projection — the only kind of
 * price a Warrant surface is allowed to print.
 */
export const settledUnitPrice = (
  stableBase: bigint,
  assetBase: bigint,
  assetDecimals: number,
): number | null => {
  if (assetBase <= 0n) return null;
  return Number(stableBase) / 1e6 / fromBase(assetBase, assetDecimals);
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "15 Sep 2026" — fixed month names, UTC. */
export const dateUTC = (unixSeconds: number): string => {
  const d = new Date(unixSeconds * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]!} ${d.getUTCFullYear()}`;
};

/** A grant shorter than two days is told in clock times rather than dates. */
export function isShortGrant(durationSeconds: number): boolean {
  return durationSeconds < 2 * 86_400;
}

/** "14:05 UTC". */
export function timeUTC(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
}

/** A moment on a grant's schedule: a date, or a clock time for a short grant. */
export function whenLabel(unixSeconds: number, durationSeconds: number): string {
  return isShortGrant(durationSeconds) ? timeUTC(unixSeconds) : dateUTC(unixSeconds);
}

const DAY = 86_400;
/** Average Gregorian month, in days. */
const MONTH = 30.436875;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * A schedule's length in the words a person uses: "2 years", "6 months", "45 days",
 * "2 hours", "90 minutes". Words, not a figure: the exact dates sit on the rule beside it.
 *
 * THE ONLY ONE. The certificate, the public record, a company's page and the share cards
 * all say a grant's length with this; an older copy that rounded to whole days printed a
 * 10-minute grant as "vesting over immediately" on the record while its certificate said
 * "over 10 minutes".
 */
export function lengthWords(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 2 * DAY) {
    if (s % 3600 === 0 && s > 0) return plural(s / 3600, "hour");
    if (s % 60 === 0 && s > 0) return plural(s / 60, "minute");
    return plural(s, "second");
  }
  const days = s / DAY;
  const months = Math.round(days / MONTH);
  if (months >= 1 && Math.abs(days - months * MONTH) <= Math.min(3, months * 0.5)) {
    return months % 12 === 0 ? plural(months / 12, "year") : plural(months, "month");
  }
  if (Number.isInteger(days)) return plural(days, "day");
  return plural(Math.floor(s / 3600), "hour");
}

/** "on 24 Mar 2027" for a date, "at 17:57 UTC" for a time of day: the preposition a label takes. */
export function onOrAt(label: string): string {
  return /\d{1,2}:\d{2}/.test(label) ? `at ${label}` : `on ${label}`;
}

/** "15 Sep 2026, 09:13 UTC". Receipts get the whole truth. */
export const stampUTC = (unixSeconds: number): string => {
  const d = new Date(unixSeconds * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${dateUTC(unixSeconds)}, ${hh}:${mm} UTC`;
};

/** "3 min ago", "2 h ago", "4 days ago", else a date. `now` is injectable for tests. */
export const since = (unixSeconds: number, now: number = Date.now()): string => {
  const secs = Math.max(0, Math.floor(now / 1000) - unixSeconds);
  if (secs < 45) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  return dateUTC(unixSeconds);
};

/** "48 s", "3 min", "2 h" — an age, for a caption beside a price. */
export const age = (seconds: number): string => {
  if (seconds < 90) return `${Math.max(0, Math.floor(seconds))} s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 90) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} days`;
};

/**
 * A run id is bytes32. When a person named the run it is left-aligned ASCII with zero
 * padding, and the name is what anyone refers to it by; when it is not, the hex is all
 * there is. Decode the first case and short-hex the second.
 */
export const runLabel = (runId: string): string => {
  const hex = runId.replace(/^0x/, "");
  if (hex.length !== 64) return short(runId);
  const bytes = hex.match(/.{2}/g) ?? [];
  const chars: string[] = [];
  for (const b of bytes) {
    const code = parseInt(b, 16);
    if (code === 0) break;
    // printable ASCII only; anything else means this was never a name
    if (code < 0x20 || code > 0x7e) return short(runId);
    chars.push(String.fromCharCode(code));
  }
  return chars.length > 0 ? chars.join("") : short(runId);
};

/** Capitalize the first letter. */
export const cap = (s: string): string => (s ? `${s[0]!.toUpperCase()}${s.slice(1)}` : s);
