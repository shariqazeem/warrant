/**
 * A COMPANY'S PUBLIC RECORD, read from the indexer.
 *
 * Every figure here is a sum over rows the indexer copied from the chain. Nothing is
 * estimated and nothing is projected: "paid in ownership since" is the first payment's
 * block time, "people paid" is a count of distinct recipients, and the total is a sum of
 * what was actually pulled from the payer.
 */
import {erc20Abi} from "viem";
// Server only: it reads SQLite, and the grant readers below read the escrow live.
import {database, routeFor} from "./db";
import {assetByAddress} from "./assets";
import type {PoolFacts} from "./certificate-data";
import {escrowAddress, readGrant, type Grant} from "./grants";
import {attempt, held, ok, type Outcome} from "./outcome";
import {grantEscrowAbi} from "./payroll-abi";
import {client} from "./receipts";

export type CompanyReceipt = {
  txHash: `0x${string}`;
  logIndex: number;
  blockNumber: number;
  blockTime: number | null;
  /** Who paid. Implicit on a company's own page; the rail spans every company, so it is
   *  carried on the row rather than inferred from context. */
  payer: `0x${string}`;
  recipient: `0x${string}`;
  runId: `0x${string}`;
  asset: `0x${string}`;
  assetSymbol: string;
  assetDecimals: number;
  stableAmount: bigint;
  cashAmount: bigint;
  assetAmount: bigint;
  reasonHash: `0x${string}`;
  reason: string | null;
};

export type CompanyGrant = {
  id: number;
  beneficiary: `0x${string}`;
  asset: `0x${string}`;
  assetSymbol: string;
  assetDecimals: number;
  units: bigint;
  stableCost: bigint;
  startAt: number;
  cliffSeconds: number;
  durationSeconds: number;
  reason: string | null;
};

export type DeliveredAsset = {
  asset: `0x${string}`;
  symbol: string;
  decimals: number;
  units: bigint;
};

export type Company = {
  address: `0x${string}`;
  /** Block time of the first payment or grant, or null if there are none. */
  since: number | null;
  peoplePaid: number;
  paymentCount: number;
  runCount: number;
  totalStable: bigint;
  receipts: CompanyReceipt[];
  /** Summed over EVERY payment, not only the page of them above. */
  deliveredByAsset: DeliveredAsset[];
  grants: CompanyGrant[];
  grantsTotalStable: bigint;
};

/** One row of `receipts`, joined to its reason, as the surfaces want it. One copy. */
function toReceipt(r: Record<string, unknown>): CompanyReceipt {
  const facts = assetFacts(String(r.asset));
  return {
    txHash: String(r.tx_hash) as `0x${string}`,
    logIndex: Number(r.log_index),
    blockNumber: Number(r.block_number),
    blockTime: r.block_time === null ? null : Number(r.block_time),
    payer: String(r.payer) as `0x${string}`,
    recipient: String(r.recipient) as `0x${string}`,
    runId: String(r.run_id) as `0x${string}`,
    asset: String(r.asset) as `0x${string}`,
    assetSymbol: facts.symbol,
    assetDecimals: facts.decimals,
    stableAmount: BigInt(String(r.stable_amount)),
    cashAmount: BigInt(String(r.cash_amount)),
    assetAmount: BigInt(String(r.asset_amount)),
    reasonHash: String(r.reason_hash) as `0x${string}`,
    reason: r.reason_text === null || r.reason_text === undefined ? null : String(r.reason_text),
  };
}

/** How the indexer stores "no stock": a line paid all in dollars names the zero address. */
const ZERO_ASSET = "0x0000000000000000000000000000000000000000";

function assetFacts(address: string) {
  if (address === ZERO_ASSET) return {symbol: "USD₮0", decimals: 6};
  const known = assetByAddress(address);
  return known
    ? {symbol: known.symbol, decimals: known.decimals}
    : {symbol: "units", decimals: 18};
}

/**
 * Reads a company's whole record. Returns a record with zeroes and empty lists when the
 * address has never paid anyone — which a page renders as "nothing yet", in words, rather
 * than as a figure.
 */
