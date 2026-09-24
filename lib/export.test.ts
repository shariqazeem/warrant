/**
 * THE ACCOUNTANT'S FILE MUST SUM TO THE CHAIN, AND MUST NEVER RUN AS A SPREADSHEET FORMULA.
 */
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {ASSETS} from "./assets";
import {runIdFromName} from "./run-id";

let exp: typeof import("./export");
let db: typeof import("./db");
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "warrant-export-"));
  process.env.WARRANT_DB_PATH = join(dir, "test.db");
  db = await import("./db");
  exp = await import("./export");
});

afterAll(() => rmSync(dir, {recursive: true, force: true}));

const PAYER = "0x00000000000000000000000000000000000000c0";
const ALICE = "0x00000000000000000000000000000000000000a1";
const SPYX = ASSETS[0]!;

describe("a cell", () => {
  it("is quoted when it holds a comma, a quote or a line break", () => {
    expect(exp.csvCell("plain")).toBe("plain");
    expect(exp.csvCell("a, b")).toBe('"a, b"');
    expect(exp.csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(exp.csvCell("two\nlines")).toBe('"two\nlines"');
    expect(exp.csvCell(undefined)).toBe("");
  });

  it("never starts with something a spreadsheet would run", () => {
    for (const evil of ["=HYPERLINK(\"x\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd"]) {
      const cell = exp.csvCell(evil);
      expect(cell.replace(/^"/, "").startsWith("'"), evil).toBe(true);
    }
  });
});

describe("a unit price", () => {
  it("rounds down, never up", () => {
    // $3.00 for 0.003 units of an 18-decimal stock = $1,000 a unit exactly.
    expect(exp.unitPrice(3_000_000n, 3_000_000_000_000_000n, 18)).toBe("1000");
    // $1.00 for 3 units: 0.333333…, cut at 6 dp.
    expect(exp.unitPrice(1_000_000n, 3n * 10n ** 18n, 18)).toBe("0.333333");
    expect(exp.unitPrice(1_000_000n, 0n, 18)).toBe("");
  });
});

describe("the file", () => {
  it("holds every payment, grant and release, oldest first, with exact amounts", () => {
    const d = db.database();
    const note = db.rememberReason("Design review, week 38");
    d.prepare(
      `INSERT INTO receipts (tx_hash, log_index, block_number, block_time, payer, recipient, run_id,
         asset, stable_amount, cash_amount, asset_amount, reason_hash)
       VALUES (?, 0, 10, 1790000000, ?, ?, ?, ?, '5000000', '1250000', '4880000000000000', ?)`,
    ).run(`0x${"a".repeat(64)}`, PAYER, ALICE, runIdFromName("run-test"), SPYX.address.toLowerCase(), note);
    d.prepare(
      `INSERT INTO grants (id, tx_hash, block_number, block_time, payer, beneficiary, asset, units, shares,
         stable_cost, start_at, cliff_seconds, duration_secs, tip_bps, reason_hash)
       VALUES (7, ?, 20, 1790000100, ?, ?, ?, '1302900000000000000', '1302900000000000000000000',
         '1000000000', 1790000100, 15552000, 63072000, 50, ?)`,
    ).run(`0x${"b".repeat(64)}`, PAYER, ALICE, SPYX.address.toLowerCase(), note);
    d.prepare(
      `INSERT INTO vests (tx_hash, log_index, block_number, block_time, grant_id, beneficiary, caller, asset,
         units_to_beneficiary, units_to_caller)
       VALUES (?, 0, 30, 1790000200, 7, ?, ?, ?, '995000000000000', '5000000000000')`,
    ).run(`0x${"c".repeat(64)}`, ALICE, "0x00000000000000000000000000000000000000ee", SPYX.address.toLowerCase());

    const read = exp.readExport(PAYER.toUpperCase().replace("0X", "0x"));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.map((r) => r.kind)).toEqual(["payment", "grant", "release"]);

    const [pay, grant, release] = read.value;
    expect(pay).toMatchObject({
      usdt_paid: "5",
      usdt_as_cash: "1.25",
      units: "0.00488",
      stock: "SPYx",
      run_id: "run-test",
      date_utc: "2026-09-21T14:13:20Z",
      note: "Design review, week 38",
    });
    // $3.75 swapped for 0.00488 SPYx = $768.442622… a unit, rounded down.
    expect(pay!.unit_price_usdt).toBe("768.442622");
    expect(grant).toMatchObject({grant_id: "7", usdt_paid: "1000", units: "1.3029", cliff_seconds: "15552000", release_fee_bps: "50"});
    expect(release).toMatchObject({units: "0.000995", release_fee_units: "0.000005", grant_id: "7"});

    const csv = exp.toCsv(read.value);
    expect(csv.split("\r\n")[0]).toBe(exp.EXPORT_COLUMNS.join(","));
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(4);
  });

  it("refuses something that is not an address", () => {
    expect(exp.readExport("hello").ok).toBe(false);
  });
});
