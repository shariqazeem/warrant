/**
 * A GRANT'S MONEY MOMENTS, READ OFF THE CHAIN.
 *
 * A payment is one moment. A grant is five: it is opened (USDT buys a stock into the
 * escrow), it vests (units reach the person's own wallet), and it can be sealed (made
 * irrevocable), revoked (the unvested part goes back to the company) and closed. Each one is
 * a transaction anyone can open at /receipt/[tx], and each prints a stub as a payment does.
 *
 * THE OPENING IS THE ONE CLAIM THAT NEEDS CHECKING. `GrantOpened` carries a USDT figure and
 * an asset the caller chose, exactly as `Paid` does, so it is held to lib/confirm.ts before
 * anything about the grant is shown. Every later moment belongs to a grant and prints only
 * if that grant's opening checks out — the rule the indexer already keeps for vests.
 *
 * The decoding and the checks are pure and tested; the readers around them only fetch.
 */
import {createPublicClient, decodeEventLog, http, type DecodeEventLogReturnType} from "viem";
import {STABLE, transport, xLayer} from "./chain";
import {assetByAddress} from "./assets";
import {confirmClaims, stableMovements, type Claim, type Movement} from "./confirm";
import {database} from "./db";
import {escrowAddress, findGrant, type Grant} from "./grants";
import {grantEscrowAbi} from "./payroll-abi";
import {attempt, held, ok, type Outcome} from "./outcome";

type Hex = `0x${string}`;

/** USDT bought a stock into the escrow, to vest to the beneficiary. */
export type OpenedMoment = {
  kind: "opened";
  id: number;
  logIndex: number;
  payer: Hex;
  beneficiary: Hex;
  asset: Hex;
  /** What the escrow received, in the asset's smallest unit. */
  units: bigint;
  /** The grant's share of the escrow's pool of that asset; the schedule runs on these. */
  shares: bigint;
  /** The USDT the payer committed, in base units. The caller's claim, until it is checked. */
  stableCost: bigint;
  start: number;
  cliffSeconds: number;
  durationSeconds: number;
  tipBps: number;
  reasonHash: Hex;
};

/** Units left the escrow for the beneficiary's own wallet, and a fee for whoever called. */
export type VestedMoment = {
  kind: "vested";
  id: number;
  logIndex: number;
  beneficiary: Hex;
  caller: Hex;
  asset: Hex;
  unitsToBeneficiary: bigint;
  unitsToCaller: bigint;
  /** Shares released over the grant's life, this release included. */
  sharesReleased: bigint;
  /** The grant's shares when it released. */
  sharesTotal: bigint;
};

/** The company gave up the right to cancel. No money moves. */
export type SealedMoment = {kind: "sealed"; id: number; logIndex: number; payer: Hex};

/** The company cancelled: the unvested part went back to it, the vested part stays theirs. */
export type RevokedMoment = {
  kind: "revoked";
  id: number;
  logIndex: number;
  payer: Hex;
  vestedUnits: bigint;
  returnedUnits: bigint;
};

/** Everything owed was released and the grant was closed. No money moves. */
export type ClosedMoment = {kind: "closed"; id: number; logIndex: number; unused: bigint};

export type GrantMoment = OpenedMoment | VestedMoment | SealedMoment | RevokedMoment | ClosedMoment;

type RawLog = {address: string; topics: readonly Hex[]; data: Hex; logIndex: number | null};

const isOpened = (m: GrantMoment): m is OpenedMoment => m.kind === "opened";

