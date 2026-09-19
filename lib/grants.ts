/**
 * READING GRANTS OFF THE CHAIN.
 *
 * A grant's terms live in contract storage rather than in logs, because they change —
 * sealed, revoked, released — and a page should show what is true now, not what was
 * announced once. `grantCount()` then `grant(id)` is two reads and no cursor.
 */
import {createPublicClient, erc20Abi, http} from "viem";
import {grantEscrowAbi} from "./payroll-abi";
import {xLayer} from "./chain";
import {assetByAddress} from "./assets";
import {reasonFor} from "./db";
import {attempt, held, ok, type Outcome} from "./outcome";

export type GrantState = "open" | "closed";

export type Grant = {
  id: number;
  payer: `0x${string}`;
  beneficiary: `0x${string}`;
  asset: `0x${string}`;
  assetSymbol: string;
  assetDecimals: number;
  /** Share of the escrow's pool of this asset. The schedule is computed on these. */
  shares: bigint;
  sharesReleased: bigint;
  /** What the payer spent opening it, in stablecoin base units. */
  stableCost: bigint;
  start: number;
  cliffSeconds: number;
  durationSeconds: number;
  tipBps: number;
  isSealed: boolean;
  revoked: boolean;
  frozenVestedShares: bigint;
  reasonHash: `0x${string}`;
  /** The reason text, when it is stored here AND hashes to the grant's own hash. A grant
   *  is a money moment like any other and carries the reason it was made. */
  reason: string | null;
  state: GrantState;
  /** Units still held for this grant, priced against the pool right now. */
  heldUnits: bigint;
  /** Units that could be released right now. */
  releasableUnits: bigint;
};

export function escrowAddress(): Outcome<`0x${string}`> {
  const a = process.env.NEXT_PUBLIC_GRANT_ESCROW_ADDRESS?.trim();
  if (!a) {
    return held(
      "GrantEscrow is not deployed yet, so there are no grants to read. " +
        "Set NEXT_PUBLIC_GRANT_ESCROW_ADDRESS once it is.",
    );
  }
  return ok(a as `0x${string}`);
}

function client() {
  return createPublicClient({chain: xLayer, transport: http()});
}

/** How many grants have ever been opened. Ids run 1..count. */
export function grantCount(): Promise<Outcome<number>> {
  return attempt("the number of grants", async () => {
    const escrow = escrowAddress();
    if (!escrow.ok) return escrow;
    const n = await client().readContract({
      address: escrow.value,
      abi: grantEscrowAbi,
      functionName: "grantCount",
    });
    return ok(Number(n));
  });
}

async function assetFacts(address: `0x${string}`) {
  const known = assetByAddress(address);
  if (known) return {symbol: known.symbol, decimals: known.decimals};
  try {
    const rpc = client();
    const [symbol, decimals] = await Promise.all([
      rpc.readContract({address, abi: erc20Abi, functionName: "symbol"}),
      rpc.readContract({address, abi: erc20Abi, functionName: "decimals"}),
    ]);
    return {symbol, decimals};
  } catch {
    // An asset that will not answer is still a grant that exists.
    return {symbol: "units", decimals: 18};
  }
}

/** One grant, with the live unit figures the contract alone can compute. */
export function readGrant(id: number): Promise<Outcome<Grant>> {
  return attempt(`grant ${id}`, async () => {
    const escrow = escrowAddress();
    if (!escrow.ok) return escrow;

    const rpc = client();
    const g = await rpc.readContract({
      address: escrow.value,
      abi: grantEscrowAbi,
      functionName: "grant",
      args: [BigInt(id)],
    });

    const [heldUnits, releasableUnits] = await Promise.all([
      rpc.readContract({
        address: escrow.value,
        abi: grantEscrowAbi,
        functionName: "heldUnits",
        args: [BigInt(id)],
      }),
      rpc.readContract({
        address: escrow.value,
        abi: grantEscrowAbi,
        functionName: "releasableUnits",
        args: [BigInt(id)],
      }),
    ]);

    const facts = await assetFacts(g.asset);

    return ok({
      id,
      payer: g.payer,
      beneficiary: g.beneficiary,
      asset: g.asset,
      assetSymbol: facts.symbol,
      assetDecimals: facts.decimals,
      shares: g.shares,
      sharesReleased: g.sharesReleased,
      stableCost: g.stableCost,
      start: Number(g.start),
      cliffSeconds: Number(g.cliff),
      durationSeconds: Number(g.duration),
      tipBps: Number(g.tipBps),
      isSealed: g.isSealed,
      revoked: g.revoked,
      frozenVestedShares: g.frozenVestedShares,
      reasonHash: g.reasonHash,
      reason: (() => {
        const stored = reasonFor(g.reasonHash);
        // Text that does not hash to the grant's hash is not the reason it was made, and
        // showing it would be a lie with a real grant underneath it.
        return stored.found && stored.verified ? stored.text : null;
      })(),
      state: g.state === 2 ? "closed" : "open",
      heldUnits,
      releasableUnits,
    } satisfies Grant);
  });
}

/**
 * Every grant, newest first. A hackathon-scale read: the contract has one counter and a
 * handful of grants, so this is honest and simple. When there are thousands it becomes an
 * indexer query, and the page above it does not change.
 */
export function readGrants(limit = 50): Promise<Outcome<Grant[]>> {
  return attempt("the grants", async () => {
    const count = await grantCount();
    if (!count.ok) return count;

    const ids: number[] = [];
    for (let id = count.value; id > 0 && ids.length < limit; id--) ids.push(id);

    const results = await Promise.all(ids.map((id) => readGrant(id)));
    const grants: Grant[] = [];
    for (const r of results) {
      // One unreadable grant must not empty the page.
      if (r.ok) grants.push(r.value);
    }
    return ok(grants);
  });
}
