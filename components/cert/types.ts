/**
 * WHAT A CERTIFICATE IS DRAWN FROM. Every field is either read from the chain (the escrow's
 * grant, its opening event, the pool it is priced against), a live OKX quote, or what the
 * person filling in the form typed. Null means "not known yet" and is drawn as words, never
 * as a zero.
 */
export type CertificateAsset = {
  symbol: string;
  /** As the asset list names it: "S&P 500 xStock". */
  name: string;
  address: `0x${string}`;
  decimals: number;
};

export type CertificateData = {
  /** The grant's id on the escrow. A specimen is drawn as No. 000000 whatever this is. */
  id: number;
  recipient: `0x${string}` | null;
  grantor: `0x${string}` | null;
  asset: CertificateAsset;
  /** Units the escrow received when it was opened (a quote's estimate on a specimen). */
  units: bigint | null;
  /** USD₮0 the grantor paid, in base units (6 decimals). */
  stableCost: bigint | null;
  /** What one unit cost, already formatted ("767.34"), or null when unknown. */
  unitPriceUsd: string | null;
  /** Token symbols along the OKX DEX route, from the quote: ["USD₮0", "USDG", "wSPYx", "SPYx"]. */
  route: string[];
  /** Unix seconds. */
  start: number;
  cliffSeconds: number;
  durationSeconds: number;
  tipBps: number;
  sealed: boolean;
  revoked: boolean;
  closed: boolean;
  /** The grant's live shares (reduced to the vested share if revoked). */
  shares?: bigint;
  sharesReleased?: bigint;
  frozenVestedShares?: bigint;
  /** The shares it was opened with, so a cancelled grant's rule is drawn against the whole. */
  openedShares?: bigint;
  /** `poolShares(asset)` on the escrow, and the escrow's balance of the asset. */
  poolShares?: bigint;
  escrowBalance?: bigint;
  /** The transaction that opened it; null on a specimen or while it is being read. */
  tx: `0x${string}` | null;
};
