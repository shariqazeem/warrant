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
 * impact, on `measuredAt`, asked at $1,000, $10,000 and $100,000. The top rung is a floor,
 * not a ceiling: the ladder stopped asking. It is a measurement of a market on a day, not a
 * property of the asset. `npm run probe` re-measures it; do that before submission and
 * before the demo. docs/liquidity.md has the measurement behind every row.
 *
 * THE ORDER IS THE MENU'S ORDER. SPYx first, because it is the default; then the broad
 * funds; then single stocks by name. A test holds it.
 *
 * Every row cleared one bar on 23 September 2026: the same implementation, owner and proxy
 * code as the rest (so the one issuer disclosure below is true of it), 18 decimals, a route
 * at $1,000 and at $10,000, and no more than 1% price impact at $1,000.
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
  /** Proved end to end through Payroll against real state (`npm run prove-fork --
   *  --asset=<address>`, on an anvil fork). False means quoted, not yet settled. */
  provedOnFork: boolean;
  /** Legs in the aggregator's route for a $1,000 payment on `measuredAt`, counted the way
   *  the pay form shows them: one per venue, so a split counts each side. A snapshot; the
   *  route changes from quote to quote. */
  hops: number;
};

export const MEASURED_AT = "2026-09-23";

export const ASSETS: readonly Asset[] = [
  {
    address: "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48",
    symbol: "SPYx",
    name: "S&P 500 xStock",
    decimals: 18,
    listed: true,
    depthUsd: 100_000,
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
    hops: 5,
  },
  {
    address: "0xdadfb355c6110eda0908740d52c834d6c2bcddc7",
    symbol: "IWMx",
    name: "Russell 2000 xStock",
    decimals: 18,
    listed: true,
    depthUsd: 10_000,
    provedOnFork: false,
    hops: 5,
  },
  {
    address: "0xe92f673ca36c5e2efd2de7628f815f84807e803f",
    symbol: "GOOGLx",
    name: "Alphabet xStock",
    decimals: 18,
    listed: true,
    depthUsd: 10_000,
    provedOnFork: false,
    hops: 5,
  },
  {
    address: "0x3557ba345b01efa20a1bddc61f573bfd87195081",
    symbol: "AMZNx",
    name: "Amazon xStock",
    decimals: 18,
    listed: true,
    depthUsd: 10_000,
    provedOnFork: false,
    hops: 4,
  },
  {
    address: "0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a",
    symbol: "AAPLx",
    name: "Apple xStock",
    decimals: 18,
    listed: true,
    depthUsd: 10_000,
    provedOnFork: false,
    hops: 4,
  },
  {
    address: "0x38bac69cbbd28156796e4163b2b6dcb81e336565",
    symbol: "AVGOx",
    name: "Broadcom xStock",
    decimals: 18,
    listed: true,
    depthUsd: 10_000,
    provedOnFork: false,
    hops: 5,
  },
  {
    address: "0xfebded1b0986a8ee107f5ab1a1c5a813491deceb",
    symbol: "CRCLx",
    name: "Circle xStock",
    decimals: 18,
    listed: true,
    depthUsd: 10_000,
    provedOnFork: false,
    hops: 9,
  },
  {
    address: "0x364f210f430ec2448fc68a49203040f6124096f0",
    symbol: "COINx",
    name: "Coinbase xStock",
    decimals: 18,
    listed: true,
    depthUsd: 10_000,
    provedOnFork: false,
    hops: 6,
  },
  {
    address: "0x96702be57cd9777f835117a809c7124fe4ec989a",
    symbol: "METAx",
    name: "Meta xStock",
    decimals: 18,
    listed: true,
    depthUsd: 1_000,
    provedOnFork: false,
    hops: 4,
  },
  {
    address: "0x5621737f42dae558b81269fcb9e9e70c19aa6b35",
    symbol: "MSFTx",
    name: "Microsoft xStock",
    decimals: 18,
    listed: true,
    depthUsd: 10_000,
    provedOnFork: false,
    hops: 4,
  },
  {
    address: "0xae2f842ef90c0d5213259ab82639d5bbf649b08e",
    symbol: "MSTRx",
    name: "MicroStrategy xStock",
    decimals: 18,
    listed: true,
    depthUsd: 10_000,
    provedOnFork: false,
    hops: 6,
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
    address: "0xe1385fdd5ffb10081cd52c56584f25efa9084015",
    symbol: "HOODx",
    name: "Robinhood xStock",
    decimals: 18,
    listed: true,
    depthUsd: 10_000,
    provedOnFork: false,
    hops: 5,
  },
  {
    address: "0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0",
    symbol: "TSLAx",
    name: "Tesla xStock",
    decimals: 18,
    listed: true,
    depthUsd: 10_000,
    provedOnFork: false,
    hops: 5,
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

/**
 * WHO MAY HOLD ONE. Not a power of the contract — the token moves to any address — but a
 * limit in the terms it is offered under, and the payer is the one choosing who receives
 * it. Source: xStocks' published FAQ (support.kraken.com/articles/xstocks-faq), read
 * 2026-09-23: "not accessible in the US (or to US persons), Canada, UK, or Australia."
 */
export const ELIGIBILITY_FACT = "Not available to US persons, or in Canada, the UK or Australia.";

/** The same, as a reminder to the payer, who chooses who receives it. */
export const ELIGIBILITY_NOTE =
  "Not available to US persons, or in Canada, the UK or Australia — check that the " +
  "person you pay may hold it.";

/**
 * The same disclosure in one line, for a list with a row per stock: every row still says it
 * (per row, never a banner), and the full note is one click away on the row itself.
 */
export const ISSUER_NOTE_SHORT =
  "Issued by a third party: economic exposure, no shares and no votes, and its issuer can " +
  "create or destroy units.";

/** The specific powers, in the order they would matter to someone being paid in it. */
export const ISSUER_POWERS = [
  "destroy units held by any address, including yours",
  "create new units",
  "replace the contract's code, because it is upgradeable",
  "hand all of the above to another address",
] as const;

/**
 * Every asset in ASSETS sits behind ONE implementation with ONE owner, behind identical
 * proxy code. That was read for each of them on `checkedOn`, not assumed from the first
 * three; an asset added later has to be read the same way before it joins the list.
 * Warrant cannot prevent any of this, and says so rather than leaving it to be discovered.
 */
export const ISSUER = {
  owner: "0x49754062E35f7591B93cc4F9915965be89643a65",
  implementation: "0x65c40d624af3b18c109fbf87b7deff34cdc5f19b",
  checkedOn: "2026-09-23",
  /** Probed for and not found. Absence of a selector is weaker evidence than presence. */
  noSignOf: ["pause", "blacklist", "freeze", "forceTransfer", "seize", "rebase"],
} as const;

/**
 * One sentence naming who holds those powers, for a row that has space for it. It names
 * no count, so a longer list cannot make it wrong by arithmetic.
 */
export const ISSUER_OWNER_NOTE =
  `Every stock Warrant pays in sits behind one upgradeable contract with one owner, ` +
  `${ISSUER.owner}, which can ${ISSUER_POWERS[0]}. Read from X Layer on ${ISSUER.checkedOn}.`;

export function assetByAddress(address: string): Asset | undefined {
  return ASSETS.find((a) => a.address.toLowerCase() === address.toLowerCase());
}

/** The one a payment defaults to. Overridable, but it must be one of the list above. */
export function defaultAsset(): Asset {
  const configured = process.env.NEXT_PUBLIC_DEFAULT_ASSET?.trim();
  if (!configured) return ASSETS[0]!;
  return assetByAddress(configured) ?? ASSETS[0]!;
}
