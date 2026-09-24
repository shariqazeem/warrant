/**
 * READING GRANTS OFF THE CHAIN.
 *
 * A grant's terms live in contract storage rather than in logs, because they change —
 * sealed, revoked, released — and a page should show what is true now, not what was
 * announced once. `grantCount()` then `grant(id)` is two reads and no cursor.
 */
import {BaseError, ContractFunctionRevertedError, createPublicClient, erc20Abi, http} from "viem";
import {grantEscrowAbi} from "./payroll-abi";
import {transport, xLayer} from "./chain";
import {assetByAddress} from "./assets";
import {reasonFor} from "./db";
import {dateUTC} from "./format";
import {attempt, held, map, ok, type Outcome} from "./outcome";

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
      "Grants are not switched on for this site yet.",
    );
  }
  return ok(a as `0x${string}`);
}

function client() {
  return createPublicClient({chain: xLayer, transport: transport()});
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

/** The contract refused the read with this custom error, rather than the endpoint failing. */
function revertedWith(err: unknown, name: string): boolean {
  if (!(err instanceof BaseError)) return false;
  const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
  return reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName === name;
}

/**
 * A grant's id as it is written in a link: a whole number from 1, with no leading zero, so
 * each grant has exactly one address. Anything else is not a grant, and is null.
 */
export function parseGrantId(raw: string): number | null {
  if (!/^[1-9][0-9]{0,8}$/.test(raw)) return null;
  return Number(raw);
}

/**
 * One grant, or null when the escrow has never opened one with this id.
 *
 * The two are told apart by the contract itself: an id it has never used reverts with
 * `NoSuchGrant`, which the public endpoint returns and viem names (checked against the live
 * escrow on 23 Sep). Anything else — a throttle, a timeout — is a read that failed, and a
 * page must say so rather than tell a visitor the grant does not exist.
 */
export function findGrant(id: number): Promise<Outcome<Grant | null>> {
  return attempt(`grant ${id}`, async () => {
    const escrow = escrowAddress();
    if (!escrow.ok) return escrow;

    const rpc = client();
    let g;
    try {
      g = await rpc.readContract({
        address: escrow.value,
        abi: grantEscrowAbi,
        functionName: "grant",
        args: [BigInt(id)],
      });
    } catch (err) {
      if (revertedWith(err, "NoSuchGrant")) return ok(null);
      throw err;
    }

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

/** One grant, with the live unit figures the contract alone can compute. */
export async function readGrant(id: number): Promise<Outcome<Grant>> {
  const found = await findGrant(id);
  if (!found.ok) return found;
  return found.value === null ? held(`There is no grant ${id}.`) : ok(found.value);
}

/** The grants a page asked for, and an honest account of the ones it did not get. */
export type GrantShelf = {
  /** Every grant the escrow has ever opened. Ids run 1..count. */
  count: number;
  /** How many of the newest were asked for: the limit, or all of them if there are fewer. */
  asked: number;
  /** The ones that could be read, newest first. */
  grants: Grant[];
  /** The ones asked for that could not be read, newest first, each with the reason. */
  unread: {id: number; why: string}[];
};

/**
 * The newest grants, newest first. A hackathon-scale read: the contract has one counter and
 * a handful of grants, so this is honest and simple. When there are thousands it becomes an
 * indexer query, and the page above it does not change.
 *
 * ONE UNREADABLE GRANT MUST NOT EMPTY THE PAGE, AND MUST NOT VANISH FROM IT EITHER. The
 * public endpoint throttles at two or three reads a second and each grant is three reads, so
 * a grant that will not read is an ordinary event. It is kept in `unread` with its reason,
 * and a page says how many of how many it is showing.
 */
export function readGrantShelf(limit = 50): Promise<Outcome<GrantShelf>> {
  return attempt("the grants", async () => {
    const count = await grantCount();
    if (!count.ok) return count;

    const ids: number[] = [];
    for (let id = count.value; id > 0 && ids.length < limit; id--) ids.push(id);

    const results = await Promise.all(ids.map((id) => readGrant(id)));
    const grants: Grant[] = [];
    const unread: {id: number; why: string}[] = [];
    results.forEach((r, i) => {
      if (r.ok) grants.push(r.value);
      else unread.push({id: ids[i]!, why: r.why});
    });
    return ok({count: count.value, asked: ids.length, grants, unread});
  });
}

/**
 * Every grant that could be read, newest first — the keeper's view, where a grant that did
 * not read this pass is simply released on the next one. A page reads `readGrantShelf`
 * instead, because a page has to say what it is missing.
 */
export async function readGrants(limit = 50): Promise<Outcome<Grant[]>> {
  return map(await readGrantShelf(limit), (shelf) => shelf.grants);
}

/** The heading over a shelf of grants. It never claims more than was read. */
export function shelfHeading(shelf: Pick<GrantShelf, "count" | "asked" | "grants">): string {
  const read = shelf.grants.length;
  const all = shelf.asked === shelf.count;
  if (read === shelf.asked) {
    return all ? `Grants (${shelf.count})` : `The newest ${shelf.asked} of ${shelf.count} grants`;
  }
  return all
    ? `${read} of ${shelf.count} grants could be read`
    : `${read} of the newest ${shelf.asked} grants could be read`;
}

/** Where a grant stands, in the words a page shows beside it. */
export type Standing = {
  kind: "closed" | "cancelled" | "fully-vested" | "not-started" | "before-cliff" | "vesting";
  /** The chip. */
  label: string;
  /** What is true of it now, in plain sentences. Dates only; the figures sit in their rows. */
  words: string;
  /** Sealed: nobody can cancel it, including the company that opened it. */
  irrevocable: boolean;
};

/**
 * WHAT STATE A GRANT IS IN, from its terms on chain and the clock.
 *
 * The order matters. Closed and cancelled are facts the contract records and time cannot
 * undo, so they are asked first; the schedule only speaks for a grant still running on it.
 * "Cancelled" keeps the promise the contract makes: what had vested stays theirs.
 */
export function grantStanding(
  g: Pick<Grant, "state" | "revoked" | "isSealed" | "start" | "cliffSeconds" | "durationSeconds">,
  now: number,
): Standing {
  const irrevocable = g.isSealed;
  const ends = g.start + g.durationSeconds;
  const cliff = g.start + g.cliffSeconds;

  if (g.state === "closed") {
    return {
      kind: "closed",
      label: "Closed",
      words: g.revoked
        ? "Closed. It was cancelled, and everything that had vested by then was released to them."
        : "Closed. It vested in full and everything was released to them.",
      irrevocable,
    };
  }

  if (g.revoked) {
    return {
      kind: "cancelled",
      label: "Cancelled",
      words:
        "Cancelled by the company. What had vested by then stays theirs and can still be " +
        "released to them; the rest went back to the company. Nothing more will vest.",
      irrevocable,
    };
  }

  // Only an unsealed grant with something still to vest can lose anything to a cancel.
  const lock = irrevocable
    ? " It is irrevocable: nobody can cancel it, including the company."
    : now < ends
      ? " The company can still cancel the part that has not vested yet."
      : "";

  if (now >= ends) {
    return {
      kind: "fully-vested",
      label: "Fully vested",
      words: `Fully vested on ${dateUTC(ends)}: all of it is theirs.${lock}`,
      irrevocable,
    };
  }
  if (now < g.start) {
    return {
      kind: "not-started",
      label: "Not started",
      words: `Vesting starts on ${dateUTC(g.start)} and ends on ${dateUTC(ends)}.${lock}`,
      irrevocable,
    };
  }
  if (now < cliff) {
    return {
      kind: "before-cliff",
      label: "Vesting",
      words:
        `Vesting. Nothing can be released before the cliff on ${dateUTC(cliff)}, when ` +
        `everything vested up to then becomes theirs at once.${lock}`,
      irrevocable,
    };
  }
  return {
    kind: "vesting",
    label: "Vesting",
    words: `Vesting a little every second until it is fully vested on ${dateUTC(ends)}.${lock}`,
    irrevocable,
  };
}