export function readCompany(address: string, limit = 200): Outcome<Company> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return held("That is not an address, so there is no company record to show.");
  }
  const who = address.toLowerCase();
  const db = database();

  const rows = db
    .prepare(
      `SELECT r.*, n.text AS reason_text
         FROM receipts r
         LEFT JOIN reasons n ON n.hash = r.reason_hash
        WHERE r.payer = ?
        ORDER BY r.block_number DESC, r.log_index DESC
        LIMIT ?`,
    )
    .all(who, limit) as Array<Record<string, unknown>>;

  const receipts: CompanyReceipt[] = rows.map(toReceipt);

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS payments,
              COUNT(DISTINCT recipient) AS people,
              COUNT(DISTINCT run_id) AS runs,
              MIN(block_time) AS first_at
         FROM receipts WHERE payer = ?`,
    )
    .get(who) as {payments: number; people: number; runs: number; first_at: number | null};

  // DELIBERATELY NOT SUM(). Amounts are stored as TEXT because they are 256-bit, and
  // SQLite's SUM would return a float — fine for an order of magnitude, wrong for money.
  // The total is summed exactly, in bigint, over the rows themselves.
  const exactTotal = (
    db.prepare(`SELECT stable_amount FROM receipts WHERE payer = ?`).all(who) as Array<{
      stable_amount: string;
    }>
  ).reduce((sum, r) => sum + BigInt(r.stable_amount), 0n);

  // OVER EVERY ROW, NOT THE PAGE ABOVE. `receipts` is limited so a page stays fast;
  // summing that list would present a partial total as a complete one, which is the kind
  // of wrong number that looks right. Exact in bigint, for the same reason as the total.
  const deliveredRows = db
    .prepare(`SELECT asset, asset_amount FROM receipts WHERE payer = ?`)
    .all(who) as Array<{asset: string; asset_amount: string}>;

  const byAsset = new Map<string, bigint>();
  for (const row of deliveredRows) {
    // A payment taken all in dollars bought no stock; it counts in the totals, not here.
    if (row.asset === ZERO_ASSET) continue;
    byAsset.set(row.asset, (byAsset.get(row.asset) ?? 0n) + BigInt(row.asset_amount));
  }
  const deliveredByAsset: DeliveredAsset[] = [...byAsset.entries()].map(([asset, units]) => {
    const facts = assetFacts(asset);
    return {asset: asset as `0x${string}`, symbol: facts.symbol, decimals: facts.decimals, units};
  });

  const grantRows = db
    .prepare(
      `SELECT g.*, n.text AS reason_text
         FROM grants g
         LEFT JOIN reasons n ON n.hash = g.reason_hash
        WHERE g.payer = ?
        ORDER BY g.block_number DESC`,
    )
    .all(who) as Array<Record<string, unknown>>;

  const grants: CompanyGrant[] = grantRows.map((g) => {
    const facts = assetFacts(String(g.asset));
    return {
      id: Number(g.id),
      beneficiary: String(g.beneficiary) as `0x${string}`,
      asset: String(g.asset) as `0x${string}`,
      assetSymbol: facts.symbol,
      assetDecimals: facts.decimals,
      units: BigInt(String(g.units)),
      stableCost: BigInt(String(g.stable_cost)),
      startAt: Number(g.start_at),
      cliffSeconds: Number(g.cliff_seconds),
      durationSeconds: Number(g.duration_secs),
      reason: g.reason_text === null || g.reason_text === undefined ? null : String(g.reason_text),
    };
  });

  const grantsTotalStable = grants.reduce((sum, g) => sum + g.stableCost, 0n);

  const firstGrantAt = grantRows.length > 0
    ? Math.min(...grantRows.map((g) => Number(g.block_time ?? Number.MAX_SAFE_INTEGER)))
    : null;

  const sinceCandidates = [totals.first_at, firstGrantAt].filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v < Number.MAX_SAFE_INTEGER,
  );

  return ok({
    address: who as `0x${string}`,
    since: sinceCandidates.length > 0 ? Math.min(...sinceCandidates) : null,
    peoplePaid: totals.people ?? 0,
    paymentCount: totals.payments ?? 0,
    runCount: totals.runs ?? 0,
    totalStable: exactTotal,
    receipts,
    deliveredByAsset,
    grants,
    grantsTotalStable,
  });
}

export type Rail = {
  /** When the first payment on this rail settled, or null if none has. */
  since: number | null;
  companies: number;
  peoplePaid: number;
  paymentCount: number;
  runCount: number;
  grantCount: number;
  totalStable: bigint;
  deliveredByAsset: DeliveredAsset[];
  /** Newest first. */
  recent: CompanyReceipt[];
};

/**
 * THE WHOLE RAIL, for the front door.
 *
 * Every figure is a count or an exact sum over rows the indexer copied from the chain.
 * Before anything has been paid this returns zeroes and an empty list, which the front
 * door renders as a sentence about what will fill it rather than as a figure — a zero on
 * a page about payments reads as a claim.
 */
/** The smallest payment the front page features: one dollar, in USDT's six decimals. */
export const FEATURE_FLOOR = 1_000_000;

export function readRail(limit = 8): Outcome<Rail> {
  const db = database();

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS payments,
              COUNT(DISTINCT recipient) AS people,
              COUNT(DISTINCT payer) AS companies,
              COUNT(DISTINCT run_id) AS runs,
              MIN(block_time) AS first_at
         FROM receipts`,
    )
    .get() as {payments: number; people: number; companies: number; runs: number; first_at: number | null};

  const grants = (db.prepare(`SELECT COUNT(*) AS n FROM grants`).get() as {n: number}).n;

  // Exact, in bigint, for the same reason as everywhere else: SQL SUM over a TEXT column
  // is a float, and a float is not a total.
  const amounts = db.prepare(`SELECT asset, stable_amount, asset_amount FROM receipts`).all() as Array<{
    asset: string;
    stable_amount: string;
    asset_amount: string;
  }>;

  let totalStable = 0n;
  const byAsset = new Map<string, bigint>();
  for (const a of amounts) {
    totalStable += BigInt(a.stable_amount);
    if (a.asset === ZERO_ASSET) continue;
    byAsset.set(a.asset, (byAsset.get(a.asset) ?? 0n) + BigInt(a.asset_amount));
  }

  const deliveredByAsset: DeliveredAsset[] = [...byAsset.entries()].map(([asset, units]) => {
    const facts = assetFacts(asset);
    return {asset: asset as `0x${string}`, symbol: facts.symbol, decimals: facts.decimals, units};
  });

  // What the front page FEATURES has a floor: a dollar or more, and stock actually
  // delivered. A real payment of a millionth of a dollar in cash is still a payment — it
  // counts in every total above and shows on its company's page — but it costs a stranger
  // almost nothing to send, and the front page's hero stub is not a noticeboard.
  const rows = db
    .prepare(
      `SELECT r.*, n.text AS reason_text
         FROM receipts r
         LEFT JOIN reasons n ON n.hash = r.reason_hash
        WHERE r.asset_amount != '0'
          AND CAST(r.stable_amount AS INTEGER) >= ?
        ORDER BY r.block_number DESC, r.log_index DESC
        LIMIT ?`,
    )
    .all(FEATURE_FLOOR, limit) as Array<Record<string, unknown>>;

  return ok({
    since: totals.first_at,
    companies: totals.companies ?? 0,
    peoplePaid: totals.people ?? 0,
    paymentCount: totals.payments ?? 0,
    runCount: totals.runs ?? 0,
    grantCount: grants ?? 0,
    totalStable,
    deliveredByAsset,
    recent: rows.map(toReceipt),
  });
}

