/**
 * THE INDEXER. Walks the contracts' logs into SQLite so a page can read a company's whole
 * history without asking the chain forty times.
 *
 * THREE RULES, ALL THREE LEARNED THE EXPENSIVE WAY ON THE OTHER PROJECT.
 *
 * 1. THE PUBLIC RPC REFUSES WIDE `eth_getLogs` RANGES. Every read is windowed, and the
 *    window HALVES on a refusal rather than the walk dying — some endpoints refuse by
 *    range and some by result count, and you cannot tell which from the error.
 *
 * 2. THE CURSOR ONLY ADVANCES WHEN A WINDOW WAS READ CLEANLY. A refused range leaves it
 *    where it was. That is the difference between an indexer that is merely behind and one
 *    that has silently skipped a payment nobody will ever look for again.
 *
 * 3. THE CHAIN IS THE SOURCE OF TRUTH, NOT THIS. Everything here is a copy for speed.
 *    Delete var/warrant.db and it rebuilds; nothing is stored here that cannot be.
 *
 * And one learned on this one: X Layer's public endpoints answer about two or three reads a
 * second from one address (measured 23 Sep: 12 of 80 back-to-back reads came back 429,
 * "over rate limit"). A throttle is not about the window, so halving is the wrong answer to
 * it; the walk waits and asks again, and the long walk paces itself so the site, which
 * shares the address, still gets its reads.
 */
import {createPublicClient, http, parseAbiItem, parseEventLogs, type Address, type TransactionReceipt} from "viem";
import {LOG_WINDOW, STABLE, xLayer} from "./chain";
import {confirmClaims, stableMovements, type Claim} from "./confirm";
import {database, writeCursor, readCursor} from "./db";
import {PAID_EVENT, payrollAddress} from "./receipts";
import {escrowAddress} from "./grants";
import {attempt, isThrottle, ok, type Outcome} from "./outcome";

export const GRANT_OPENED_EVENT = parseAbiItem(
  "event GrantOpened(uint256 indexed id, address indexed payer, address indexed beneficiary, address asset, uint256 units, uint256 shares, uint256 stableCost, uint64 start, uint64 cliff, uint64 duration, uint16 tipBps, bytes32 reasonHash)",
);

export const VESTED_EVENT = parseAbiItem(
  "event Vested(uint256 indexed id, address indexed beneficiary, address indexed caller, address asset, uint256 unitsToBeneficiary, uint256 unitsToCaller, uint256 sharesReleased, uint256 sharesTotal)",
);

/**
 * WHERE TO BEGIN WHEN A CONTRACT HAS NEVER BEEN INDEXED.
 *
 * Not block zero. X Layer is past 71 million blocks, and starting there means tens of
 * thousands of windows of nothing before reaching the first payment — on a fork it simply
 * hangs, and on mainnet it burns an afternoon of rate limit to learn what a binary search
 * answers in about twenty-seven reads.
 *
 * So: find the first block at which the contract HAS code. `eth_getCode` at a historical
 * block is cheap and monotonic — a contract that exists at block N exists at every block
 * after it — which is exactly what a binary search needs.
 *
 * WARRANT_START_BLOCK overrides it, for an endpoint that will not serve historical state.
 */
async function findDeployBlock(address: Address, head: bigint): Promise<bigint> {
  const configured = process.env.WARRANT_START_BLOCK?.trim();
  if (configured) return BigInt(configured);

  const rpc = client();
  let low = 0n;
  let high = head;

  // If it has no code at the head it is not deployed; index nothing rather than everything.
  const atHead = await rpc.getBytecode({address, blockNumber: head});
  if (!atHead || atHead === "0x") return head;

  while (low < high) {
    const mid = (low + high) / 2n;
    let code: `0x${string}` | undefined;
    try {
      code = await rpc.getBytecode({address, blockNumber: mid});
    } catch {
      // An endpoint that will not serve state that old cannot be searched. Fall back to
      // the head, which indexes from now on rather than guessing at history.
      return head;
    }
    if (code && code !== "0x") high = mid;
    else low = mid + 1n;
  }
  return low;
}

const client = () => createPublicClient({chain: xLayer, transport: http()});

/** How far behind the tip the walk stays. X Layer makes a block about every second. */
const CONFIRMATIONS = 3n;

/** How long `npm run index` rests between windows. Page loads never pace; they read two. */
const PACE_MS = Number(process.env.WARRANT_INDEX_PACE_MS ?? 400);
const rest = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type IndexReport = {
  contract: string;
  /** True when this pass had to find the contract's deploy block first. */
  cold: boolean;
  from: number;
  to: number;
  windows: number;
  narrowings: number;
  rows: number;
};

