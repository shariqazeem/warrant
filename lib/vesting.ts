/**
 * THE VESTING MATHS, EXACTLY AS GRANTESCROW DOES IT, IN BIGINT.
 *
 * Every figure a certificate shows about time — vested now, ready to release, what a cancel
 * would send back — is one of these functions, and each one is a line-for-line copy of the
 * contract (`contracts/src/GrantEscrow.sol`):
 *
 *   _vestedShares   revoked → frozenVestedShares; before start+cliff → 0;
 *                   from start+duration → shares; else floor(shares·(t−start)/duration)
 *   _toUnits        shares = 0 → 0; else floor(shares·(balance+1)/(poolShares+1e6))
 *   _open           newShares = floor(delivered·(poolShares+1e6)/(poolBefore+1))
 *   vest            tip = caller is the beneficiary ? 0 : floor(due·tipBps/10000)
 *   revoke          returned = toUnits(shares − vested) against the pool BEFORE it shrinks
 *
 * Nothing here is estimated and nothing rounds up: everything a person receives rounds
 * DOWN, as the contract does. `lib/vesting.test.ts` holds it to the shared fixture the
 * Solidity test reads, and `scripts/prove-vesting-fork.ts` holds it to the deployed
 * contract's own view functions on a fork of X Layer.
 *
 * The ticker on a certificate calls these once a second with the whole-second clock, so
 * what it shows at second t is what `vestedUnitsAt(id, t)` returns on chain at t.
 */

/** The terms the schedule runs on, as the escrow stores them for one grant. */
export type VestingTerms = {
  /** The grant's share of its asset's pool. Reduced to the vested share if revoked. */
  shares: bigint;
  /** Shares already released, tips included. */
  sharesReleased: bigint;
  /** Unix seconds. */
  start: number;
  cliffSeconds: number;
  durationSeconds: number;
  revoked: boolean;
  /** Shares vested at the moment of revocation. Vesting is frozen here. */
  frozenVestedShares: bigint;
};

/** The pool a grant's shares are priced against: one per asset, read from the escrow. */
export type PoolState = {
  /** `poolShares(asset)` on the escrow. */
  poolShares: bigint;
  /** `asset.balanceOf(escrow)`. */
  escrowBalance: bigint;
};

/** The contract's virtual share offset, against the first-depositor inflation attack. */
export const SHARE_OFFSET = 1_000_000n;

/** The largest release fee the contract accepts, in basis points (2%). */
export const MAX_TIP_BPS = 200;

/** The longest schedule the contract accepts: 3,650 days, in seconds. */
export const MAX_DURATION_SECONDS = 3650 * 86_400;

/**
 * A timestamp as the chain sees one: whole seconds. The contract never sees a fraction of
 * a second, and `BigInt(1.5)` throws, so a clock from `Date.now() / 1000` is floored here.
 */
const whole = (at: number): number => Math.floor(at);

/** Shares vested at `atSeconds`. `GrantEscrow._vestedShares`, exactly. */
export function vestedShares(t: VestingTerms, atSeconds: number): bigint {
  const at = whole(atSeconds);
  // Revocation freezes the schedule. Nothing further ever vests.
  if (t.revoked) return t.frozenVestedShares;
  if (at < t.start + t.cliffSeconds) return 0n;
  if (at >= t.start + t.durationSeconds) return t.shares;
  // Reached only when start+cliff ≤ at < start+duration, so duration > 0 here.
  return (t.shares * BigInt(at - t.start)) / BigInt(t.durationSeconds);
}

/**
 * Shares accrued by `atSeconds` on the straight line from `start`, ignoring the cliff:
 * what will become vested all at once when the cliff passes. Before the cliff the contract
 * says 0 is vested — true — and a certificate says this is "accruing", never "vested".
 */
export function accruedShares(t: VestingTerms, atSeconds: number): bigint {
  const at = whole(atSeconds);
  if (t.revoked) return t.frozenVestedShares;
  if (at <= t.start) return 0n;
  if (at >= t.start + t.durationSeconds) return t.shares;
  return (t.shares * BigInt(at - t.start)) / BigInt(t.durationSeconds);
}

/** Shares that could be released at `atSeconds`. Never negative. */
export function releasableShares(t: VestingTerms, atSeconds: number): bigint {
  const vested = vestedShares(t, atSeconds);
  // The contract would revert on underflow; it cannot happen on a real grant (released
  // shares were vested when released, and vesting only grows), and a page must not throw.
  return vested > t.sharesReleased ? vested - t.sharesReleased : 0n;
}

/** Shares to asset units against a pool. `GrantEscrow._toUnits`, exactly: rounds down. */
export function sharesToUnits(shares: bigint, poolShares: bigint, escrowBalance: bigint): bigint {
  if (shares === 0n) return 0n;
  return (shares * (escrowBalance + 1n)) / (poolShares + SHARE_OFFSET);
}

/** Shares a deposit of `delivered` units mints into a pool. `GrantEscrow._open`, exactly. */
export function sharesForDeposit(delivered: bigint, poolShares: bigint, poolBalanceBefore: bigint): bigint {
  return (delivered * (poolShares + SHARE_OFFSET)) / (poolBalanceBefore + 1n);
}

/** Units vested at `atSeconds`, priced at the pool as given. The contract's `vestedUnitsAt`. */
export function vestedUnitsAt(t: VestingTerms, pool: PoolState, atSeconds: number): bigint {
  return sharesToUnits(vestedShares(t, atSeconds), pool.poolShares, pool.escrowBalance);
}

