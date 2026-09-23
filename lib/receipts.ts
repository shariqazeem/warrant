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
import {createPublicClient, http, parseAbiItem, parseEventLogs, type Log} from "viem";
import {STABLE, xLayer} from "./chain";
import {confirmClaims, stableMovements} from "./confirm";
import {database} from "./db";
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

/**
 * EARLIER PAYROLL DEPLOYMENTS THAT PAID SOMEONE, oldest first. A redeploy doesn't unpay
 * anybody: their receipts keep opening and the record keeps counting them. The `Paid` event
 * has the same shape on every one. (The 22 Sep deployment on the older USDT, 0xbe70…b5cD,
 * never paid anyone and is not listed.)
 */
export const EARLIER_PAYROLLS: ReadonlyArray<{address: `0x${string}`; fromBlock: bigint}> = [
  // 23 Sep 2026, on USD₮0, before each line carried its own stock. Paid the first real payment.
  {address: "0xBf9C067056DA555Dd99D14694B9BC771Fab7AE09", fromBlock: 71416682n},
];

/** Every Payroll whose payments are on the record: the current one first, then the earlier. */
export function payrollDeployments(): Array<{address: `0x${string}`; fromBlock: bigint | null}> {
  const current = payrollAddress();
  const out: Array<{address: `0x${string}`; fromBlock: bigint | null}> = [];
  if (current.ok) out.push({address: current.value, fromBlock: null});
  for (const e of EARLIER_PAYROLLS) {
    if (!out.some((d) => d.address.toLowerCase() === e.address.toLowerCase())) out.push(e);
  }
  return out;
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

    // A payment that is already on the record costs no reads at all. A shared stub is
    // opened by everyone who sees the post, and the public endpoint answers two or three
    // reads a second; reading the chain for each of them is how a good day takes it down.
    const stored = storedPayments(hash);
    if (stored.length > 0) return ok(stored);

    const rpc = client();
    const receipt = await rpc.getTransactionReceipt({hash});

    if (receipt.status !== "success") {
      return held(
        "That transaction was cancelled on chain, so nothing was paid and nobody was " +
          "charged.",
      );
    }

    // The payments are in the transaction's own receipt: no second read. Any Payroll this
    // site has ever paid through counts, so an older receipt still opens after a redeploy.
    const known = new Set(payrollDeployments().map((d) => d.address.toLowerCase()));
    const mine = parseEventLogs({
      abi: [PAID_EVENT],
      logs: receipt.logs.filter((l) => known.has(l.address.toLowerCase())),
    });
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

    // The event is only as honest as the call that emitted it (lib/confirm.ts): a stub is
    // printed only for a listed stock and USDT that really left the payer — checked
    // against the contract that emitted each payment.
    const moves = stableMovements(receipt.logs, STABLE.address);
    for (const emitter of new Set(mine.map((l) => l.address.toLowerCase()))) {
      const backed = confirmClaims(
        out
          .filter((_, i) => mine[i]!.address.toLowerCase() === emitter)
          .map((r) => ({
            payer: r.payer,
            recipient: r.recipient,
            asset: r.asset,
            stable: r.stableAmount,
            cash: r.cashAmount,
          })),
        moves,
        emitter,
      );
      if (!backed.ok) return backed;
    }

    const stamped = await withTimestamps(rpc, out);
    store(stamped);
    return ok(stamped);
  });
}

type Row = Record<string, unknown>;

/** The rows the indexer (or an earlier read of this receipt) confirmed and kept. */
function storedPayments(hash: `0x${string}`): Receipt[] {
  const rows = database()
    .prepare(`SELECT * FROM receipts WHERE tx_hash = ? ORDER BY log_index`)
    .all(hash.toLowerCase()) as Row[];
  return rows.map((r) => ({
    txHash: String(r.tx_hash) as `0x${string}`,
    logIndex: Number(r.log_index),
    blockNumber: BigInt(Number(r.block_number)),
    timestamp: r.block_time === null ? null : Number(r.block_time),
    payer: String(r.payer) as `0x${string}`,
    recipient: String(r.recipient) as `0x${string}`,
    runId: String(r.run_id) as `0x${string}`,
    asset: String(r.asset) as `0x${string}`,
    stableAmount: BigInt(String(r.stable_amount)),
    cashAmount: BigInt(String(r.cash_amount)),
    assetAmount: BigInt(String(r.asset_amount)),
    reasonHash: String(r.reason_hash) as `0x${string}`,
  }));
}

/**
 * Keep what was just confirmed, in the same table and shape the indexer writes, so the
 * next visitor reads it from here. The same row arriving twice is ignored; the indexer's
 * cursor is untouched, because this proves nothing about the blocks around it.
 */
export function store(receipts: readonly Receipt[]): void {
  const insert = database().prepare(
    `INSERT INTO receipts (tx_hash, log_index, block_number, block_time, payer, recipient,
       run_id, asset, stable_amount, cash_amount, asset_amount, reason_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tx_hash, log_index) DO NOTHING`,
  );
  database().transaction(() => {
    for (const r of receipts) {
      insert.run(
        r.txHash.toLowerCase(),
        r.logIndex,
        Number(r.blockNumber),
        r.timestamp,
        r.payer.toLowerCase(),
        r.recipient.toLowerCase(),
        r.runId,
        r.asset.toLowerCase(),
        r.stableAmount.toString(),
        r.cashAmount.toString(),
        r.assetAmount.toString(),
        r.reasonHash,
      );
    }
  })();
}
