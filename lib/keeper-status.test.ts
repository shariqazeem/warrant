/**
 * WHAT A PAGE MAY SAY ABOUT THE KEEPER, AND WHEN THE KEEPER CALLS FOR HELP.
 *
 * The file is written by one process and read by another, so the reader is tested against
 * everything a file can turn out to be: missing, half-written, hand-edited, stale, or the
 * record of a keeper that runs but cannot send. The health verdict and the alert throttle
 * are pure, so they are tested at chosen moments rather than by waiting.
 */
import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterAll, describe, expect, it} from "vitest";
import {
  ALERT_WINDOW_SECONDS,
  EMPTY_KEEPER_FILE,
  KEEPER_ALIVE_SECONDS,
  KEEPER_RELEASES_KEPT,
  alertDue,
  healthVerdict,
  keeperStatus,
  parseKeeperFile,
  readKeeperStatus,
  withRelease,
  type KeeperFile,
  type KeeperRelease,
} from "./keeper-status";

const NOW = 1_790_000_000;
const KEEPER = "0x00000000000000000000000000000000000000c3";
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;
const rel = (n: number, at = NOW): KeeperRelease => ({grantId: n, tx: tx(n), at, toBeneficiary: "990", toCaller: "10"});

const running: KeeperFile = {
  ...EMPTY_KEEPER_FILE,
  lastPassAt: NOW - 30,
  lastReleaseAt: NOW - 3_600,
  balanceWei: "5000000000000000",
  address: KEEPER,
  sending: true,
  releases: [rel(1, NOW - 3_600)],
};

const dir = mkdtempSync(join(tmpdir(), "warrant-keeper-status-"));
afterAll(() => rmSync(dir, {recursive: true, force: true}));

describe("parseKeeperFile", () => {
  it("reads back what the keeper writes", () => {
    expect(parseKeeperFile(JSON.stringify(running))).toEqual(running);
  });

  it("is null for a file that is not a JSON object", () => {
    expect(parseKeeperFile("")).toBeNull();
    expect(parseKeeperFile('{"lastPassAt": 17')).toBeNull();
    expect(parseKeeperFile("[]")).toBeNull();
    expect(parseKeeperFile("null")).toBeNull();
  });

  it("drops fields and releases that are not the shape, rather than trusting them", () => {
    const f = parseKeeperFile(
      JSON.stringify({
        lastPassAt: "yesterday",
        lastReleaseAt: -5,
        lastError: 42,
        balanceWei: "1.5",
        address: "not an address",
        sending: "yes",
        releases: [rel(2), {grantId: 3, tx: "0x12", at: NOW, toBeneficiary: "1", toCaller: "0"}, null],
      }),
    );
    expect(f).toEqual({...EMPTY_KEEPER_FILE, releases: [rel(2)]});
  });

  it("keeps at most twenty releases", () => {
    const many = Array.from({length: 30}, (_, i) => rel(i + 1));
    expect(parseKeeperFile(JSON.stringify({...running, releases: many}))!.releases).toHaveLength(KEEPER_RELEASES_KEPT);
  });
});

describe("keeperStatus", () => {
  it("is alive when the last clean pass is within fifteen minutes and it could send", () => {
    expect(keeperStatus(running, NOW)).toEqual({alive: true, lastPassAt: NOW - 30, lastReleaseAt: NOW - 3_600});
    expect(keeperStatus({...running, lastPassAt: NOW - KEEPER_ALIVE_SECONDS}, NOW).alive).toBe(true);
  });

  it("is not alive once the last pass is older than fifteen minutes", () => {
    expect(keeperStatus({...running, lastPassAt: NOW - KEEPER_ALIVE_SECONDS - 1}, NOW).alive).toBe(false);
  });

  it("is not alive when it runs but cannot release: a dry run, no key, or no gas money", () => {
    expect(keeperStatus({...running, sending: false}, NOW).alive).toBe(false);
  });

  it("is not alive, and claims no times, without a file", () => {
    expect(keeperStatus(null, NOW)).toEqual({alive: false, lastPassAt: null, lastReleaseAt: null});
    expect(keeperStatus({...running, lastPassAt: null}, NOW).alive).toBe(false);
  });
});