/**
 * UNITS VESTED SO FAR, AS A PERSON COUNTS THEM: what has already been paid out, at the rate
 * the grant was opened at, plus what vested and is still in the escrow, at the pool's rate now.
 *
 * `vestedUnitsAt` (the escrow's own view) prices every vested share at today's pool. That is
 * right while nothing has left the pool, and wrong once it has emptied: a fully released
 * grant's pool holds only rounding dust, and its shares priced against dust read as nonsense
 * (grant No. 000002 on 25 Sep showed 0.0065 "fully vested" of a 0.0038 grant). The opening's
 * units and shares come from its GrantOpened event; without them this is the escrow's view.
 */
export function vestedUnitsSoFar(
  t: VestingTerms,
  pool: PoolState,
  atSeconds: number,
  opened: {units: bigint; shares: bigint} | null,
): bigint {
  if (!opened || opened.shares <= 0n) return vestedUnitsAt(t, pool, atSeconds);
  const vested = vestedShares(t, atSeconds);
  const paid = vested < t.sharesReleased ? vested : t.sharesReleased;
  return (paid * opened.units) / opened.shares + sharesToUnits(vested - paid, pool.poolShares, pool.escrowBalance);
}

/** Units accrued (not yet vested before the cliff), priced at the pool as given. */
export function accruedUnitsAt(t: VestingTerms, pool: PoolState, atSeconds: number): bigint {
  return sharesToUnits(accruedShares(t, atSeconds), pool.poolShares, pool.escrowBalance);
}

/** Units that could be released at `atSeconds`. The contract's `releasableUnits`. */
export function releasableUnits(t: VestingTerms, pool: PoolState, atSeconds: number): bigint {
  return sharesToUnits(releasableShares(t, atSeconds), pool.poolShares, pool.escrowBalance);
}

/** Units still held for the grant, vested or not. The contract's `heldUnits`. */
export function heldUnits(t: VestingTerms, pool: PoolState): bigint {
  const left = t.shares > t.sharesReleased ? t.shares - t.sharesReleased : 0n;
  return sharesToUnits(left, pool.poolShares, pool.escrowBalance);
}

/**
 * What a release of `dueUnits` pays whoever called it. Nothing when the beneficiary claims
 * it themselves; otherwise a fixed share, rounded down. `GrantEscrow.vest`, exactly.
 */
export function releaseFee(dueUnits: bigint, tipBps: number, callerIsBeneficiary: boolean): bigint {
  if (callerIsBeneficiary) return 0n;
  return (dueUnits * BigInt(tipBps)) / 10_000n;
}

/** Where a grant's schedule stands at a moment. The order is the contract's. */
export type VestingPhase = "revoked" | "not-started" | "accruing" | "vesting" | "vested";

export function vestingPhase(t: VestingTerms, atSeconds: number): VestingPhase {
  const at = whole(atSeconds);
  if (t.revoked) return "revoked";
  if (at >= t.start + t.durationSeconds) return "vested";
  if (at < t.start) return "not-started";
  if (at < t.start + t.cliffSeconds) return "accruing";
  return "vesting";
}

/** What a cancel at `atSeconds` would do, as `GrantEscrow.revoke` computes it. */
export type RevokePreview = {
  /** Shares vested at that moment: these stay the recipient's. */
  vestedShares: bigint;
  /** Shares not yet vested: these are burned and their units go back to the grantor. */
  unvestedShares: bigint;
  /** Units sent back to the grantor, priced against the pool before it shrinks. */
  returnedUnits: bigint;
  /** Units vested but not yet released, which stay in escrow for the recipient. */
  staysUnits: bigint;
};

/**
 * A CANCEL, BEFORE IT HAPPENS. The grantor is told exactly what goes where: the unvested
 * part back to them, the vested part staying the recipient's. The figures are for the
 * second given; the transaction settles at the second of the block it lands in, and every
 * second in between vests a little more to the recipient — the page says so.
 */
export function revokePreview(t: VestingTerms, pool: PoolState, atSeconds: number): RevokePreview {
  const vested = vestedShares(t, atSeconds);
  const unvested = t.shares > vested ? t.shares - vested : 0n;
  const returned = sharesToUnits(unvested, pool.poolShares, pool.escrowBalance);
  // After the transfer the pool has lost both the shares and the units, and what stays is
  // priced against what is left — the same order the contract runs in.
  const after: PoolState = {
    poolShares: pool.poolShares > unvested ? pool.poolShares - unvested : 0n,
    escrowBalance: pool.escrowBalance > returned ? pool.escrowBalance - returned : 0n,
  };
  const unreleased = vested > t.sharesReleased ? vested - t.sharesReleased : 0n;
  return {
    vestedShares: vested,
    unvestedShares: unvested,
    returnedUnits: returned,
    staysUnits: sharesToUnits(unreleased, after.poolShares, after.escrowBalance),
  };
}

/**
 * A raw token amount at a fixed number of places, ROUNDED DOWN — never up, so a certificate
 * never shows a person a fraction of a unit they will not receive. The whole part is
 * grouped with commas; the fraction keeps its trailing zeros, so a ticking column never
 * changes width. `formatUnitsFixed(1_999_999_999_999_999_999n, 18, 4)` is "1.9999".
 */
export function formatUnitsFixed(raw: bigint, decimals: number, dp: number): string {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = negative ? "-" : "";
  if (dp <= 0) return `${sign}${grouped}`;
  const fraction = (abs % base).toString().padStart(decimals, "0").padEnd(dp, "0").slice(0, dp);
  return `${sign}${grouped}.${fraction}`;
}