function toMoment(d: DecodeEventLogReturnType<typeof grantEscrowAbi>, logIndex: number): GrantMoment {
  switch (d.eventName) {
    case "GrantOpened": {
      const a = d.args;
      return {
        kind: "opened",
        id: Number(a.id),
        logIndex,
        payer: a.payer,
        beneficiary: a.beneficiary,
        asset: a.asset,
        units: a.units,
        shares: a.shares,
        stableCost: a.stableCost,
        start: Number(a.start),
        cliffSeconds: Number(a.cliff),
        durationSeconds: Number(a.duration),
        tipBps: a.tipBps,
        reasonHash: a.reasonHash,
      };
    }
    case "Vested": {
      const a = d.args;
      return {
        kind: "vested",
        id: Number(a.id),
        logIndex,
        beneficiary: a.beneficiary,
        caller: a.caller,
        asset: a.asset,
        unitsToBeneficiary: a.unitsToBeneficiary,
        unitsToCaller: a.unitsToCaller,
        sharesReleased: a.sharesReleased,
        sharesTotal: a.sharesTotal,
      };
    }
    case "GrantSealed":
      return {kind: "sealed", id: Number(d.args.id), logIndex, payer: d.args.payer};
    case "GrantRevoked":
      return {
        kind: "revoked",
        id: Number(d.args.id),
        logIndex,
        payer: d.args.payer,
        vestedUnits: d.args.vestedUnits,
        returnedUnits: d.args.returnedUnits,
      };
    case "GrantClosed":
      return {kind: "closed", id: Number(d.args.id), logIndex, unused: d.args.unused};
  }
}

/**
 * Every GrantEscrow event in a transaction's logs, in the order they happened.
 *
 * ONLY THE ESCROW'S OWN LOGS. Anyone can deploy a contract that emits an event with the same
 * name and the same fields; only the ones emitted by the contract that holds the stock are
 * grant moments. And the escrow emits nothing but these five, so a log from it that will not
 * decode is refused rather than skipped: a receipt with a moment silently missing is not a
 * receipt.
 */
export function decodeGrantMoments(logs: readonly RawLog[], escrow: string): Outcome<GrantMoment[]> {
  const self = escrow.toLowerCase();
  const out: GrantMoment[] = [];

  for (const log of logs) {
    if (log.address.toLowerCase() !== self) continue;

    let decoded: DecodeEventLogReturnType<typeof grantEscrowAbi> | null = null;
    try {
      decoded = decodeEventLog({
        abi: grantEscrowAbi,
        topics: [...log.topics] as [Hex, ...Hex[]],
        data: log.data,
      });
    } catch {
      // held below
    }
    if (decoded === null || log.logIndex === null) {
      return held("This transaction carries a grant event that could not be read, so it is not shown.");
    }
    out.push(toMoment(decoded, log.logIndex));
  }

  return ok(out.sort((a, b) => a.logIndex - b.logIndex));
}

/**
 * What a `GrantOpened` claims, in lib/confirm.ts's terms: the payer's USDT went to the
 * escrow, and none of it came back as cash. lib/indexer.ts checks the same claim before a
 * grant becomes a row; the two must stay the same shape.
 */
export function openingClaim(o: OpenedMoment): Claim {
  return {payer: o.payer, recipient: o.beneficiary, asset: o.asset, stable: o.stableCost, cash: 0n};
}

/**
 * Whether the openings in one transaction are backed by what it moved. lib/confirm.ts
 * decides; this only says the verdict in a grant's words rather than a payment's.
 */
export function confirmOpenings(
  openings: readonly OpenedMoment[],
  moves: readonly Movement[],
  escrow: string,
): Outcome<true> {
  if (openings.length === 0) return ok(true);
  const verdict = confirmClaims(openings.map(openingClaim), moves, escrow);
  if (verdict.ok) return verdict;
  return held(
    openings.every((o) => assetByAddress(o.asset) !== undefined)
      ? "This grant says more USDT went into it than actually left the payer's wallet, so " +
          "it is not shown as a grant."
      : "This grant names a token that is not one of the stocks Warrant lists, so it is not " +
          "shown as a grant.",
  );
}

/**
 * The live grant and the opening on record must agree on every term the contract never
 * changes after it is opened. If they do not, the record is of some other grant — a cache
 * left over from another deployment, say — and neither is shown.
 */
