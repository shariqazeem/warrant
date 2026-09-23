/**
 * A PERSON'S RECORD: the choices they signed, kept in order, and what they were paid.
 *
 * The storage rule that matters most is the one that stops a replay. A signed choice is a
 * valid signature for ever, and every choice is printed on its person's public page — so an
 * older one must never be able to replace a newer one, whoever submits it.
 */
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {getAddress, verifyTypedData} from "viem";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {ASSETS} from "./assets";
import {ZERO_ADDRESS, choiceTypedData, verifyChoice, type Choice, type ChoiceMessage} from "./choice";
import {runIdFromName} from "./run-id";

let db: typeof import("./db");
let person: typeof import("./person");
let company: typeof import("./company");
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "warrant-person-"));
  process.env.WARRANT_DB_PATH = join(dir, "test.db");
  db = await import("./db");
  person = await import("./person");
  company = await import("./company");
});

afterAll(() => rmSync(dir, {recursive: true, force: true}));

const SPYX = ASSETS[0]!.address;
const T = 1_790_000_000;
let n = 0;

/** A fresh wallet address, so no test sees another's rows. */
function someone(): `0x${string}` {
  n++;
  return `0x${n.toString(16).padStart(40, "a")}` as `0x${string}`;
}

/** A choice as verifyChoice would hand it over. The signature is not checked by storage. */
function choice(who: `0x${string}`, over: Partial<Choice> = {}): Choice {
  return {
    person: who,
    stockBps: 2_500,
    asset: SPYX,
    eligible: true,
    issuedAt: T,
    signature: `0x${"11".repeat(65)}`,
    ...over,
  };
}

describe("keeping a choice", () => {
  it("keeps it and reads it back, whatever case the address arrives in", () => {
    const who = someone();
    const saved = db.rememberChoice(choice(who), T + 2);
    expect(saved).toEqual({ok: true, value: {...choice(who), savedAt: T + 2}});

    for (const asked of [who, who.toUpperCase().replace("0X", "0x"), getAddress(who)]) {
      expect(person.choiceFor(asked)).toEqual({...choice(who), savedAt: T + 2});
    }
  });

  it("stores addresses and the signature lowercased", () => {
    const who = someone();
    db.rememberChoice(
      choice(getAddress(who) as `0x${string}`, {
        asset: getAddress(SPYX) as `0x${string}`,
        signature: `0x${"AB".repeat(65)}`,
      }),
    );
    const got = person.choiceFor(who)!;
    expect(got.person).toBe(who);
    expect(got.asset).toBe(SPYX);
    expect(got.signature).toBe(`0x${"ab".repeat(65)}`);
  });

  it("keeps all cash as a choice too", () => {
    const who = someone();
    db.rememberChoice(choice(who, {stockBps: 0, asset: ZERO_ADDRESS, eligible: false}));
    expect(person.choiceFor(who)).toMatchObject({stockBps: 0, asset: ZERO_ADDRESS, eligible: false});
  });

  it("refuses the same choice twice: the latest cannot be replayed", () => {
    const who = someone();
    expect(db.rememberChoice(choice(who)).ok).toBe(true);
    const again = db.rememberChoice(choice(who));
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.why).toContain("A newer choice is already saved");
  });

  it("refuses an older choice once a newer one is kept, even a different one", () => {
    const who = someone();
    expect(db.rememberChoice(choice(who, {issuedAt: T + 100, stockBps: 1_000})).ok).toBe(true);
    expect(db.rememberChoice(choice(who, {issuedAt: T + 99, stockBps: 10_000})).ok).toBe(false);
    expect(db.rememberChoice(choice(who, {issuedAt: T, stockBps: 10_000})).ok).toBe(false);
    expect(person.choiceFor(who)?.stockBps).toBe(1_000);
  });

  it("refuses a replay whatever case the replayed address is in", () => {
    const who = someone();
    expect(db.rememberChoice(choice(who)).ok).toBe(true);
    expect(db.rememberChoice(choice(getAddress(who) as `0x${string}`)).ok).toBe(false);
  });

  it("keeps every change as history, and the newest is the one in force", () => {
    const who = someone();
    for (const [i, bps] of [1_000, 5_000, 0].entries()) {
      const c = bps === 0 ? {stockBps: 0, asset: ZERO_ADDRESS, eligible: false} : {stockBps: bps};
      expect(db.rememberChoice(choice(who, {issuedAt: T + i * 60, ...c})).ok).toBe(true);
    }
    const rows = db.database().prepare(`SELECT COUNT(*) AS n FROM choices WHERE person = ?`).get(who) as {n: number};
    expect(rows.n).toBe(3);
    expect(person.choiceFor(who)?.stockBps).toBe(0);
  });

  it("keeps one person's choices apart from another's", () => {
    const a = someone();
    const b = someone();
    db.rememberChoice(choice(a, {issuedAt: T + 500}));
    // b's older timestamp is fine: the rule is per wallet.
    expect(db.rememberChoice(choice(b, {issuedAt: T, stockBps: 7_500})).ok).toBe(true);
    expect(person.choiceFor(a)?.stockBps).toBe(2_500);
    expect(person.choiceFor(b)?.stockBps).toBe(7_500);
  });
});