type Walker = {
  name: string;
  address: Address;
  /** Reads one window and writes whatever it found. Returns how many rows it wrote. */
  read: (from: bigint, to: bigint) => Promise<number>;
};

/**
 * Walk one contract forward to the head. `maxWindows` bounds a single pass so a cold start
 * on a long chain makes progress and returns rather than running for an hour — the cursor
 * is durable, so the next pass continues where this one stopped.
 */
async function walk(w: Walker, maxWindows = 400, paceMs = 0): Promise<Outcome<IndexReport>> {
  return attempt(`the ${w.name} log`, async () => {
    const rpc = client();
    // A few blocks short of the tip: an L2 rarely rewrites its newest blocks, but a cursor
    // that moved past a block that then changed would never read it again.
    const head = (await rpc.getBlockNumber()) - CONFIRMATIONS;

    const last = readCursor(w.name);
    let from = last === null ? await findDeployBlock(w.address, head) : BigInt(last) + 1n;
    const cold = last === null;
    if (from > head) {
      return ok({
        contract: w.name,
        cold,
        from: Number(from),
        to: Number(head),
        windows: 0,
        narrowings: 0,
        rows: 0,
      });
    }

    const began = from;
    let window = LOG_WINDOW;
    let windows = 0;
    let narrowings = 0;
    let rows = 0;
    let waits = 0;

    while (from <= head && windows < maxWindows) {
      const to = from + window - 1n > head ? head : from + window - 1n;

      try {
        rows += await w.read(from, to);
      } catch (err) {
        const why = err instanceof Error ? err.message.split("\n")[0] : String(err);
        if (isThrottle(err)) {
          // A page load does not wait on a throttle: behind is fine, the indexer catches up.
          if (paceMs === 0) break;
          // The indexer asks for the same window a little later: 1s, 2s, 4s… a minute in all.
          if (waits < 6) {
            await rest(1000 * 2 ** waits++);
            continue;
          }
        }
        // Some endpoints refuse by block range and some by result count, and the error
        // does not say which. Halving handles both. The cursor does not move.
        if (window > 1n) {
          window = window / 2n;
          narrowings++;
          continue;
        }
        throw new Error(`${w.name}: even a single block was refused at ${from} (${why})`);
      }

      // Only now, with the window safely read.
      writeCursor(w.name, Number(to));
      from = to + 1n;
      windows++;
      waits = 0;
      if (paceMs > 0 && from <= head) await rest(paceMs);

      // Creep back up so one bad patch does not slow the whole walk forever.
      if (window < LOG_WINDOW) window = window * 2n > LOG_WINDOW ? LOG_WINDOW : window * 2n;
    }

    return ok({
      contract: w.name,
      cold,
      from: Number(began),
      to: Number(from - 1n),
      windows,
      narrowings,
      rows,
    });
  });
}

/** Block timestamps, one read per distinct block rather than one per log. */
async function timesFor(blocks: bigint[]): Promise<Map<bigint, number>> {
  const rpc = client();
  const out = new Map<bigint, number>();
  await Promise.all(
    [...new Set(blocks)].map(async (blockNumber) => {
      try {
        const b = await rpc.getBlock({blockNumber});
        out.set(blockNumber, Number(b.timestamp));
      } catch {
        // left absent; a surface says nothing about when rather than guessing
      }
    }),
  );
  return out;
}

/**
 * KEEP ONLY WHAT ITS TRANSACTION BACKS (lib/confirm.ts): a listed stock, and USDT that
 * really left the payer. One receipt read per transaction. A receipt that will not read
 * throws, so the window is read again — an honest payment is never dropped for being slow.
 * A claim its transaction does not back is dropped for good, and the log says so.
 */
async function backed<L extends {transactionHash: `0x${string}` | null}>(
  logs: L[],
  contract: Address,
  claimOf: (l: L) => Claim,
  inHand?: TransactionReceipt,
): Promise<L[]> {
  const rpc = client();
  const byTx = new Map<`0x${string}`, L[]>();
  for (const l of logs) {
    const h = l.transactionHash!;
    byTx.set(h, [...(byTx.get(h) ?? []), l]);
  }
  const keep: L[] = [];
  for (const [hash, group] of byTx) {
    const receipt =
      inHand && inHand.transactionHash.toLowerCase() === hash.toLowerCase()
        ? inHand
        : await rpc.getTransactionReceipt({hash});
    const verdict = confirmClaims(group.map(claimOf), stableMovements(receipt.logs, STABLE.address), contract);
    if (verdict.ok) keep.push(...group);
    else console.warn(`[indexer] ${hash} not recorded: ${verdict.why}`);
  }
  return keep;
}

