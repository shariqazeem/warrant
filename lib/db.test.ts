/**
 * THE TAMPER PATH IS THE POINT OF THIS FILE.
 *
 * Only the hash of a reason is on chain. If the cached text does not hash to it, showing
 * that text as "the reason" would be a lie anchored to a real transaction — strictly worse
 * than showing nothing. So `reasonFor` reports whether it verifies, and it must report
 * false when the text has been changed underneath it.
 */
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {keccak256, toHex} from "viem";
import {reasonHash} from "./reason";

let db: typeof import("./db");
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "warrant-db-"));
  process.env.WARRANT_DB_PATH = join(dir, "test.db");
  db = await import("./db");
});

afterAll(() => rmSync(dir, {recursive: true, force: true}));

describe("the reason cache", () => {
  it("returns the text a payer typed, and says it verifies", () => {
    const hash = db.rememberReason("Design review, week 38");
    const got = db.reasonFor(hash);
    expect(got).toEqual({found: true, text: "Design review, week 38", verified: true});
  });

  it("keys on the NORMALISED text, so an invisible difference is the same reason", () => {
    const a = db.rememberReason("Shipped the indexer");
    const b = db.rememberReason("  Shipped the   indexer ");
    expect(b).toBe(a);
    expect(db.reasonFor(a).found).toBe(true);
  });

  it("keeps the text an outside checker can hash with the contract's own hashReason", () => {
    // The contract hashes the bytes as they are. The stored text must be exactly what was
    // hashed, so keccak256 of it — no normalising on the checker's side — gives the hash.
    const hash = db.rememberReason("  Paid  for the\tlogo ");
    const got = db.reasonFor(hash);
    expect(got.found && got.text).toBe("Paid for the logo");
    expect(keccak256(toHex("Paid for the logo"))).toBe(hash);
  });

  it("says nothing is stored rather than inventing a reason", () => {
    expect(db.reasonFor("0x" + "11".repeat(32))).toEqual({found: false});
  });

  it("refuses to vouch for text that does not hash to the receipt", () => {
    const hash = db.rememberReason("Paid for the audit");
    // Someone edits the cache. The chain still says what it said.
    db.database().prepare(`UPDATE reasons SET text = ? WHERE hash = ?`).run("Paid for nothing", hash);

    const got = db.reasonFor(hash);
    expect(got).toEqual({found: true, text: "Paid for nothing", verified: false});
    expect(reasonHash("Paid for nothing")).not.toBe(hash);
  });

  it("matches a hash whatever case it arrives in", () => {
    const hash = db.rememberReason("Week 39, on call");
    expect(db.reasonFor(hash.toUpperCase().replace("0X", "0x")).found).toBe(true);
  });
});