describe("reading a choice", () => {
  it("says there is none for a wallet that never chose, or for something that is not an address", () => {
    expect(person.choiceFor(someone())).toBeNull();
    expect(person.choiceFor("not an address")).toBeNull();
    expect(person.choiceFor("0x1234")).toBeNull();
  });

  it("finds the choice that stood at a moment", () => {
    const who = someone();
    db.rememberChoice(choice(who, {issuedAt: T + 100, stockBps: 1_000}));
    db.rememberChoice(choice(who, {issuedAt: T + 200, stockBps: 5_000}));

    expect(person.choiceAt(who, T + 99)).toBeNull();
    expect(person.choiceAt(who, T + 100)?.stockBps).toBe(1_000);
    expect(person.choiceAt(who, T + 199)?.stockBps).toBe(1_000);
    expect(person.choiceAt(who, T + 200)?.stockBps).toBe(5_000);
    expect(person.choiceAt(who, T + 10_000)?.stockBps).toBe(5_000);
    expect(person.choiceAt(who, T + 150.9)?.stockBps).toBe(1_000);
    expect(person.choiceAt(getAddress(who), T + 150)?.stockBps).toBe(1_000);
    expect(person.choiceAt(who, Number.NaN)).toBeNull();
  });

  it("hands back a stored choice anyone can check against the wallet that signed it", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const now = Math.floor(Date.now() / 1000);
    const m: ChoiceMessage = {person: account.address, stockBps: 5_000, asset: SPYX, eligible: true, issuedAt: now};
    const signature = await account.signTypedData(choiceTypedData(m));

    const verified = await verifyChoice(m, signature);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(db.rememberChoice(verified.value).ok).toBe(true);

    // What the public page prints is enough to check it with any EIP-712 tool: here, viem's
    // own, offline, from the stored row alone.
    const stored = person.choiceFor(account.address)!;
    expect(
      await verifyTypedData({address: stored.person, ...choiceTypedData(stored), signature: stored.signature}),
    ).toBe(true);
  });
});

// ── what was paid to one wallet ──────────────────────────────────────────────────────

const PAYER = "0x00000000000000000000000000000000000000c1";
const OTHER_PAYER = "0x00000000000000000000000000000000000000c2";
let tx = 0;

