/**
 * THE VESTING MATHS THE CERTIFICATE SHOWS, held to the contract three ways: the fixture the
 * Solidity test reads, hand-worked cases for every phase of a grant, and the older
 * lib/schedule.ts over thousands of moments. The fork proof (scripts/prove-vesting-fork.ts)
 * then holds it to the deployed contract's own view functions.
 */
import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {vestedSharesAt, type Schedule} from "./schedule";
import {
  accruedShares,
  accruedUnitsAt,
  formatUnitsFixed,
  heldUnits,
  releasableShares,
  releasableUnits,
  releaseFee,
  revokePreview,
  SHARE_OFFSET,
  sharesForDeposit,
  sharesToUnits,
  vestedShares,
  vestedUnitsAt,
  vestingPhase,
  type PoolState,
  type VestingTerms,
} from "./vesting";

type Fixture = {
  shares: string;
  start: number;
  cliffSeconds: number;
  durationSeconds: number;
  at: number[];
  vested: string[];
  notes: string[];
};

const fx = JSON.parse(readFileSync("contracts/test/fixtures/schedule.json", "utf8")) as Fixture;

const fixtureTerms: VestingTerms = {
  shares: BigInt(fx.shares),
  sharesReleased: 0n,
  start: fx.start,
  cliffSeconds: fx.cliffSeconds,
  durationSeconds: fx.durationSeconds,
  revoked: false,
  frozenVestedShares: 0n,
};

/** A grant as it is opened into an empty pool: 1.3032 SPYx (18 decimals). */
const DEPOSIT = 1_303_200_000_000_000_000n;
const OPEN_SHARES = sharesForDeposit(DEPOSIT, 0n, 0n);
const EMPTY_POOL_AFTER: PoolState = {poolShares: OPEN_SHARES, escrowBalance: DEPOSIT};

const START = 1_790_000_000;
const DAY = 86_400;
const grant = (over: Partial<VestingTerms> = {}): VestingTerms => ({
  shares: OPEN_SHARES,
  sharesReleased: 0n,
  start: START,
  cliffSeconds: 180 * DAY,
  durationSeconds: 730 * DAY,
  revoked: false,
  frozenVestedShares: 0n,
  ...over,
});

describe("the shared fixture, which the Solidity test reads too", () => {
  it("is not ragged", () => {
    expect(fx.vested).toHaveLength(fx.at.length);
    expect(fx.notes).toHaveLength(fx.at.length);
  });

  for (const [i, at] of fx.at.entries()) {
    it(fx.notes[i]!, () => {
      expect(vestedShares(fixtureTerms, at).toString()).toBe(fx.vested[i]);
    });
  }
});

describe("every phase of a grant", () => {
  const g = grant();
  const cliff = START + 180 * DAY;
  const end = START + 730 * DAY;

  it("vests nothing before the start", () => {
    expect(vestedShares(g, START - 1)).toBe(0n);
    expect(vestingPhase(g, START - 1)).toBe("not-started");
  });

  it("vests nothing one second before the cliff, while it accrues", () => {
    expect(vestedShares(g, cliff - 1)).toBe(0n);
    expect(vestingPhase(g, cliff - 1)).toBe("accruing");
    // What is accruing is what the cliff will pay at once, a second later.
    expect(accruedShares(g, cliff - 1)).toBe((OPEN_SHARES * BigInt(180 * DAY - 1)) / BigInt(730 * DAY));
  });

  it("pays the whole elapsed share at the cliff", () => {
    expect(vestedShares(g, cliff)).toBe((OPEN_SHARES * BigInt(180 * DAY)) / BigInt(730 * DAY));
    expect(vestedShares(g, cliff)).toBe(accruedShares(g, cliff));
    expect(vestingPhase(g, cliff)).toBe("vesting");
  });

  it("is linear after the cliff and half vested midway", () => {
    expect(vestedShares(g, START + 365 * DAY)).toBe(OPEN_SHARES / 2n);
    expect(vestedShares(g, cliff + 1)).toBe((OPEN_SHARES * BigInt(180 * DAY + 1)) / BigInt(730 * DAY));
  });

  it("is complete at the end, and never more than complete after it", () => {
    expect(vestedShares(g, end - 1)).toBeLessThan(OPEN_SHARES);
    expect(vestedShares(g, end)).toBe(OPEN_SHARES);
    expect(vestedShares(g, end + 10 * 365 * DAY)).toBe(OPEN_SHARES);
    expect(vestingPhase(g, end)).toBe("vested");
  });

  it("with no cliff, vests from the first second", () => {
    const now = grant({cliffSeconds: 0});
    expect(vestedShares(now, START)).toBe(0n);
    expect(vestedShares(now, START + 1)).toBe(OPEN_SHARES / BigInt(730 * DAY));
    expect(vestingPhase(now, START)).toBe("vesting");
  });

  it("reads a fractional clock as the chain would: whole seconds", () => {
    expect(vestedShares(g, cliff + 0.999)).toBe(vestedShares(g, cliff));
    expect(() => vestedUnitsAt(g, EMPTY_POOL_AFTER, Date.now() / 1000)).not.toThrow();
  });
});

