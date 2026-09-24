/**
 * WHAT THE KEEPER LAST DID, as it wrote it down.
 *
 * The keeper (scripts/keeper.ts) writes var/keeper.json after every pass; the site reads it
 * here. One file shape, defined once, read by both, so the writer and the reader cannot
 * drift. Everything in this module except `readKeeperStatus` is pure and has no clock of its
 * own: the caller passes `now`, so the tests can stand anywhere in time.
 *
 * A GRANT DOES NOT DEPEND ON ANY OF THIS. `vest` is permissionless, so a person can always
 * release their own grant. The keeper is a convenience, and this file is how a page can say
 * honestly whether that convenience is running.
 */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

/** Relative to the process's working directory: the repo root, for the site and the keeper. */
export const KEEPER_FILE = "var/keeper.json";

/** A page calls the keeper alive when its last good pass is at most this old. */
export const KEEPER_ALIVE_SECONDS = 15 * 60;

/** How many releases the file keeps, newest first. */
export const KEEPER_RELEASES_KEPT = 20;

/** At most one Telegram alert in this many seconds. */
export const ALERT_WINDOW_SECONDS = 30 * 60;

/** One `vest` the keeper sent, as the Vested event reported it. Units are base-unit integers. */
export type KeeperRelease = {
  grantId: number;
  tx: `0x${string}`;
  /** Unix seconds, when the receipt came back. */
  at: number;
  /** Units of the grant's stock that reached the person, as a decimal integer string. */
  toBeneficiary: string;
  /** Units paid to the keeper as its tip, as a decimal integer string. */
  toCaller: string;
};

export type KeeperFile = {
  /** Unix seconds of the last pass that read the escrow cleanly, or null if none has. */
  lastPassAt: number | null;
  /** Unix seconds of the last release the keeper sent, or null if it never has. */
  lastReleaseAt: number | null;
  /** Why the most recent pass failed, or null when it did not. */
  lastError: string | null;
  /** The keeper's OKB balance in wei at the last pass, as a decimal string; null when unknown. */
  balanceWei: string | null;
  /** The keeper's address; null when it runs without a key. */
  address: string | null;
  /** True when the last pass could have sent: --send, a key, and enough OKB for gas. */
  sending: boolean;
  /** The newest releases, newest first, at most KEEPER_RELEASES_KEPT. */
  releases: KeeperRelease[];
};

export const EMPTY_KEEPER_FILE: KeeperFile = {
  lastPassAt: null,
  lastReleaseAt: null,
  lastError: null,
  balanceWei: null,
  address: null,
  sending: false,
  releases: [],
};

const seconds = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const units = (v: unknown): string | null => (typeof v === "string" && /^[0-9]+$/.test(v) ? v : null);

function release(v: unknown): KeeperRelease | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  const grantId = seconds(r.grantId);
  const at = seconds(r.at);
  const tx = typeof r.tx === "string" && /^0x[0-9a-fA-F]{64}$/.test(r.tx) ? (r.tx as `0x${string}`) : null;
  const toBeneficiary = units(r.toBeneficiary);
  const toCaller = units(r.toCaller);
  if (grantId === null || at === null || !tx || toBeneficiary === null || toCaller === null) return null;
  return {grantId, tx, at, toBeneficiary, toCaller};
}

/**
 * The file, read defensively. Anything that is not the shape above becomes null field by
 * field, and a file that is not JSON at all is null: a half-written or hand-edited file must
 * never make a page claim something the keeper did not write.
 */
export function parseKeeperFile(raw: string): KeeperFile | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const f = v as Record<string, unknown>;
  const releases = Array.isArray(f.releases)
    ? f.releases.map(release).filter((r): r is KeeperRelease => r !== null).slice(0, KEEPER_RELEASES_KEPT)
    : [];
  return {
    lastPassAt: seconds(f.lastPassAt),
    lastReleaseAt: seconds(f.lastReleaseAt),
    lastError: text(f.lastError),
    balanceWei: units(f.balanceWei),
    address: typeof f.address === "string" && /^0x[0-9a-fA-F]{40}$/.test(f.address) ? f.address : null,
    sending: f.sending === true,
    releases,
  };
}

