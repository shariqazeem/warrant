/**
 * READING PAYMENTS OFF THE CHAIN.
 *
 * The `Paid` event is the record. This is the direct reader: it walks logs in small
 * windows and decodes them. The SQLite indexer will sit in front of this for the pages
 * that need speed; a single receipt never needs it, because the transaction itself carries
 * the log.
 *
 * A receipt reads the single block its transaction landed in, so it never meets the
 * public RPC's range cap. The history — the tape, a company's record — is walked by
 * lib/indexer.ts in windows the endpoint accepts.
 */
import {createPublicClient, http, parseAbiItem, type Log} from "viem";
import {xLayer} from "./chain";
import {attempt, held, ok, type Outcome} from "./outcome";

export const PAID_EVENT = parseAbiItem(
  "event Paid(address indexed payer, address indexed recipient, bytes32 indexed runId, address asset, uint256 stableAmount, uint256 cashAmount, uint256 assetAmount, bytes32 reasonHash)",
);

export type Receipt = {
  txHash: `0x${string}`;
  logIndex: number;
  blockNumber: bigint;
  /** Unix seconds, read from the block. Null when the block could not be read — a surface
   *  then says nothing about when, rather than guessing. */
  timestamp: number | null;
  payer: `0x${string}`;
  recipient: `0x${string}`;
  runId: `0x${string}`;
  asset: `0x${string}`;
  /** The stablecoin pulled from the payer, in its smallest unit. USDT is 6 decimals. */
  stableAmount: bigint;
  /** The part delivered as the stablecoin, unswapped. */
  cashAmount: bigint;
  /** The asset that reached the recipient's own wallet, in its smallest unit. */
  assetAmount: bigint;
  reasonHash: `0x${string}`;
};

export function client() {
  return createPublicClient({chain: xLayer, transport: http()});
}

/** The deployed rail, or a hold saying it is not deployed yet. */
export function payrollAddress(): Outcome<`0x${string}`> {
  const a = process.env.NEXT_PUBLIC_PAYROLL_ADDRESS?.trim();
  if (!a) {
    return held(
      "Payments are not switched on for this site yet.",
    );
  }
  return ok(a as `0x${string}`);
}

type PaidLog = Log<bigint, number, false, typeof PAID_EVENT>;

/**
 * Fill in when each payment settled, one read per distinct block rather than one per
 * receipt. A block that will not read leaves `timestamp` null, and the surface then says
 * nothing about when — it does not guess, and it does not fall back to zero, which would
 * print 1970 on a receipt.
 */
async function withTimestamps(
  rpc: ReturnType<typeof client>,
  receipts: Receipt[],
): Promise<Receipt[]> {
  const blocks = [...new Set(receipts.map((r) => r.blockNumber))];
  const stamps = new Map<bigint, number>();

  await Promise.all(
    blocks.map(async (blockNumber) => {
      try {
        const block = await rpc.getBlock({blockNumber});
        stamps.set(blockNumber, Number(block.timestamp));
      } catch {
        // left absent on purpose; see the note above
      }
    }),
  );

  return receipts.map((r) => ({...r, timestamp: stamps.get(r.blockNumber) ?? null}));
}

function toReceipt(log: PaidLog): Outcome<Receipt> {
  const a = log.args;
  if (
    !log.transactionHash ||
    log.logIndex === null ||
    log.blockNumber === null ||
    a.payer === undefined ||
    a.recipient === undefined ||
    a.runId === undefined ||
    a.asset === undefined ||
    a.stableAmount === undefined ||
    a.cashAmount === undefined ||
    a.assetAmount === undefined ||
    a.reasonHash === undefined
  ) {
    return held("A Paid log arrived without all of its fields, so it cannot be rendered.");
  }
  return ok({
    txHash: log.transactionHash,
    logIndex: log.logIndex,
    blockNumber: log.blockNumber,
    timestamp: null,
    payer: a.payer,
    recipient: a.recipient,
    runId: a.runId,
    asset: a.asset,
    stableAmount: a.stableAmount,
    cashAmount: a.cashAmount,
    assetAmount: a.assetAmount,
    reasonHash: a.reasonHash,
  });
}

/**
 * Every payment in one transaction. This is what `/receipt/[tx]` reads, and it needs no
 * indexer and no cursor: a receipt is anchored to a transaction, so the transaction is
 * where it is read from.
 */
export function paidInTransaction(hash: `0x${string}`): Promise<Outcome<Receipt[]>> {
  return attempt("this transaction", async () => {
    const address = payrollAddress();
    if (!address.ok) return address;

    const rpc = client();
    const receipt = await rpc.getTransactionReceipt({hash});

    if (receipt.status !== "success") {
      return held(
        "That transaction was cancelled on chain, so nothing was paid and nobody was " +
          "charged.",
      );
    }

    const logs = await rpc.getLogs({
      address: address.value,
      event: PAID_EVENT,
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    const mine = logs.filter((l) => l.transactionHash?.toLowerCase() === hash.toLowerCase());
    if (mine.length === 0) {
      return held(
        "That transaction exists, but it was not a Warrant payment, so there is no " +
          "receipt for it.",
      );
    }

    const out: Receipt[] = [];
    for (const log of mine) {
      const r = toReceipt(log);
      if (!r.ok) return r;
      out.push(r.value);
    }
    return ok(await withTimestamps(rpc, out));
  });
}