function payrollWalker(address: Address): Walker {
  return {
    name: `payroll:${address.toLowerCase()}`,
    address,
    read: async (from, to) => {
      const found = await client().getLogs({address, event: PAID_EVENT, fromBlock: from, toBlock: to});
      if (found.length === 0) return 0;
      const logs = await backed(found, address, paidClaim);
      return writePaid(logs);
    },
  };
}

type Located = {transactionHash: `0x${string}` | null; logIndex: number | null; blockNumber: bigint | null};
type PaidRow = Located & {
  args: {
    payer?: Address;
    recipient?: Address;
    runId?: `0x${string}`;
    asset?: Address;
    stableAmount?: bigint;
    cashAmount?: bigint;
    assetAmount?: bigint;
    reasonHash?: `0x${string}`;
  };
};

const paidClaim = (l: PaidRow): Claim => ({
  payer: l.args.payer!,
  recipient: l.args.recipient!,
  asset: l.args.asset!,
  stable: l.args.stableAmount!,
  cash: l.args.cashAmount!,
});

/** Write confirmed payments. The same row arriving twice is ignored. */
async function writePaid(logs: PaidRow[]): Promise<number> {
  if (logs.length === 0) return 0;
  const times = await timesFor(logs.map((l) => l.blockNumber!));
  const insert = database().prepare(
    `INSERT INTO receipts (tx_hash, log_index, block_number, block_time, payer, recipient,
       run_id, asset, stable_amount, cash_amount, asset_amount, reason_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tx_hash, log_index) DO NOTHING`,
  );
  database().transaction(() => {
    for (const l of logs) {
      const a = l.args;
      insert.run(
        l.transactionHash!.toLowerCase(),
        l.logIndex,
        Number(l.blockNumber),
        times.get(l.blockNumber!) ?? null,
        a.payer!.toLowerCase(),
        a.recipient!.toLowerCase(),
        a.runId!,
        a.asset!.toLowerCase(),
        a.stableAmount!.toString(),
        a.cashAmount!.toString(),
        a.assetAmount!.toString(),
        a.reasonHash!,
      );
    }
  })();
  return logs.length;
}

function escrowWalker(address: Address): Walker {
  return {
    name: `escrow:${address.toLowerCase()}`,
    address,
    read: async (from, to) => {
      const rpc = client();
      const [found, vested] = await Promise.all([
        rpc.getLogs({address, event: GRANT_OPENED_EVENT, fromBlock: from, toBlock: to}),
        rpc.getLogs({address, event: VESTED_EVENT, fromBlock: from, toBlock: to}),
      ]);
      if (found.length === 0 && vested.length === 0) return 0;
      const opened = await backed(found, address, openedClaim);
      return writeEscrow(opened, vested);
    },
  };
}

type OpenedRow = Located & {
  args: {
    id?: bigint;
    payer?: Address;
    beneficiary?: Address;
    asset?: Address;
    units?: bigint;
    shares?: bigint;
    stableCost?: bigint;
    start?: bigint;
    cliff?: bigint;
    duration?: bigint;
    tipBps?: number;
    reasonHash?: `0x${string}`;
  };
};
type VestedRow = Located & {
  args: {
    id?: bigint;
    beneficiary?: Address;
    caller?: Address;
    asset?: Address;
    unitsToBeneficiary?: bigint;
    unitsToCaller?: bigint;
  };
};

const openedClaim = (l: OpenedRow): Claim => ({
  payer: l.args.payer!,
  recipient: l.args.beneficiary!,
  asset: l.args.asset!,
  stable: l.args.stableCost!,
  cash: 0n,
});