function paid(over: Partial<Record<string, string | number | null>>) {
  tx++;
  const row = {
    tx_hash: `0x${tx.toString(16).padStart(64, "e")}`,
    log_index: 0,
    block_number: 5_000 + tx,
    block_time: 1_790_000_000 + tx,
    payer: PAYER,
    recipient: "0x00000000000000000000000000000000000000d1",
    run_id: runIdFromName(`person-${tx}`),
    asset: SPYX,
    stable_amount: "25000000",
    cash_amount: "0",
    asset_amount: "36000000000000000",
    reason_hash: `0x${"cd".repeat(32)}`,
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

describe("what was paid to one wallet", () => {
  it("reads a payment exactly as the company's own page reads it", () => {
    const to = "0x00000000000000000000000000000000000000d2";
    const payer = "0x00000000000000000000000000000000000000c9";
    db.rememberReason("Paid for the audit");
    const row = paid({recipient: to, payer, cash_amount: "5000000", asset_amount: "30000000000000000"});
    db.database().prepare(`UPDATE receipts SET reason_hash = (SELECT hash FROM reasons WHERE text = ?) WHERE tx_hash = ?`).run("Paid for the audit", row.tx_hash);

    const mine = person.readPaidTo(to);
    const theirs = company.readCompany(payer);
    expect(mine.ok && theirs.ok).toBe(true);
    if (!mine.ok || !theirs.ok) return;
    expect(mine.value.receipts).toHaveLength(1);
    expect(mine.value.receipts[0]).toEqual(theirs.value.receipts[0]);
    expect(mine.value.receipts[0]!.reason).toBe("Paid for the audit");
  });

  it("counts and sums every payment exactly, per stock, with the cash apart", () => {
    const to = "0x00000000000000000000000000000000000000d3";
    const other = ASSETS[1]?.address ?? SPYX;
    paid({recipient: to, stable_amount: "25000000", cash_amount: "0", asset_amount: "36000000000000001"});
    paid({recipient: to, stable_amount: "10000000", cash_amount: "2500000", asset_amount: "10000000000000000"});
    paid({recipient: to, payer: OTHER_PAYER, stable_amount: "3000000", cash_amount: "3000000", asset_amount: "0"});
    paid({recipient: to, payer: OTHER_PAYER, asset: other, stable_amount: "1", cash_amount: "0", asset_amount: "7"});

    const got = person.readPaidTo(to);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    const p = got.value;
    expect(p.paymentCount).toBe(4);
    expect(p.payers).toBe(2);
    expect(p.totalStable).toBe(38_000_001n);
    expect(p.cashTotal).toBe(5_500_000n);
    const units = Object.fromEntries(p.deliveredByAsset.map((a) => [a.asset, a.units]));
    if (other === SPYX) {
      expect(units).toEqual({[SPYX]: 46_000_000_000_000_008n});
    } else {
      expect(units).toEqual({[SPYX]: 46_000_000_000_000_001n, [other]: 7n});
    }
    expect(p.receipts.map((r) => r.stableAmount)).toEqual([1n, 3_000_000n, 10_000_000n, 25_000_000n]);
  });

  it("lists the newest few but counts every one", () => {
    const to = "0x00000000000000000000000000000000000000d4";
    for (let i = 0; i < 5; i++) paid({recipient: to});
    const got = person.readPaidTo(to, 2);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.value.receipts).toHaveLength(2);
    expect(got.value.paymentCount).toBe(5);
    expect(got.value.totalStable).toBe(125_000_000n);
    expect(got.value.receipts[0]!.blockNumber).toBeGreaterThan(got.value.receipts[1]!.blockNumber);
  });

  it("finds a wallet whatever case its address arrives in", () => {
    const to = "0x00000000000000000000000000000000000000d5";
    paid({recipient: to});
    const got = person.readPaidTo(getAddress(to));
    expect(got.ok && got.value.paymentCount).toBe(1);
  });

  it("says nothing was paid, in zeros and an empty list, never a sample", () => {
    const got = person.readPaidTo("0x00000000000000000000000000000000000000d6");
    expect(got).toEqual({
      ok: true,
      value: {
        address: "0x00000000000000000000000000000000000000d6",
        paymentCount: 0,
        payers: 0,
        since: null,
        totalStable: 0n,
        cashTotal: 0n,
        deliveredByAsset: [],
        receipts: [],
      },
    });
  });

  it("does not count what this wallet paid others as paid to it", () => {
    const to = "0x00000000000000000000000000000000000000d7";
    paid({payer: to, recipient: "0x00000000000000000000000000000000000000d8"});
    const got = person.readPaidTo(to);
    expect(got.ok && got.value.paymentCount).toBe(0);
  });

  it("refuses something that is not an address", () => {
    expect(person.readPaidTo("robots.txt").ok).toBe(false);
  });
});