describe("releases, a revoke and the fee", () => {
  const mid = START + 365 * DAY;

  it("releases only what vested and was not yet released", () => {
    const half = OPEN_SHARES / 2n;
    const g = grant({sharesReleased: half / 2n});
    expect(releasableShares(g, mid)).toBe(half - half / 2n);
    // Released everything vested: nothing due until more vests.
    const caughtUp = grant({sharesReleased: vestedShares(grant(), mid)});
    expect(releasableShares(caughtUp, mid)).toBe(0n);
    expect(releasableShares(caughtUp, mid + DAY)).toBeGreaterThan(0n);
  });

  it("never goes negative, even on inconsistent input", () => {
    expect(releasableShares(grant({sharesReleased: OPEN_SHARES}), START)).toBe(0n);
  });

  it("freezes at revocation and never moves again", () => {
    const frozen = vestedShares(grant(), mid);
    const g = grant({revoked: true, frozenVestedShares: frozen, shares: frozen});
    expect(vestedShares(g, START)).toBe(frozen);
    expect(vestedShares(g, START + 100 * 365 * DAY)).toBe(frozen);
    expect(vestingPhase(g, mid)).toBe("revoked");
    expect(accruedShares(g, mid + DAY)).toBe(frozen);
  });

  it("previews a cancel exactly as the contract splits it", () => {
    const g = grant();
    const p = revokePreview(g, EMPTY_POOL_AFTER, mid);
    expect(p.vestedShares).toBe(OPEN_SHARES / 2n);
    expect(p.unvestedShares).toBe(OPEN_SHARES - OPEN_SHARES / 2n);
    expect(p.returnedUnits).toBe(sharesToUnits(p.unvestedShares, OPEN_SHARES, DEPOSIT));
    // What goes back and what stays never add up to more than the grant held.
    expect(p.returnedUnits + p.staysUnits).toBeLessThanOrEqual(DEPOSIT);
    expect(DEPOSIT - (p.returnedUnits + p.staysUnits)).toBeLessThanOrEqual(2n);
    // Before the cliff everything goes back and nothing stays.
    const early = revokePreview(g, EMPTY_POOL_AFTER, START + DAY);
    expect(early.vestedShares).toBe(0n);
    expect(early.staysUnits).toBe(0n);
    expect(early.returnedUnits).toBe(DEPOSIT);
  });

  it("pays the caller a fixed share, rounded down, and the beneficiary pays nothing", () => {
    expect(releaseFee(1_000_000n, 50, false)).toBe(5_000n);
    expect(releaseFee(1_999n, 50, false)).toBe(9n); // 9.995 rounds down
    expect(releaseFee(1_000_000n, 50, true)).toBe(0n);
    expect(releaseFee(1_000_000n, 0, false)).toBe(0n);
  });
});