describe("readKeeperStatus", () => {
  it("reads the file at the path it is given", () => {
    const path = join(dir, "keeper.json");
    writeFileSync(path, JSON.stringify(running));
    expect(readKeeperStatus(NOW, path)).toEqual({alive: true, lastPassAt: NOW - 30, lastReleaseAt: NOW - 3_600});
  });

  it("is safe when the file is missing or malformed", () => {
    expect(readKeeperStatus(NOW, join(dir, "missing.json"))).toEqual({alive: false, lastPassAt: null, lastReleaseAt: null});
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{\"lastPassAt\": ");
    expect(readKeeperStatus(NOW, bad)).toEqual({alive: false, lastPassAt: null, lastReleaseAt: null});
  });

  it("defaults to var/keeper.json under the working directory, and never throws", () => {
    expect(() => readKeeperStatus()).not.toThrow();
  });
});

describe("healthVerdict", () => {
  const at = {now: NOW, intervalSeconds: 60, minBalanceWei: 2_000_000_000_000_000n, send: true};

  it("is ok for a keeper that passed recently and holds enough OKB", () => {
    expect(healthVerdict(running, at)).toEqual({ok: true, why: []});
  });

  it("goes red when the last clean pass is older than three intervals, not before", () => {
    expect(healthVerdict({...running, lastPassAt: NOW - 180}, at).ok).toBe(true);
    const r = healthVerdict({...running, lastPassAt: NOW - 181}, at);
    expect(r.ok).toBe(false);
    expect(r.why[0]).toContain("181s ago");
  });

  it("goes red before any clean pass", () => {
    expect(healthVerdict({...running, lastPassAt: null}, at).ok).toBe(false);
  });

  it("goes red when the balance is below the minimum, or unknown", () => {
    expect(healthVerdict({...running, balanceWei: "1999999999999999"}, at).why).toEqual([
      "Its OKB balance is below the minimum.",
    ]);
    expect(healthVerdict({...running, balanceWei: "2000000000000000"}, at).ok).toBe(true);
    expect(healthVerdict({...running, balanceWei: null}, at).ok).toBe(false);
  });

  it("goes red when it is meant to send and has no key, but not for a dry run", () => {
    const keyless = {...running, address: null, balanceWei: null, sending: false};
    expect(healthVerdict(keyless, at).ok).toBe(false);
    expect(healthVerdict(keyless, {...at, send: false}).ok).toBe(true);
  });

  it("does not go red on one failed pass: the staleness rule catches a keeper that keeps failing", () => {
    expect(healthVerdict({...running, lastError: "over rate limit"}, at).ok).toBe(true);
  });
});

describe("alertDue", () => {
  it("alerts after two failed passes in a row, not one", () => {
    expect(alertDue({failuresInARow: 1, balanceLow: false, lastAlertAt: null, now: NOW})).toBeNull();
    expect(alertDue({failuresInARow: 2, balanceLow: false, lastAlertAt: null, now: NOW})).toBe("failing");
  });

  it("alerts on a low balance", () => {
    expect(alertDue({failuresInARow: 0, balanceLow: true, lastAlertAt: null, now: NOW})).toBe("low-balance");
    expect(alertDue({failuresInARow: 0, balanceLow: false, lastAlertAt: null, now: NOW})).toBeNull();
  });

  it("says failing when both are true", () => {
    expect(alertDue({failuresInARow: 3, balanceLow: true, lastAlertAt: null, now: NOW})).toBe("failing");
  });

  it("sends at most one alert per thirty minutes, of any kind", () => {
    const last = NOW - ALERT_WINDOW_SECONDS + 1;
    expect(alertDue({failuresInARow: 5, balanceLow: true, lastAlertAt: last, now: NOW})).toBeNull();
    expect(alertDue({failuresInARow: 5, balanceLow: true, lastAlertAt: NOW - ALERT_WINDOW_SECONDS, now: NOW})).toBe(
      "failing",
    );
  });
});

describe("withRelease", () => {
  it("puts the newest first, keeps twenty, and never lists one transaction twice", () => {
    let list: KeeperRelease[] = [];
    for (let i = 1; i <= 25; i++) list = withRelease(list, rel(i));
    expect(list).toHaveLength(KEEPER_RELEASES_KEPT);
    expect(list[0]!.grantId).toBe(25);
    expect(list.at(-1)!.grantId).toBe(6);

    const again = withRelease(list, {...rel(25), tx: tx(25).toUpperCase().replace("0X", "0x") as `0x${string}`});
    expect(again).toHaveLength(KEEPER_RELEASES_KEPT);
    expect(again.filter((r) => r.grantId === 25)).toHaveLength(1);
  });
});