/** Every payment in one run, for the run's own public record. */
export function readRun(runId: string): Outcome<CompanyReceipt[]> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(runId)) {
    return held("That is not a run id. A run id is 32 bytes, written as 66 characters.");
  }
  // A run belongs to the payer who used its id first. Anyone can call the contract with
  // any run id, so rows a stranger adds under the same id later are theirs, not this run's.
  const id = runId.toLowerCase();
  const rows = database()
    .prepare(
      `SELECT r.*, n.text AS reason_text
         FROM receipts r
         LEFT JOIN reasons n ON n.hash = r.reason_hash
        WHERE r.run_id = ?
          AND r.payer = (SELECT payer FROM receipts WHERE run_id = ?
                          ORDER BY block_number ASC, log_index ASC LIMIT 1)
        ORDER BY r.block_number ASC, r.log_index ASC`,
    )
    .all(id, id) as Array<Record<string, unknown>>;

  return ok(rows.map(toReceipt));
}

// ── grants as the record holds them, and the public record ──────────────────────────────

/**
 * A GRANT AS ITS OPENING RECORDED IT: the GrantOpened event, copied by the indexer after the
 * USDT it claims was seen leaving the payer. None of these terms changes after opening. What
 * has happened since (sealed, released, cancelled, closed) is only on the contract, and is
 * read live wherever a page shows it.
 */
