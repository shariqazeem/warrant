/**
 * The public record's two edges: what the front page features, and whose rows a run page
 * shows. Both were found open to a stranger with a few cents and a direct contract call.
 */
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {ASSETS} from "./assets";
import {runIdFromName} from "./run-id";

let company: typeof import("./company");
let db: typeof import("./db");
let dir: string;

const SPYX = ASSETS[0]!.address.toLowerCase();
const PAYER = "0x00000000000000000000000000000000000000a1";
const STRANGER = "0x00000000000000000000000000000000000000b2";
const RUN = runIdFromName("run-260925-130005-k3f9");

let n = 0;
function paid(over: Partial<Record<string, string | number>> = {}) {
  n++;
  const row = {
    tx_hash: `0x${n.toString(16).padStart(64, "0")}`,
    log_index: 0,
    block_number: 1000 + n,
    block_time: 1790000000 + n,
    payer: PAYER,
    recipient: `0x${(0xc0 + n).toString(16).padStart(40, "0")}`,
    run_id: RUN,
    asset: SPYX,
    stable_amount: "25000000",
    cash_amount: "0",
    asset_amount: "36000000000000000",
    reason_hash: `0x${"ab".repeat(32)}`,
    ...over,
  };
  db.database()
    .prepare(
      `INSERT INTO receipts (tx_hash, log_index, block_number, block_time, payer, recipient,
         run_id, asset, stable_amount, cash_amount, asset_amount, reason_hash)
       VALUES (@tx_hash, @log_index, @block_number, @block_time, @payer, @recipient,
         @run_id, @asset, @stable_amount, @cash_amount, @asset_amount, @reason_hash)`,
    )
    .run(row);
  return row;
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "warrant-company-"));
  process.env.WARRANT_DB_PATH = join(dir, "test.db");
  db = await import("./db");
  company = await import("./company");
});

afterAll(() => rmSync(dir, {recursive: true, force: true}));

describe("what the front page features", () => {
  it("counts a dust payment in the totals but never features it", () => {
    const real = paid();
    paid({stable_amount: "1", cash_amount: "1", asset_amount: "0", run_id: runIdFromName("spam")});
    const rail = company.readRail(8);
    expect(rail.ok).toBe(true);
    if (!rail.ok) return;
    expect(rail.value.paymentCount).toBe(2);
    expect(rail.value.recent.map((r) => r.txHash)).toEqual([real.tx_hash]);
  });
});

describe("a run's public page", () => {
  it("shows the rows of the payer who used the id first, and nobody else's", () => {
    const later = paid({payer: STRANGER, block_number: 999_999});
    const run = company.readRun(RUN);
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.value.length).toBeGreaterThan(0);
    expect(run.value.every((r) => r.payer === PAYER)).toBe(true);
    expect(run.value.some((r) => r.txHash === later.tx_hash)).toBe(false);
  });

  it("finds a run whatever case its id arrives in", () => {
    const run = company.readRun(RUN.toUpperCase().replace("0X", "0x"));
    expect(run.ok && run.value.length).toBeGreaterThan(0);
  });
});
