/**
 * WHAT THE RECORD SAYS ABOUT ONE PERSON: the choice they signed, and what they were paid.
 *
 * Server only — it reads SQLite. lib/choice.ts holds the choice's rules and runs in the
 * browser too, so the readers that touch the database live here instead.
 *
 * Every figure is a count or an exact sum over rows the indexer copied from the chain, the
 * same way lib/company.ts reads a company. Nothing is estimated.
 */
import {assetByAddress} from "./assets";
import type {StoredChoice} from "./choice";
import {
  countOpenedGrants,
  readOpenedGrants,
  sameGrant,
  type CompanyReceipt,
  type DeliveredAsset,
  type GrantReader,
  type LiveGrant,
} from "./company";
import {database, readChoiceAt, readLatestChoice} from "./db";
import {readGrant} from "./grants";
import {held, ok, type Outcome} from "./outcome";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * The latest choice this wallet has signed and Warrant has checked, or null if it has never
 * chosen. Any case of the address. Checked when it was saved; not checked again here.
 */
export function choiceFor(person: string): StoredChoice | null {
  if (!ADDRESS.test(person)) return null;
  return readLatestChoice(person);
}

/**
 * The choice that stood at a moment: the latest one signed at or before `unixSeconds`, or
 * null if there was none yet. A receipt uses it to say whether a payment followed the
 * person's choice at the time it was made.
 */
export function choiceAt(person: string, unixSeconds: number): StoredChoice | null {
  if (!ADDRESS.test(person) || !Number.isFinite(unixSeconds)) return null;
  return readChoiceAt(person, Math.floor(unixSeconds));
}

export type PaidTo = {
  address: `0x${string}`;
  paymentCount: number;
  /** How many different wallets have paid this one. */
  payers: number;
  /** Block time of the first payment to this wallet, or null if there are none. */
  since: number | null;
  /** Everything paid to this wallet, in USDT base units, before the split. */
  totalStable: bigint;
  /** The part that arrived as USDT. */
  cashTotal: bigint;
  /** The stock that arrived, per asset. Units of two stocks are never added together. */
  deliveredByAsset: DeliveredAsset[];
  /** Newest first, at most `limit` of them. The figures above count every one. */
  receipts: CompanyReceipt[];
};

/** Everything paid to one wallet, each row as the company page shows it. */
export function readPaidTo(person: string, limit = 200): Outcome<PaidTo> {
  if (!ADDRESS.test(person)) {
    return held("That is not an address, so nothing can have been paid to it.");
  }
  const who = person.toLowerCase();
  const db = database();

  const rows = db
    .prepare(
      `SELECT r.*, n.text AS reason_text
         FROM receipts r
         LEFT JOIN reasons n ON n.hash = r.reason_hash
        WHERE r.recipient = ?
        ORDER BY r.block_number DESC, r.log_index DESC
        LIMIT ?`,
    )
    .all(who, limit) as Array<Record<string, unknown>>;

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS payments, COUNT(DISTINCT payer) AS payers, MIN(block_time) AS first_at
         FROM receipts WHERE recipient = ?`,
    )
    .get(who) as {payments: number; payers: number; first_at: number | null};

  // Exact, in bigint, over EVERY row rather than the page above: SQLite's SUM over a TEXT
  // column is a float, and a total of the first 200 is not the total.
  const amounts = db
    .prepare(`SELECT asset, stable_amount, cash_amount, asset_amount FROM receipts WHERE recipient = ?`)
    .all(who) as Array<{asset: string; stable_amount: string; cash_amount: string; asset_amount: string}>;

  let totalStable = 0n;
  let cashTotal = 0n;
  const byAsset = new Map<string, bigint>();
  for (const a of amounts) {
    totalStable += BigInt(a.stable_amount);
    cashTotal += BigInt(a.cash_amount);
    const units = BigInt(a.asset_amount);
    if (units > 0n) byAsset.set(a.asset, (byAsset.get(a.asset) ?? 0n) + units);
  }

  return ok({
    address: who as `0x${string}`,
    paymentCount: totals.payments ?? 0,
    payers: totals.payers ?? 0,
    since: totals.first_at,
    totalStable,
    cashTotal,
    deliveredByAsset: [...byAsset.entries()].map(([asset, units]) => {
      const facts = assetFacts(asset);
      return {asset: asset as `0x${string}`, symbol: facts.symbol, decimals: facts.decimals, units};
    }),
    receipts: rows.map(toReceipt),
  });
}

// ── the grants that name one wallet ────────────────────────────────────────────────────

export type GrantsOf = {
  address: `0x${string}`;
  /** How many grants the record holds for this wallet: every one, not only those read. */
  count: number;
  /** Read live from the escrow, newest first. */
  grants: LiveGrant[];
  /** Asked for and not read, newest first, each with the reason, so a page can say so. */
  unread: {id: number; why: string}[];
};

async function liveGrantsOf(
  side: "beneficiary" | "payer",
  who: string,
  limit: number,
  read: GrantReader,
): Promise<Outcome<GrantsOf>> {
  if (!ADDRESS.test(who)) return held("That is not an address, so no grant can name it.");
  const filter = side === "beneficiary" ? {beneficiary: who} : {payer: who};
  const opened = readOpenedGrants(filter, limit);
  const results = await Promise.all(opened.map((o) => read(o.id)));

  const grants: LiveGrant[] = [];
  const unread: {id: number; why: string}[] = [];
  results.forEach((r, i) => {
    const o = opened[i]!;
    if (!r.ok) unread.push({id: o.id, why: r.why});
    else if (!sameGrant(r.value, o)) {
      unread.push({id: o.id, why: `Grant ${o.id} on the escrow is not the grant the record holds, so it is not shown.`});
    } else grants.push({opened: o, grant: r.value});
  });

  return ok({address: who.toLowerCase() as `0x${string}`, count: countOpenedGrants(filter), grants, unread});
}

/**
 * EVERY GRANT THAT VESTS TO THIS WALLET, newest first: the openings the indexer copied from
 * the chain, each read live from the escrow, so a sealed, released or cancelled grant shows
 * as it stands now. Any case of the address.
 */
export function grantsFor(
  beneficiary: string,
  options: {limit?: number; read?: GrantReader} = {},
): Promise<Outcome<GrantsOf>> {
  return liveGrantsOf("beneficiary", beneficiary, options.limit ?? 20, options.read ?? readGrant);
}

/** Every grant this wallet has made to someone, newest first, read the same way. */
export function grantsBy(
  payer: string,
  options: {limit?: number; read?: GrantReader} = {},
): Promise<Outcome<GrantsOf>> {
  return liveGrantsOf("payer", payer, options.limit ?? 20, options.read ?? readGrant);
}

// ── one row, exactly as lib/company.ts reads it ────────────────────────────────────────
// A second copy of company.ts's private toReceipt: the person's rows must read the same as
// the company's. lib/person.test.ts reads one payment through both and fails if they differ.

function assetFacts(address: string) {
  const known = assetByAddress(address);
  return known ? {symbol: known.symbol, decimals: known.decimals} : {symbol: "units", decimals: 18};
}

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