export type OpenedGrant = {
  id: number;
  txHash: `0x${string}`;
  blockNumber: number;
  blockTime: number | null;
  payer: `0x${string}`;
  beneficiary: `0x${string}`;
  asset: `0x${string}`;
  assetSymbol: string;
  assetDecimals: number;
  /** The units the grant bought when it opened. */
  units: bigint;
  shares: bigint;
  /** What the payer spent opening it, in USDT base units. */
  stableCost: bigint;
  start: number;
  cliffSeconds: number;
  durationSeconds: number;
  tipBps: number;
  reasonHash: `0x${string}`;
  reason: string | null;
};

function toOpenedGrant(g: Record<string, unknown>): OpenedGrant {
  const facts = assetFacts(String(g.asset));
  return {
    id: Number(g.id),
    txHash: String(g.tx_hash) as `0x${string}`,
    blockNumber: Number(g.block_number),
    blockTime: g.block_time === null || g.block_time === undefined ? null : Number(g.block_time),
    payer: String(g.payer) as `0x${string}`,
    beneficiary: String(g.beneficiary) as `0x${string}`,
    asset: String(g.asset) as `0x${string}`,
    assetSymbol: facts.symbol,
    assetDecimals: facts.decimals,
    units: BigInt(String(g.units)),
    shares: BigInt(String(g.shares)),
    stableCost: BigInt(String(g.stable_cost)),
    start: Number(g.start_at),
    cliffSeconds: Number(g.cliff_seconds),
    durationSeconds: Number(g.duration_secs),
    tipBps: Number(g.tip_bps),
    reasonHash: String(g.reason_hash) as `0x${string}`,
    reason: g.reason_text === null || g.reason_text === undefined ? null : String(g.reason_text),
  };
}

type GrantFilter = {beneficiary?: string; payer?: string};

function grantWhere(filter: GrantFilter, prefix: string): {sql: string; args: string[]} {
  const where: string[] = [];
  const args: string[] = [];
  if (filter.beneficiary !== undefined) {
    where.push(`${prefix}beneficiary = ?`);
    args.push(filter.beneficiary.toLowerCase());
  }
  if (filter.payer !== undefined) {
    where.push(`${prefix}payer = ?`);
    args.push(filter.payer.toLowerCase());
  }
  return {sql: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "", args};
}

/**
 * Grant openings on the record, newest first: all of them, or only those naming one wallet
 * as the person it vests to, or as the company that granted it. Any case of the address.
 */
export function readOpenedGrants(filter: GrantFilter = {}, limit = 50): OpenedGrant[] {
  const {sql, args} = grantWhere(filter, "g.");
  const rows = database()
    .prepare(
      `SELECT g.*, n.text AS reason_text
         FROM grants g
         LEFT JOIN reasons n ON n.hash = g.reason_hash
        ${sql}
        ORDER BY g.block_number DESC, g.id DESC
        LIMIT ?`,
    )
    .all(...args, limit) as Array<Record<string, unknown>>;
  return rows.map(toOpenedGrant);
}

/** How many grants the record holds, all of them or one wallet's. */
export function countOpenedGrants(filter: GrantFilter = {}): number {
  const {sql, args} = grantWhere(filter, "");
  const row = database().prepare(`SELECT COUNT(*) AS n FROM grants ${sql}`).get(...args) as {n: number};
  return row.n ?? 0;
}

/** Reads one grant live from the escrow: lib/grants.ts's readGrant, or a test's own. */
export type GrantReader = (id: number) => Promise<Outcome<Grant>>;

