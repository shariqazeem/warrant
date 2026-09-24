/**
 * THE CERTIFICATE'S SENTENCES, built from its data and nothing else.
 *
 * Pure, so the page, the share card and the tests all say exactly the same thing, and so
 * each state's wording is checked (components/cert/cert-text.test.ts). Every number in these
 * sentences is a field of the data; nothing is estimated here.
 */
import {dateUTC} from "../../lib/format";
import {formatUnitsFixed, type PoolState, type VestingTerms} from "../../lib/vesting";
import type {CertificateData} from "./types";

const DAY = 86_400;

/** "000001": the grant id, six digits. A specimen is 000000. */
export function certNumber(id: number, specimen = false): string {
  if (specimen) return "000000";
  return String(Math.max(0, Math.floor(id))).padStart(6, "0");
}

/** "0x7c1E…9aB2": the design's short form, the first four and the last four. */
export function shortAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** A grant shorter than two days is told in clock times rather than dates. */
export function isShortGrant(durationSeconds: number): boolean {
  return durationSeconds < 2 * DAY;
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Average Gregorian month, in days. */
const MONTH = 30.436875;

/**
 * A schedule's length in the words a person uses: "2 years", "6 months", "45 days",
 * "2 hours", "90 minutes". Words, not a figure: the exact dates sit on the rule beside it.
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

/** "0.6516": units at four places, rounded down; "—" while unknown. */
export function unitsText(d: Pick<CertificateData, "units" | "asset">, dp = 4): string {
  return d.units === null ? "—" : formatUnitsFixed(d.units, d.asset.decimals, dp);
}

/** "$1,000.00": USD₮0 base units, rounded down to the cent. */
export function costText(stableCost: bigint): string {
  return `$${formatUnitsFixed(stableCost, 6, 2)}`;
}

/**
 * LINE ONE: what was bought, for how much, through what, at what price.
 * "S&P 500 xStock, bought for $1,000.00 USDT through OKX DEX at $767.34 a unit."
 */
export function purchaseLine(
  d: Pick<CertificateData, "asset" | "units" | "stableCost" | "unitPriceUsd">,
  {withPrice = true}: {withPrice?: boolean} = {},
): string {
  const name = d.asset.name;
  if (d.units === null) return `${name}, bought through OKX DEX when it is issued.`;
  if (d.stableCost === null) return `${name}, bought through OKX DEX.`;
  const price = withPrice && d.unitPriceUsd ? ` at $${d.unitPriceUsd} a unit` : "";
  return `${name}, bought for ${costText(d.stableCost)} USDT through OKX DEX${price}.`;
}

/** The route, token by token, or null when there is none to print. */
export function routeLine(route: readonly string[]): string | null {
  const hops = route.map((r) => r.trim()).filter(Boolean);
  return hops.length >= 2 ? hops.join(" → ") : null;
}

/** "on 24 Mar 2027" for a date, "at 17:57 UTC" for a time of day: the preposition a label takes. */
export function onOrAt(label: string): string {
  return /\d{1,2}:\d{2}/.test(label) ? `at ${label}` : `on ${label}`;
}

/**
 * LINE TWO: the schedule, or what happened to it.
 * "Vests every second over 2 years. Nothing unlocks before the cliff on 24 Mar 2027."
 */
export function scheduleLine(
  d: Pick<CertificateData, "start" | "cliffSeconds" | "durationSeconds" | "revoked" | "closed">,
): string {
  if (d.revoked && d.closed) {
    return "Cancelled by the grantor, and everything that had vested has been released to them.";
  }
  if (d.revoked) {
    return "Cancelled by the grantor. What had vested stays theirs; the rest went back.";
  }
  if (d.closed) return "Fully vested and released. Every unit it held is in their wallet.";
  const length = lengthWords(d.durationSeconds);
  if (d.cliffSeconds > 0 && d.cliffSeconds < d.durationSeconds) {
    const cliff = whenLabel(d.start + d.cliffSeconds, d.durationSeconds);
    return `Vests every second over ${length}. Nothing unlocks before the cliff ${onOrAt(cliff)}.`;
  }
  return `Vests every second over ${length}, with no cliff.`;
}

/** The schedule's terms as lib/vesting reads them, when the data carries them. */
export function vestingTerms(d: CertificateData): VestingTerms | null {
  if (d.shares === undefined || d.sharesReleased === undefined) return null;
  return {
    shares: d.shares,
    sharesReleased: d.sharesReleased,
    start: d.start,
    cliffSeconds: d.cliffSeconds,
    durationSeconds: d.durationSeconds,
    revoked: d.revoked,
    frozenVestedShares: d.frozenVestedShares ?? 0n,
  };
}

/** The pool the grant's shares are priced against, when the data carries it. */
export function poolState(d: CertificateData): PoolState | null {
  if (d.poolShares === undefined || d.escrowBalance === undefined) return null;
  return {poolShares: d.poolShares, escrowBalance: d.escrowBalance};
}

/** What the seal says, in each state a certificate can be in. */
export type SealState = "sealed" | "revocable" | "pending" | "cancelled" | "closed" | "vested";

export function sealState(
  d: Pick<CertificateData, "sealed" | "revoked" | "closed" | "start" | "durationSeconds">,
  {sealPending = false, now}: {sealPending?: boolean; now: number},
): SealState {
  if (d.sealed) return "sealed";
  if (sealPending) return "pending";
  if (d.revoked) return "cancelled";
  if (d.closed) return "closed";
  if (now >= d.start + d.durationSeconds) return "vested";
  return "revocable";
}

/** The two lines inside an unsealed outline, and its accessible name. */
export const SEAL_WORDS: Record<Exclude<SealState, "sealed">, {a: string; b: string; label: string}> = {
  revocable: {a: "Revocable", b: "until sealed", label: "Revocable until sealed"},
  pending: {a: "To be sealed", b: "after issuing", label: "To be sealed after issuing"},
  cancelled: {a: "Cancelled", b: "vested part kept", label: "Cancelled; what had vested stays theirs"},
  closed: {a: "Closed", b: "all released", label: "Closed; everything was released"},
  vested: {a: "Fully vested", b: "all of it theirs", label: "Fully vested; all of it is theirs"},
};

/** A one-sentence description of the whole certificate, for its accessible name. */
export function certificateLabel(d: CertificateData, specimen: boolean): string {
  const no = certNumber(d.id, specimen);
  const who = d.recipient ?? "their wallet address";
  const what = d.units === null ? d.asset.symbol : `${unitsText(d)} ${d.asset.symbol}`;
  return (
    `${specimen ? "Specimen certificate" : "Certificate of grant"} No. ${no}: ` +
    `${who} is granted ${what}. ${scheduleLine(d)}` +
    (d.sealed ? " Sealed and irrevocable." : "")
  );
}
