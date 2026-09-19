/**
 * THE VESTING SCHEDULE, IN TYPESCRIPT.
 *
 * The same arithmetic as `GrantEscrow._vestedShares`. CLAUDE.md names the schedule
 * money-critical, and this is the second implementation of it — so the two are held to one
 * fixture, `contracts/test/fixtures/schedule.json`, which the Solidity test reads too.
 * A page that draws a bar the contract will not honour is worse than a page with no bar.
 *
 * Everything here is in SHARES. Units are what shares are worth against the pool at the
 * moment of release, which only the contract can say.
 */
export type Schedule = {
  shares: bigint;
  /** Unix seconds. */
  start: number;
  cliffSeconds: number;
  durationSeconds: number;
  /** Set when the grant was revoked: nothing vests after this, ever. */
  frozenShares?: bigint;
  revoked?: boolean;
};

/** Shares vested at `at`. Rounds down, exactly as the contract does. */
export function vestedSharesAt(s: Schedule, at: number): bigint {
  if (s.revoked) return s.frozenShares ?? 0n;
  if (at < s.start + s.cliffSeconds) return 0n;
  if (at >= s.start + s.durationSeconds) return s.shares;
  return (s.shares * BigInt(at - s.start)) / BigInt(s.durationSeconds);
}

export type Progress = {
  /** 0..1 of the grant vested at `at`. */
  vestedFraction: number;
  /** 0..1 of the grant already released. */
  releasedFraction: number;
  /** Where the cliff sits along the bar, 0..1. */
  cliffFraction: number;
  /** True once the cliff has passed. */
  pastCliff: boolean;
  /** True once nothing further will ever vest. */
  finished: boolean;
  cliffAt: number;
  endsAt: number;
};

/** Everything the schedule bar needs, and nothing it does not. */
export function progress(s: Schedule, releasedShares: bigint, at: number): Progress {
  const vested = vestedSharesAt(s, at);
  const denominator = s.shares === 0n ? 1n : s.shares;
  const asFraction = (v: bigint) => Number((v * 10_000n) / denominator) / 10_000;

  return {
    vestedFraction: asFraction(vested),
    releasedFraction: asFraction(releasedShares),
    cliffFraction: s.durationSeconds === 0 ? 0 : s.cliffSeconds / s.durationSeconds,
    pastCliff: at >= s.start + s.cliffSeconds,
    finished: s.revoked === true || at >= s.start + s.durationSeconds,
    cliffAt: s.start + s.cliffSeconds,
    endsAt: s.start + s.durationSeconds,
  };
}

/** "4 years", "90 days", "18 months" — a duration as a person would say it. */
export function humanDuration(seconds: number): string {
  const days = Math.round(seconds / 86_400);
  if (days === 0) return "immediately";
  if (days % 365 === 0) {
    const years = days / 365;
    return `${years} year${years === 1 ? "" : "s"}`;
  }
  if (days >= 60 && days % 30 === 0) {
    const months = days / 30;
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  return `${days} day${days === 1 ? "" : "s"}`;
}