/** A grant as it opened, and as the escrow says it stands now. */
export type LiveGrant = {opened: OpenedGrant; grant: Grant};

/**
 * THE ESCROW'S GRANT IS THE ONE THE RECORD HOLDS. The record is a cache, and a cache left
 * over from another deployment must not lend its rows to this escrow's grants: a person
 * would be shown somebody else's grant as theirs. Payer, beneficiary and asset never change
 * after opening, so all three must agree.
 */
export function sameGrant(g: Pick<Grant, "payer" | "beneficiary" | "asset">, o: OpenedGrant): boolean {
  return (
    g.payer.toLowerCase() === o.payer.toLowerCase() &&
    g.beneficiary.toLowerCase() === o.beneficiary.toLowerCase() &&
    g.asset.toLowerCase() === o.asset.toLowerCase()
  );
}

/**
 * THE GRANT THE FRONT PAGE SHOWS: the newest real one, read live. The newest that is sealed
 * and still vesting, if one of the newest few is; otherwise the newest still open and not
 * cancelled; otherwise the newest that could be read. Null when no grant has ever been
 * opened, which the page shows as an unissued certificate, never as a sample.
 *
 * Read one at a time, newest first, and only as far as it must: each grant is three reads
 * against an endpoint that throttles at two or three a second.
 */
export async function readFeaturedGrant(
  options: {tries?: number; read?: GrantReader} = {},
): Promise<Outcome<LiveGrant | null>> {
  const read = options.read ?? readGrant;
  const rows = readOpenedGrants({}, options.tries ?? 6);
  if (rows.length === 0) return ok(null);

  const seen: LiveGrant[] = [];
  let why: string | null = null;
  for (const opened of rows) {
    const r = await read(opened.id);
    if (!r.ok) {
      why ??= r.why;
      continue;
    }
    if (!sameGrant(r.value, opened)) continue;
    const live = {opened, grant: r.value};
    if (r.value.isSealed && r.value.state === "open" && !r.value.revoked) return ok(live);
    seen.push(live);
  }
  const pick =
    seen.find((l) => l.grant.state === "open" && !l.grant.revoked) ??
    seen.find((l) => l.grant.state === "open") ??
    seen[0];
  if (pick) return ok(pick);
  return held(why ?? "The newest grants could not be read just now.");
}

/**
 * THE OKX DEX ROUTE A GRANT WAS BOUGHT THROUGH, by symbol ("USD₮0", "USDG", "wSPYx", "SPYx"),
 * or an empty list when it is not known. The issue flow keeps the route of the real quote it
 * signed (lib/db.ts `routeFor`); a grant opened elsewhere has none, and none is claimed.
 */
export function routeOfGrant(id: number): string[] {
  const row = database().prepare(`SELECT tx_hash FROM grants WHERE id = ?`).get(id) as {tx_hash: string} | undefined;
  return row ? (routeFor(row.tx_hash) ?? []) : [];
}

/**
 * The escrow's pool of one stock: its shares outstanding and the units it holds. With these
 * a grant's shares convert to units exactly as the contract converts them.
 */
export function readEscrowPool(asset: `0x${string}`): Promise<Outcome<PoolFacts>> {
  return attempt("the escrow's holding of this stock", async () => {
    const escrow = escrowAddress();
    if (!escrow.ok) return escrow;
    const rpc = client();
    const [poolShares, escrowBalance] = await Promise.all([
      rpc.readContract({address: escrow.value, abi: grantEscrowAbi, functionName: "poolShares", args: [asset]}),
      rpc.readContract({address: asset, abi: erc20Abi, functionName: "balanceOf", args: [escrow.value]}),
    ]);
    return ok({poolShares, escrowBalance});
  });
}

/** One payroll run on the public record: everyone paid under one run id, by the payer who used it first. */
export type RecordRun = {
  kind: "run";
  runId: `0x${string}`;
  payer: `0x${string}`;
  /** The run's first transaction. Nearly every run is exactly one. */
  txHash: `0x${string}`;
  transactions: number;
  blockNumber: number;
  blockTime: number | null;
  people: number;
  /** Everyone it paid, lower case, so a page can tell a test from someone else's payroll. */
  recipients: `0x${string}`[];
  payments: number;
  totalStable: bigint;
  /** The part that arrived as USDT, over every payslip in the run. */
  cashTotal: bigint;
  /** The stock that arrived, per stock. Units of two stocks are never added together. */
  delivered: DeliveredAsset[];
};

