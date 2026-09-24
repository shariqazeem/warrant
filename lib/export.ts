/**
 * A COMPANY'S RECORD AS A FILE FOR ITS ACCOUNTANT.
 *
 * One CSV with every payment it made, every grant it opened and every release from those
 * grants, one row each, read from the same rows the public record shows. Amounts are exact:
 * written out from the on-chain integers with every decimal the token has, never rounded,
 * so the file sums to the chain. Unit prices round DOWN, as everything a person receives does.
 *
 * Notes are text the company typed, and a spreadsheet runs a cell that starts with "=" as a
 * formula. Every cell that could be read as one is written with a leading apostrophe.
 */
import {formatUnits} from "viem";
import {assetByAddress} from "./assets";
import {database} from "./db";
import {held, ok, type Outcome} from "./outcome";
import {normaliseReason} from "./reason";

export const EXPORT_COLUMNS = [
  "kind",
  "date_utc",
  "transaction",
  "payer",
  "recipient",
  "stock",
  "stock_address",
  "usdt_paid",
  "usdt_as_cash",
  "units",
  "unit_price_usdt",
  "release_fee_units",
  "run_id",
  "grant_id",
  "vesting_start_utc",
  "cliff_seconds",
  "duration_seconds",
  "release_fee_bps",
  "note",
] as const;

export type ExportColumn = (typeof EXPORT_COLUMNS)[number];
export type ExportRow = Partial<Record<ExportColumn, string>>;

/** A cell a spreadsheet would read as a formula starts with one of these. */
const FORMULA = /^[=+\-@\t\r]/;