describe("shares to units", () => {
  it("round-trips exactly through an empty pool: deposit D, hold exactly D", () => {
    expect(OPEN_SHARES).toBe(DEPOSIT * SHARE_OFFSET);
    expect(heldUnits(grant(), EMPTY_POOL_AFTER)).toBe(DEPOSIT);
    expect(vestedUnitsAt(grant(), EMPTY_POOL_AFTER, START + 730 * DAY)).toBe(DEPOSIT);
  });

  it("rounds down, never up", () => {
    // 7 shares of a pool of 3 shares (+1e6 offset) holding 10 units: 7·11/1000003 = 0.00007…
    expect(sharesToUnits(7n, 3n, 10n)).toBe(0n);
    expect(sharesToUnits(1_000_003n, 3n, 10n)).toBe(11n);
    expect(sharesToUnits(1_000_002n, 3n, 10n)).toBe(10n); // 10.99998…
    expect(sharesToUnits(0n, 0n, 0n)).toBe(0n);
  });

  it("moves every grant in proportion when the issuer burns from the escrow", () => {
    const halved: PoolState = {poolShares: OPEN_SHARES, escrowBalance: DEPOSIT / 2n};
    expect(heldUnits(grant(), halved)).toBe(DEPOSIT / 2n);
  });

  it("prices vested, accrued and releasable units off the same pool", () => {
    const mid = START + 365 * DAY;
    const g = grant({sharesReleased: OPEN_SHARES / 4n});
    const vested = vestedUnitsAt(g, EMPTY_POOL_AFTER, mid);
    expect(vested).toBe(DEPOSIT / 2n);
    expect(releasableUnits(g, EMPTY_POOL_AFTER, mid)).toBe(DEPOSIT / 4n);
    expect(accruedUnitsAt(g, EMPTY_POOL_AFTER, START + 30 * DAY)).toBeGreaterThan(0n);
    expect(vestedUnitsAt(g, EMPTY_POOL_AFTER, START + 30 * DAY)).toBe(0n);
  });
});

describe("parity with lib/schedule.ts, the page bar's arithmetic", () => {
  it("agrees at every moment across a grant's life", () => {
    const cases: VestingTerms[] = [
      fixtureTerms,
      grant(),
      grant({cliffSeconds: 0, durationSeconds: 7_200}),
      grant({shares: 7n, cliffSeconds: 0, durationSeconds: 10}),
      grant({shares: 123_456_789_012_345_678_901n, cliffSeconds: 365 * DAY, durationSeconds: 4 * 365 * DAY}),
    ];
    for (const t of cases) {
      const s: Schedule = {
        shares: t.shares,
        start: t.start,
        cliffSeconds: t.cliffSeconds,
        durationSeconds: t.durationSeconds,
      };
      const span = t.durationSeconds;
      const step = Math.max(1, Math.floor(span / 997));
      for (let at = t.start - step * 3; at <= t.start + span + step * 3; at += step) {
        expect(vestedShares(t, at)).toBe(vestedSharesAt(s, at));
      }
    }
  });
});

describe("a figure, rounded down to a fixed number of places", () => {
  it("never rounds up", () => {
    expect(formatUnitsFixed(1_999_999_999_999_999_999n, 18, 4)).toBe("1.9999");
    expect(formatUnitsFixed(999_999_999_999_999_999n, 18, 10)).toBe("0.9999999999");
    expect(formatUnitsFixed(1_000_000n, 6, 2)).toBe("1.00");
  });

  it("keeps trailing zeros, so a ticking column never changes width", () => {
    expect(formatUnitsFixed(0n, 18, 10)).toBe("0.0000000000");
    expect(formatUnitsFixed(1_500_000_000_000_000_000n, 18, 4)).toBe("1.5000");
  });

  it("groups the whole part, and handles more places than the token has", () => {
    expect(formatUnitsFixed(1_234_567_890_000n, 6, 2)).toBe("1,234,567.89");
    expect(formatUnitsFixed(15n, 1, 3)).toBe("1.500");
    expect(formatUnitsFixed(42n, 0, 2)).toBe("42.00");
    expect(formatUnitsFixed(42n, 0, 0)).toBe("42");
  });
});
