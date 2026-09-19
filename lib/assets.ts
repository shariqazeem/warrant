/**
 * WHAT WARRANT WILL PAY IN, and what is known about each one.
 *
 * ONE LIST. The form, the front door, the docs and `npm run preflight` all read it, so an
 * asset cannot be offered on one surface and missing from another.
 *
 * Nothing here is a source of truth about an asset. The symbol and decimals a receipt
 * prints are read from the chain; these are what this repo BELIEVES, and preflight exists
 * to catch the day they stop agreeing.
 *
 * `depthUsd` is the largest payment the OKX aggregator would route at or under 1% price
 * impact, on `measuredAt`. It is a measurement of a market on a day, not a property of the
 * asset. `npm run probe` re-measures it; do that before submission and before the demo.
 */
export type Asset = {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  /** Whether the OKX aggregator lists it in all-tokens. An unlisted asset can still route,
   *  but a judge who looks it up in OKX's own tooling will not find it. */
  listed: boolean;
  depthUsd: number;
  /** Proved end to end through Payroll against real state. */
  provedOnFork: boolean;
  hops: number;
};

export const MEASURED_AT = "2026-09-19";

export const ASSETS: readonly Asset[] = [
  {
    address: "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48",
    symbol: "SPYx",
    name: "S&P 500 xStock",
    decimals: 18,
    listed: true,
    depthUsd: 10_000,
    provedOnFork: true,
    hops: 4,
  },
  {
    address: "0xc845b2894dbddd03858fd2d643b4ef725fe0849d",
    symbol: "NVDAx",
    name: "NVIDIA xStock",
    decimals: 18,
    listed: true,
    depthUsd: 10_000,
    provedOnFork: true,
    hops: 4,
  },
  {
    address: "0xa753a7395cae905cd615da0b82a53e0560f250af",
    symbol: "QQQx",
    name: "Nasdaq 100 xStock",
    decimals: 18,
    listed: true,
    depthUsd: 10_000,
    provedOnFork: true,
    hops: 4,
  },
] as const;

/**
 * THE ISSUER DISCLOSURE, per asset, on the row where someone decides to be paid in it —
 * never as a banner.
 *
 * NOT GUESSED, AND NOT TAKEN FROM MARKETING COPY. Every claim below was read off X Layer
 * by `npm run check-issuer`: the proxy, its implementation, its owner, and which powers
 * that implementation's bytecode actually carries. A disclosure is a claim about a third
 * party and is held to the same rule as any other figure here — the chain has to confirm
 * it. Re-run the check before submission; the contract is upgradeable.
 */
export const ISSUER_NOTE =
  "A tokenized stock issued by a third party, not by Warrant and not by OKX. It gives " +
  "economic exposure to the underlying price. It does not make the holder a shareholder " +
  "and carries no voting rights.";

/** The specific powers, in the order they would matter to someone being paid in it. */
export const ISSUER_POWERS = [
  "destroy units held by any address, including yours",
  "create new units",
  "replace the contract's code, because it is upgradeable",
  "hand all of the above to another address",
] as const;

/**
 * All three assets sit behind ONE implementation with ONE owner. Warrant cannot prevent
 * any of this, and says so rather than leaving it to be discovered.
 */
export const ISSUER = {
  owner: "0x49754062E35f7591B93cc4F9915965be89643a65",
  implementation: "0x65c40d624af3b18c109fbf87b7deff34cdc5f19b",
  checkedOn: "2026-09-19",
  /** Probed for and not found. Absence of a selector is weaker evidence than presence. */
  noSignOf: ["pause", "blacklist", "freeze", "forceTransfer", "seize", "rebase"],
} as const;

/** One sentence naming who holds those powers, for a row that has space for it. */
export const ISSUER_OWNER_NOTE =
  `All three sit behind one upgradeable contract with one owner, ${ISSUER.owner}, ` +
  `which can ${ISSUER_POWERS[0]}. Read from X Layer on ${ISSUER.checkedOn}.`;

export function assetByAddress(address: string): Asset | undefined {
  return ASSETS.find((a) => a.address.toLowerCase() === address.toLowerCase());
}

/** The one a payment defaults to. Overridable, but it must be one of the list above. */
export function defaultAsset(): Asset {
  const configured = process.env.NEXT_PUBLIC_DEFAULT_ASSET?.trim();
  if (!configured) return ASSETS[0]!;
  return assetByAddress(configured) ?? ASSETS[0]!;
}