export function openingMatches(g: Grant, o: OpenedMoment): Outcome<true> {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const agrees =
    g.id === o.id &&
    same(g.payer, o.payer) &&
    same(g.beneficiary, o.beneficiary) &&
    same(g.asset, o.asset) &&
    same(g.reasonHash, o.reasonHash) &&
    g.stableCost === o.stableCost &&
    g.start === o.start &&
    g.cliffSeconds === o.cliffSeconds &&
    g.durationSeconds === o.durationSeconds &&
    g.tipBps === o.tipBps;
  return agrees
    ? ok(true)
    : held(
        `What the escrow holds as grant ${g.id} does not match the transaction on record as ` +
          "opening it, so it is not shown.",
      );
}

/** A grant's opening, checked, and where it is anchored. */
export type Opening = {
  moment: OpenedMoment;
  txHash: Hex;
  blockNumber: bigint;
  /** Unix seconds; null when the block would not read, and then nothing is said about when. */
  timestamp: number | null;
};

const client = () => createPublicClient({chain: xLayer, transport: transport()});

async function blockTime(rpc: ReturnType<typeof client>, blockNumber: bigint): Promise<number | null> {
  try {
    return Number((await rpc.getBlock({blockNumber})).timestamp);
  } catch {
    return null;
  }
}

/**
 * HOW ONE GRANT WAS OPENED, CHECKED AGAINST THE CHAIN.
 *
 * The contract stores a grant's terms but not the transaction that opened it, so that comes
 * from the indexer's copy of `GrantOpened` — and then the transaction itself is read again
 * and held to lib/confirm.ts, because a cache is not a source of truth. A grant the indexer
 * has not reached yet, or one whose opening did not check out and never became a row, is
 * not shown; the sentence says both.
 */
export function readGrantOpening(id: number): Promise<Outcome<Opening>> {
  return attempt(`how grant ${id} was opened`, async () => {
    const escrow = escrowAddress();
    if (!escrow.ok) return escrow;

    const row = database().prepare(`SELECT tx_hash, block_time FROM grants WHERE id = ?`).get(id) as
      | {tx_hash: string; block_time: number | null}
      | undefined;
    if (!row) {
      return held(
        `Grant ${id} is on X Layer, but this site has not yet confirmed the transaction that ` +
          "opened it — that the USDT it names really left the payer's wallet and bought a " +
          "stock Warrant lists — so it is not shown. A grant opened in the last few minutes " +
          "appears once the chain has been read up to it.",
      );
    }

    const rpc = client();
    const receipt = await rpc.getTransactionReceipt({hash: row.tx_hash as Hex});
    const decoded = receipt.status === "success" ? decodeGrantMoments(receipt.logs, escrow.value) : ok([]);
    if (!decoded.ok) return decoded;

    const opened = decoded.value.filter(isOpened);
    const mine = opened.find((m) => m.id === id);
    if (!mine) {
      return held(
        `The transaction on record as opening grant ${id} did not open it on this escrow, so ` +
          "it is not shown.",
      );
    }

    // Every opening in the transaction together, as the indexer checked them: one payer's
    // USDT is one pull, however many grants it paid for.
    const backed = confirmOpenings(opened, stableMovements(receipt.logs, STABLE.address), escrow.value);
    if (!backed.ok) return backed;

    return ok({
      moment: mine,
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      timestamp: row.block_time ?? (await blockTime(rpc, receipt.blockNumber)),
    });
  });
}

/** One grant moment as its receipt prints it. */
export type GrantReceipt = {
  moment: GrantMoment;
  /** The checked opening of the grant this moment belongs to. For an opening, itself. */
  opening: Opening;
  txHash: Hex;
  blockNumber: bigint;
  timestamp: number | null;
};

/**
 * Every grant moment in one transaction, for `/receipt/[tx]`. An empty list means the
 * transaction did nothing to a grant, and the page says what it says about any other
 * transaction.
 *
 * An opening is checked against the transaction it is in, so a grant's first receipt prints
 * the moment it confirms, with no indexer involved. Any later moment needs its grant's
 * opening, which comes from readGrantOpening.
 */
