/**
 * A GRANT, AS THE CERTIFICATE PRINTS IT.
 *
 * One mapping from what the escrow says about a grant (lib/grants.ts, read live) to the data
 * the certificate draws, so every surface that shows a certificate (the front page, /me, the
 * certificate page, the issue flow) prints the same grant the same way.
 *
 * Pure and free of the database and the network: it runs on the server and in the browser.
 * Every figure it produces comes from the grant's own terms, the pool it holds shares of, or
 * the grant's opening. When none of those can say, the figure is null and the certificate
 * prints a dash; nothing here estimates.
 */
import type {CertificateData} from "@/components/cert/certificate";
import {assetByAddress} from "./assets";
import type {Grant} from "./grants";

/**
 * GrantEscrow's virtual share offset (`SHARE_OFFSET = 1e6` in GrantEscrow.sol): a pool's
 * shares are counted as if 1e6 more existed, which guards the first grant against a donation
 * that would inflate the price of a share. lib/certificate-data.test.ts reads it out of the
 * contract source, so the two cannot drift.
 */
export const SHARE_OFFSET = 1_000_000n;

/** What the pool looked like when the grant was read: the escrow's shares and balance of the asset. */
export type PoolFacts = {poolShares: bigint; escrowBalance: bigint};

export type CertificateExtras = {
  /** The transaction the grant was recorded in (its opening). */
  tx?: `0x${string}` | null;
  /** The OKX DEX route it was bought through, by symbol, from the real quote. */
  route?: string[];
  poolShares?: bigint;
  escrowBalance?: bigint;
  /** The units the grant bought when it opened, from its GrantOpened event. Used for the
   *  price, and for the units when the pool was not read. */
  openedUnits?: bigint;
  /** The shares it opened with, from the same event, so paid-out units are counted exactly. */
  openedShares?: bigint;
};

/**
 * Shares of a pool as units of its asset, exactly as the escrow converts them:
 * `shares × (balance + 1) / (poolShares + SHARE_OFFSET)`, rounded down. Never rounds up:
 * what the certificate says someone holds must not be more than the contract would release.
 */
export function unitsOfShares(shares: bigint, pool: PoolFacts): bigint {
  if (shares <= 0n) return 0n;
  return (shares * (pool.escrowBalance + 1n)) / (pool.poolShares + SHARE_OFFSET);
}

/**
 * What one whole unit cost, in dollars with two decimals and no symbol ("767.34"), from what
 * the grant paid and what it bought. Arithmetic on a settled purchase, in bigint, rounded
 * down; null when nothing was bought.
 */
export function unitPrice(stableCost: bigint, units: bigint, decimals: number): string | null {
  if (units <= 0n || stableCost < 0n) return null;
  // cents = stableCost (6 dp) × 10^decimals × 100 / (units × 10^6)
  const cents = (stableCost * 10n ** BigInt(decimals) * 100n) / (units * 1_000_000n);
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${whole}.${(cents % 100n).toString().padStart(2, "0")}`;
}

/** The asset's everyday name, without the issuer's suffix: "S&P 500 xStock" → "S&P 500". */
export function stockName(name: string): string {
  return name.replace(/\s+xStock$/i, "");
}

/**
 * THE CERTIFICATE'S DATA FOR ONE GRANT.
 *
 * `units` is what the grant's shares are worth in units now, converted the way the contract
 * converts them, when the pool was read; otherwise the units it bought at opening, when
 * those are known; otherwise null. The price is always the opening's own arithmetic: what
 * was paid, over what it bought.
 */
/** What a grant's opening says about it: its GrantOpened event, as lib/company reads it. */
export type Opening = {txHash: `0x${string}`; units: bigint; shares: bigint};

/**
 * THE EXTRAS FOR A GRANT WHOSE OPENING IS KNOWN, in one place. The front page and /me each
 * spelled them out by hand, and the front page's copy left out the opening shares: its
 * certificate then priced the units already paid out against a pool nearly emptied by those
 * payouts, and printed grant No. 000004 (0.003887 SPYx) as "fully vested 0.0054422870".
 */
export function openingExtras(opened: Opening, route: string[], pool: PoolFacts | null): CertificateExtras {
  return {
    tx: opened.txHash,
    openedUnits: opened.units,
    openedShares: opened.shares,
    route,
    ...(pool ?? {}),
  };
}

export function certificateDataFor(grant: Grant, extras: CertificateExtras = {}): CertificateData {
  const known = assetByAddress(grant.asset);
  const pool =
    extras.poolShares !== undefined && extras.escrowBalance !== undefined
      ? {poolShares: extras.poolShares, escrowBalance: extras.escrowBalance}
      : null;
  // What was granted is what the opening bought. Priced from today's pool instead, a grant
  // whose pool has emptied (everything released) reads as nonsense.
  const units = extras.openedUnits ?? (pool ? unitsOfShares(grant.shares, pool) : null);
  const bought = extras.openedUnits ?? units;

  return {
    id: grant.id,
    recipient: grant.beneficiary,
    grantor: grant.payer,
    asset: {
      symbol: grant.assetSymbol,
      name: known?.name ?? grant.assetSymbol,
      address: grant.asset,
      decimals: grant.assetDecimals,
    },
    units,
    stableCost: grant.stableCost,
    unitPriceUsd: bought === null ? null : unitPrice(grant.stableCost, bought, grant.assetDecimals),
    route: extras.route ?? [],
    start: grant.start,
    cliffSeconds: grant.cliffSeconds,
    durationSeconds: grant.durationSeconds,
    tipBps: grant.tipBps,
    sealed: grant.isSealed,
    revoked: grant.revoked,
    closed: grant.state === "closed",
    shares: grant.shares,
    sharesReleased: grant.sharesReleased,
    frozenVestedShares: grant.frozenVestedShares,
    openedShares: extras.openedShares,
    poolShares: pool?.poolShares,
    escrowBalance: pool?.escrowBalance,
    tx: extras.tx ?? null,
  };
}