export type RecordGrant = {kind: "grant"} & OpenedGrant;

export type RecordEntry = RecordGrant | RecordRun;

export type PublicRecord = {
  /** Every grant on the record, however many are listed. */
  grantCount: number;
  /** Every run on the record, however many are listed. */
  runCount: number;
  /** Newest first, at most `limit`. */
  entries: RecordEntry[];
};

type RunRow = {
  tx_hash: string;
  log_index: number;
  block_number: number;
  block_time: number | null;
  payer: string;
  recipient: string;
  run_id: string;
  asset: string;
  stable_amount: string;
  cash_amount: string;
  asset_amount: string;
};

/**
 * THE PUBLIC RECORD: every grant and every payroll run, newest first, as the chain's events
 * recorded them. A single payment is a run of one, with its own payslip.
 *
 * A run belongs to the payer who used its id first, exactly as its own page reads it
 * (readRun): anyone can call the contract with any run id, and rows a stranger adds under
 * the same id later are not part of that run.
 *
 * Every figure is a count or an exact bigint sum over rows the indexer copied from the chain.
 */
export function readRecord(limit = 200): Outcome<PublicRecord> {
  const receiptRows = database()
    .prepare(
      `SELECT tx_hash, log_index, block_number, block_time, payer, recipient, run_id, asset,
              stable_amount, cash_amount, asset_amount
         FROM receipts
        ORDER BY block_number ASC, log_index ASC`,
    )
    .all() as RunRow[];

  type Building = {
    run: Omit<RecordRun, "delivered" | "people" | "recipients" | "transactions">;
    recipients: Set<string>;
    txs: Set<string>;
    byAsset: Map<string, bigint>;
  };
  const runs = new Map<string, Building>();
  for (const r of receiptRows) {
    const id = r.run_id.toLowerCase();
    let b = runs.get(id);
    if (!b) {
      b = {
        run: {
          kind: "run",
          runId: id as `0x${string}`,
          payer: r.payer.toLowerCase() as `0x${string}`,
          txHash: r.tx_hash as `0x${string}`,
          blockNumber: r.block_number,
          blockTime: r.block_time,
          payments: 0,
          totalStable: 0n,
          cashTotal: 0n,
        },
        recipients: new Set(),
        txs: new Set(),
        byAsset: new Map(),
      };
      runs.set(id, b);
    }
    // Someone else's rows under an id already in use are not this run's.
    if (r.payer.toLowerCase() !== b.run.payer) continue;
    b.run.payments += 1;
    b.run.totalStable += BigInt(r.stable_amount);
    b.run.cashTotal += BigInt(r.cash_amount);
    b.recipients.add(r.recipient.toLowerCase());
    b.txs.add(r.tx_hash.toLowerCase());
    const units = BigInt(r.asset_amount);
    if (units > 0n && r.asset !== ZERO_ASSET) b.byAsset.set(r.asset, (b.byAsset.get(r.asset) ?? 0n) + units);
  }

  const runEntries: RecordRun[] = [...runs.values()].map((b) => ({
    ...b.run,
    people: b.recipients.size,
    recipients: [...b.recipients] as `0x${string}`[],
    transactions: b.txs.size,
    delivered: [...b.byAsset.entries()].map(([asset, units]) => {
      const facts = assetFacts(asset);
      return {asset: asset as `0x${string}`, symbol: facts.symbol, decimals: facts.decimals, units};
    }),
  }));

  const grants: RecordGrant[] = readOpenedGrants({}, limit).map((g) => ({kind: "grant" as const, ...g}));

  const entries: RecordEntry[] = [...grants, ...runEntries]
    .sort((a, b) => b.blockNumber - a.blockNumber || (a.kind === b.kind ? 0 : a.kind === "grant" ? -1 : 1))
    .slice(0, limit);

  return ok({grantCount: countOpenedGrants(), runCount: runEntries.length, entries});
}