/** Write confirmed grants, and the vests of grants on the record. Repeats are ignored. */
async function writeEscrow(opened: OpenedRow[], vested: VestedRow[]): Promise<number> {
  if (opened.length === 0 && vested.length === 0) return 0;
  const times = await timesFor([...opened, ...vested].map((l) => l.blockNumber!));
  const db = database();

  const insertGrant = db.prepare(
    `INSERT INTO grants (id, tx_hash, block_number, block_time, payer, beneficiary, asset,
       units, shares, stable_cost, start_at, cliff_seconds, duration_secs, tip_bps, reason_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  );
  const insertVest = db.prepare(
    `INSERT INTO vests (tx_hash, log_index, block_number, block_time, grant_id, beneficiary,
       caller, asset, units_to_beneficiary, units_to_caller)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tx_hash, log_index) DO NOTHING`,
  );

  // A vest belongs on the record only if its grant does: one the check refused never
  // became a row, so neither do its vests.
  const known = db.prepare(`SELECT 1 FROM grants WHERE id = ?`);
  let rows = 0;

  db.transaction(() => {
    for (const l of opened) {
      const a = l.args;
      insertGrant.run(
        Number(a.id!),
        l.transactionHash!.toLowerCase(),
        Number(l.blockNumber),
        times.get(l.blockNumber!) ?? null,
        a.payer!.toLowerCase(),
        a.beneficiary!.toLowerCase(),
        a.asset!.toLowerCase(),
        a.units!.toString(),
        a.shares!.toString(),
        a.stableCost!.toString(),
        Number(a.start!),
        Number(a.cliff!),
        Number(a.duration!),
        Number(a.tipBps!),
        a.reasonHash!,
      );
      rows++;
    }
    for (const l of vested) {
      const a = l.args;
      if (!known.get(Number(a.id!))) continue;
      rows++;
      insertVest.run(
        l.transactionHash!.toLowerCase(),
        l.logIndex,
        Number(l.blockNumber),
        times.get(l.blockNumber!) ?? null,
        Number(a.id!),
        a.beneficiary!.toLowerCase(),
        a.caller!.toLowerCase(),
        a.asset!.toLowerCase(),
        a.unitsToBeneficiary!.toString(),
        a.unitsToCaller!.toString(),
      );
    }
  })();
  return rows;
}

/**
 * RECORD ONE TRANSACTION, NOW: the one the payer just signed.
 *
 * The walk reaches it within a pass, but "within a pass" is the moment the payer is sent
 * to the run page to see everyone paid. This reads that transaction's receipt, puts its
 * payments and grant events through the same check and the same writers as the walk, and
 * leaves every cursor where it was — it proves nothing about the blocks around it.
 */
export async function recordTransaction(hash: `0x${string}`): Promise<number> {
  const receipt = await client().getTransactionReceipt({hash});
  if (receipt.status !== "success") return 0;
  let rows = 0;

  const payroll = payrollAddress();
  if (payroll.ok) {
    const mine = receipt.logs.filter((l) => l.address.toLowerCase() === payroll.value.toLowerCase());
    const paid = parseEventLogs({abi: [PAID_EVENT], logs: mine});
    rows += await writePaid(await backed(paid, payroll.value, paidClaim, receipt));
  }

  const escrow = escrowAddress();
  if (escrow.ok) {
    const mine = receipt.logs.filter((l) => l.address.toLowerCase() === escrow.value.toLowerCase());
    const opened = parseEventLogs({abi: [GRANT_OPENED_EVENT], logs: mine});
    const vested = parseEventLogs({abi: [VESTED_EVENT], logs: mine});
    rows += await writeEscrow(await backed(opened, escrow.value, openedClaim, receipt), vested);
  }

  return rows;
}

let lastCatchUp = 0;
const CATCH_UP_EVERY_MS = 10_000;

/**
 * CATCH UP TO THE HEAD, QUICKLY, FOR A PAGE THAT IS ABOUT TO RENDER.
 *
 * `/receipt/[tx]` reads its transaction straight from the chain, so a stub is openable the
 * instant a payment confirms. The company and run pages read the indexer — so without
 * this, paying someone and then showing them the public record shows an empty page, which
 * is the demo failing at the exact moment it should land.
 *
 * Bounded on purpose. It only moves a cursor that already exists, and only a window or
 * two, so a page load never turns into a cold start over seventy million blocks. A
 * contract that has never been indexed is left to `npm run index`, and the page says so.
 */
export async function catchUp(maxWindows = 2): Promise<IndexReport[]> {
  // Page loads share ONE allowance of chain reads, however many people are loading pages:
  // a catch-up at most every ten seconds for the whole process. The indexer keeps the record
  // current on its own; this only closes the last few seconds. Without the cap, anyone could
  // spend the site's read budget by opening company pages for random addresses.
  const now = Date.now();
  if (now - lastCatchUp < CATCH_UP_EVERY_MS) return [];
  lastCatchUp = now;

  const reports: IndexReport[] = [];

  for (const w of walkers()) {
    // A cold start is not a page load's job.
    if (readCursor(w.name) === null) continue;
    const r = await walk(w, maxWindows);
    // A page must still render if the chain refuses; being behind is not an error here.
    if (r.ok) reports.push(r.value);
  }

  return reports;
}

/** Whichever contracts are deployed, as walkers. */
function walkers(): Walker[] {
  const out: Walker[] = [];
  const payroll = payrollAddress();
  if (payroll.ok) out.push(payrollWalker(payroll.value));
  const escrow = escrowAddress();
  if (escrow.ok) out.push(escrowWalker(escrow.value));
  return out;
}

/** One pass over everything that is deployed. */
export async function indexOnce(): Promise<IndexReport[]> {
  const reports: IndexReport[] = [];
  for (const w of walkers()) {
    const r = await walk(w, 400, PACE_MS);
    if (!r.ok) throw new Error(r.why);
    reports.push(r.value);
  }
  return reports;
}