/** One CSV cell: quoted when it must be, and defused when it could run as a formula. */
export function csvCell(value: string | undefined): string {
  if (value === undefined || value === "") return "";
  const safe = FORMULA.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: ExportRow[]): string {
  const lines = [EXPORT_COLUMNS.join(",")];
  for (const row of rows) lines.push(EXPORT_COLUMNS.map((c) => csvCell(row[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** ISO date-time in UTC, to the second, or empty when the block time was not read. */
const isoUTC = (unixSeconds: number | null): string =>
  unixSeconds === null ? "" : new Date(unixSeconds * 1000).toISOString().replace(".000Z", "Z");

/** A run id written as the name it was given, when it is one; the raw bytes otherwise. */
function runName(runId: string): string {
  const hex = runId.replace(/^0x/, "");
  if (hex.length !== 64) return runId;
  let out = "";
  for (let i = 0; i < 64; i += 2) {
    const code = parseInt(hex.slice(i, i + 2), 16);
    if (code === 0) break;
    if (code < 0x20 || code > 0x7e) return runId;
    out += String.fromCharCode(code);
  }
  return out || runId;
}

function stockOf(address: string): {symbol: string; decimals: number} {
  if (/^0x0{40}$/i.test(address)) return {symbol: "", decimals: 18};
  const known = assetByAddress(address);
  return known ? {symbol: known.symbol, decimals: known.decimals} : {symbol: "unlisted", decimals: 18};
}

/** What one unit cost, in USDT, rounded down to the cent's hundredth of a cent (6 dp). */
export function unitPrice(spentStable: bigint, units: bigint, decimals: number): string {
  if (units <= 0n || spentStable <= 0n) return "";
  return formatUnits((spentStable * 10n ** BigInt(decimals)) / units, 6);
}

type ReceiptRow = {
  tx_hash: string;
  block_time: number | null;
  payer: string;
  recipient: string;
  run_id: string;
  asset: string;
  stable_amount: string;
  cash_amount: string;
  asset_amount: string;
  reason_text: string | null;
};

type GrantRow = {
  id: number;
  tx_hash: string;
  block_time: number | null;
  payer: string;
  beneficiary: string;
  asset: string;
  units: string;
  stable_cost: string;
  start_at: number;
  cliff_seconds: number;
  duration_secs: number;
  tip_bps: number;
  reason_text: string | null;
};

type VestRow = {
  tx_hash: string;
  block_time: number | null;
  grant_id: number;
  beneficiary: string;
  asset: string;
  units_to_beneficiary: string;
  units_to_caller: string;
};

/** Every payment, grant and release for one payer, oldest first, as rows of the export. */
export function readExport(payer: string): Outcome<ExportRow[]> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(payer)) {
    return held("That is not an address, so there is no record to export.");
  }
  const who = payer.toLowerCase();
  const db = database();

  const receipts = db
    .prepare(
      `SELECT r.tx_hash, r.block_time, r.payer, r.recipient, r.run_id, r.asset, r.stable_amount,
              r.cash_amount, r.asset_amount, n.text AS reason_text
         FROM receipts r LEFT JOIN reasons n ON n.hash = r.reason_hash
        WHERE r.payer = ?
        ORDER BY r.block_number ASC, r.log_index ASC`,
    )
    .all(who) as ReceiptRow[];

  const grants = db
    .prepare(
      `SELECT g.id, g.tx_hash, g.block_time, g.payer, g.beneficiary, g.asset, g.units, g.stable_cost,
              g.start_at, g.cliff_seconds, g.duration_secs, g.tip_bps, n.text AS reason_text
         FROM grants g LEFT JOIN reasons n ON n.hash = g.reason_hash
        WHERE g.payer = ?
        ORDER BY g.block_number ASC`,
    )
    .all(who) as GrantRow[];

  const vests = db
    .prepare(
      `SELECT v.tx_hash, v.block_time, v.grant_id, v.beneficiary, v.asset, v.units_to_beneficiary,
              v.units_to_caller
         FROM vests v JOIN grants g ON g.id = v.grant_id
        WHERE g.payer = ?
        ORDER BY v.block_number ASC, v.log_index ASC`,
    )
    .all(who) as VestRow[];

  type Dated = {at: number; row: ExportRow};
  const out: Dated[] = [];

  for (const r of receipts) {
    const stock = stockOf(r.asset);
    const stable = BigInt(r.stable_amount);
    const cash = BigInt(r.cash_amount);
    const units = BigInt(r.asset_amount);
    out.push({
      at: r.block_time ?? 0,
      row: {
        kind: "payment",
        date_utc: isoUTC(r.block_time),
        transaction: r.tx_hash,
        payer: r.payer,
        recipient: r.recipient,
        stock: stock.symbol,
        stock_address: stock.symbol ? r.asset : "",
        usdt_paid: formatUnits(stable, 6),
        usdt_as_cash: formatUnits(cash, 6),
        units: stock.symbol ? formatUnits(units, stock.decimals) : "",
        unit_price_usdt: stock.symbol ? unitPrice(stable - cash, units, stock.decimals) : "",
        run_id: runName(r.run_id),
        note: r.reason_text ? normaliseReason(r.reason_text) : "",
      },
    });
  }

  for (const g of grants) {
    const stock = stockOf(g.asset);
    const units = BigInt(g.units);
    const cost = BigInt(g.stable_cost);
    out.push({
      at: g.block_time ?? 0,
      row: {
        kind: "grant",
        date_utc: isoUTC(g.block_time),
        transaction: g.tx_hash,
        payer: g.payer,
        recipient: g.beneficiary,
        stock: stock.symbol,
        stock_address: g.asset,
        usdt_paid: formatUnits(cost, 6),
        usdt_as_cash: "0",
        units: formatUnits(units, stock.decimals),
        unit_price_usdt: unitPrice(cost, units, stock.decimals),
        grant_id: String(g.id),
        vesting_start_utc: isoUTC(g.start_at),
        cliff_seconds: String(g.cliff_seconds),
        duration_seconds: String(g.duration_secs),
        release_fee_bps: String(g.tip_bps),
        note: g.reason_text ? normaliseReason(g.reason_text) : "",
      },
    });
  }

  for (const v of vests) {
    const stock = stockOf(v.asset);
    out.push({
      at: v.block_time ?? 0,
      row: {
        kind: "release",
        date_utc: isoUTC(v.block_time),
        transaction: v.tx_hash,
        payer: who,
        recipient: v.beneficiary,
        stock: stock.symbol,
        stock_address: v.asset,
        units: formatUnits(BigInt(v.units_to_beneficiary), stock.decimals),
        release_fee_units: formatUnits(BigInt(v.units_to_caller), stock.decimals),
        grant_id: String(v.grant_id),
      },
    });
  }

  // Oldest first, as a ledger reads; rows without a block time keep their source order.
  out.sort((a, b) => a.at - b.at);
  return ok(out.map((d) => d.row));
}
