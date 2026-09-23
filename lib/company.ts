/**
 * A COMPANY'S PUBLIC RECORD, read from the indexer.
 *
 * Every figure here is a sum over rows the indexer copied from the chain. Nothing is
 * estimated and nothing is projected: "paid in ownership since" is the first payment's
 * block time, "people paid" is a count of distinct recipients, and the total is a sum of
 * what was actually pulled from the payer.
 */
import {database} from "./db";
import {assetByAddress} from "./assets";
import {held, ok, type Outcome} from "./outcome";

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

function assetFacts(address: string) {
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