export function readGrantMoments(hash: Hex): Promise<Outcome<GrantReceipt[]>> {
  return attempt("this transaction", async () => {
    // Grants are not switched on, so nothing here can be one of their moments.
    const escrow = escrowAddress();
    if (!escrow.ok) return ok([]);

    const rpc = client();
    const receipt = await rpc.getTransactionReceipt({hash});
    // A reverted transaction did nothing; the payment reader already says so in its words.
    if (receipt.status !== "success") return ok([]);

    const decoded = decodeGrantMoments(receipt.logs, escrow.value);
    if (!decoded.ok) return decoded;
    if (decoded.value.length === 0) return ok([]);

    const opened = decoded.value.filter(isOpened);
    const backed = confirmOpenings(opened, stableMovements(receipt.logs, STABLE.address), escrow.value);
    if (!backed.ok) return backed;

    const timestamp = await blockTime(rpc, receipt.blockNumber);
    const openings = new Map<number, Opening>();
    for (const o of opened) {
      openings.set(o.id, {moment: o, txHash: receipt.transactionHash, blockNumber: receipt.blockNumber, timestamp});
    }

    for (const m of decoded.value) {
      if (openings.has(m.id)) continue;
      const o = await readGrantOpening(m.id);
      if (!o.ok) return held(`This transaction belongs to grant ${m.id}. ${o.why}`);
      openings.set(m.id, o.value);
    }

    return ok(
      decoded.value.map((m) => ({
        moment: m,
        opening: openings.get(m.id)!,
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        timestamp,
      })),
    );
  });
}

/** One release of a grant, as the indexer copied it from a `Vested` log. */
export type Vest = {
  txHash: Hex;
  logIndex: number;
  blockNumber: number;
  blockTime: number | null;
  caller: Hex;
  unitsToBeneficiary: bigint;
  unitsToCaller: bigint;
};

/**
 * Every release of one grant, oldest first. A row counts only if it names the grant's own
 * asset and beneficiary, as every real one does: the table is a cache, and a cache left
 * over from another deployment must not lend its rows to this one.
 */
export function grantVests(g: Pick<Grant, "id" | "asset" | "beneficiary">): Vest[] {
  const rows = database()
    .prepare(
      `SELECT tx_hash, log_index, block_number, block_time, caller, units_to_beneficiary,
              units_to_caller
         FROM vests
        WHERE grant_id = ? AND asset = ? AND beneficiary = ?
        ORDER BY block_number ASC, log_index ASC`,
    )
    .all(g.id, g.asset.toLowerCase(), g.beneficiary.toLowerCase()) as Array<{
    tx_hash: string;
    log_index: number;
    block_number: number;
    block_time: number | null;
    caller: string;
    units_to_beneficiary: string;
    units_to_caller: string;
  }>;

  return rows.map((r) => ({
    txHash: r.tx_hash as Hex,
    logIndex: r.log_index,
    blockNumber: r.block_number,
    blockTime: r.block_time,
    caller: r.caller as Hex,
    unitsToBeneficiary: BigInt(r.units_to_beneficiary),
    unitsToCaller: BigInt(r.units_to_caller),
  }));
}

/** Everything `/grant/[id]` shows. */
export type GrantRecord = {grant: Grant; opening: Opening; vests: Vest[]};

/**
 * ONE GRANT'S PUBLIC RECORD, or null when the escrow has never opened a grant with this id.
 *
 * The grant is read live from the escrow. Its opening is read from the transaction on record
 * and checked before anything else is shown, and the two must agree on every term the
 * contract never changes. The releases come from the indexer's copy, each one a transaction
 * with its own receipt.
 */
export function readGrantRecord(id: number): Promise<Outcome<GrantRecord | null>> {
  return attempt(`grant ${id}`, async () => {
    const [found, opening] = await Promise.all([findGrant(id), readGrantOpening(id)]);
    if (!found.ok) return found;
    if (found.value === null) return ok(null);
    if (!opening.ok) return opening;

    const same = openingMatches(found.value, opening.value.moment);
    if (!same.ok) return same;

    return ok({grant: found.value, opening: opening.value, vests: grantVests(found.value)});
  });
}