export type KeeperStatus = {alive: boolean; lastPassAt: number | null; lastReleaseAt: number | null};

/**
 * What a page may say about the keeper.
 *
 * ALIVE means releasing, not merely running: its last clean pass was within 15 minutes AND
 * that pass could send. A dry run, a keeper with no key, or one out of gas money is not
 * alive, because a page that says grants are released automatically must be telling the
 * truth. A missing or malformed file is simply not alive; this never throws.
 */
export function keeperStatus(file: KeeperFile | null, now: number): KeeperStatus {
  if (!file) return {alive: false, lastPassAt: null, lastReleaseAt: null};
  const fresh = file.lastPassAt !== null && now - file.lastPassAt <= KEEPER_ALIVE_SECONDS;
  return {alive: fresh && file.sending, lastPassAt: file.lastPassAt, lastReleaseAt: file.lastReleaseAt};
}

/** var/keeper.json, relative to the app's working directory. Safe when it is missing. */
export function readKeeperStatus(
  now = Math.floor(Date.now() / 1000),
  path = resolve(process.cwd(), KEEPER_FILE),
): KeeperStatus {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return keeperStatus(null, now);
  }
  return keeperStatus(parseKeeperFile(raw), now);
}

export type HealthVerdict = {ok: boolean; why: string[]};

/**
 * THE HEALTH VERDICT the keeper serves on /health. Not ok when:
 *   - no pass has read the escrow cleanly yet, or the last one is older than 3× the interval;
 *   - it is meant to send and has no key;
 *   - its balance is unknown or below the minimum (it has stopped sending to keep a reserve).
 * One failed pass is not enough to turn it red: a throttled minute is ordinary, and a checker
 * that pages on it teaches people to ignore the page. Three intervals without a clean pass is.
 * Each reason is a sentence, so the answer to "why is it red" is in the response itself.
 */
export function healthVerdict(
  file: KeeperFile,
  o: {now: number; intervalSeconds: number; minBalanceWei: bigint; send: boolean},
): HealthVerdict {
  const why: string[] = [];
  if (file.lastPassAt === null) {
    why.push("No pass has read the escrow cleanly yet.");
  } else if (o.now - file.lastPassAt > 3 * o.intervalSeconds) {
    why.push(`The last clean pass was ${o.now - file.lastPassAt}s ago; passes run every ${o.intervalSeconds}s.`);
  }
  if (o.send && file.address === null) why.push("It is meant to send but has no KEEPER_PRIVATE_KEY.");
  if (file.address !== null) {
    if (file.balanceWei === null) why.push("Its OKB balance could not be read.");
    else if (BigInt(file.balanceWei) < o.minBalanceWei) why.push("Its OKB balance is below the minimum.");
  }
  return {ok: why.length === 0, why};
}

/**
 * THE KEEPER'S RELEASES, newest first and capped. A release already in the list (the same
 * transaction) is not added twice, so writing the file again after a restart is harmless.
 */
export function withRelease(releases: readonly KeeperRelease[], r: KeeperRelease): KeeperRelease[] {
  return [r, ...releases.filter((x) => x.tx.toLowerCase() !== r.tx.toLowerCase())].slice(0, KEEPER_RELEASES_KEPT);
}

export type AlertKind = "failing" | "low-balance";

/**
 * WHETHER TO SEND A TELEGRAM ALERT NOW, and which.
 *   - "failing" when two or more passes in a row have failed;
 *   - "low-balance" when the balance is below the minimum;
 * and at most one alert of any kind per ALERT_WINDOW_SECONDS, so a keeper that stays broken
 * for a night sends sixteen messages, not nine hundred. Failing wins when both are true: it
 * is the one that stops grants being released for a reason a top-up will not fix.
 */
export function alertDue(o: {
  failuresInARow: number;
  balanceLow: boolean;
  lastAlertAt: number | null;
  now: number;
  windowSeconds?: number;
}): AlertKind | null {
  const window = o.windowSeconds ?? ALERT_WINDOW_SECONDS;
  if (o.lastAlertAt !== null && o.now - o.lastAlertAt < window) return null;
  if (o.failuresInARow >= 2) return "failing";
  if (o.balanceLow) return "low-balance";
  return null;
}
