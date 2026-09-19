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

/**
 * USDT base units → dollars in prose. SIX decimals on X Layer, not eighteen — reading this
 * wrong renders a payment a million times its size, so the decimals are never inferred.
 */
export const usdt = (base: bigint | number): string => usd(Number(base) / 1e6);
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
export const units = (n: number, dp = UNIT_DP): string => group(n, dp, dp);

/** Raw token units → a display number at the MINT's decimals. */
export const fromBase = (base: bigint | number, decimals: number): number =>
  Number(base) / 10 ** decimals;

/** Raw units at the mint's decimals → "0.0262". */
export const unitsFromRaw = (raw: bigint | number, decimals: number, dp = UNIT_DP): string =>
  units(fromBase(raw, decimals), dp);

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

/** Capitalize the first letter. */
export const cap = (s: string): string => (s ? `${s[0]!.toUpperCase()}${s.slice(1)}` : s);
