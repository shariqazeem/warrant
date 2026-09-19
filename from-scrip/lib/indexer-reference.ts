import "server-only";

import { type Connection, PublicKey } from "@solana/web3.js";
import { desc, eq, sql } from "drizzle-orm";
import { readReceiptAccount, receiptFromTransaction } from "@/lib/book/read-receipt";
import { decodeBook, decodeGrant, decodeHandle } from "@/lib/book/decode";
import { db } from "@/lib/db";
import { newId } from "@/lib/db/keys";
import { books, cursors, grants, receipts } from "@/lib/db/schema";
import { toSafeNumber } from "@/lib/money";
import { notifyReceipt } from "@/lib/notify/telegram";
import { type Outcome, held, ok } from "@/lib/outcome";
import { connection } from "@/lib/solana/connection";
import { SCRIP_PROGRAM_ID, discriminatorFilter } from "@/lib/solana/program";
import { attributeSweep } from "./attribute";
import { rentFor } from "@/lib/solana/rent";
import { transactionsFor } from "@/lib/solana/batch";

/**
 * THE INDEXER — mirrors on-chain receipts and books into the cache so the ledger is fast.
 *
 * THE DATABASE IS A CACHE. THE CHAIN IS THE MEMORY. `/receipt/[sig]` never reads this table;
 * the page a stranger opens must not depend on our having indexed anything.
 *
 * INCREMENTAL, AND PROVEN SO. The cursor is the newest signature fully processed. A run asks
 * for everything newer than it, walking pages with `before` until the page is short, then
 * processes OLDEST FIRST so an interrupted run leaves the cursor where it can safely resume.
 * The predecessor passed `until` alone and stopped after one page; measured, its second run
 * added zero rows against a chain with forty-seven new signatures. `indexer.test.ts` holds
 * that a second run adds rows.
 */

const CURSOR_KEY = `receipts:${SCRIP_PROGRAM_ID.toBase58()}`;

export type IndexReport = {
  readonly scanned: number;
  readonly added: number;
  readonly updated: number;
  readonly skipped: number;
  readonly holds: readonly string[];
};

export type SignatureSource = (opts: { before?: string; until?: string; limit: number }) => Promise<
  Array<{ signature: string; slot: number; err: unknown }>
>;

export async function indexReceipts(
  conn: Connection = connection(),
  pageSize = 50,
  maxPages = 20,
): Promise<Outcome<IndexReport>> {
  const source: SignatureSource = (opts) => conn.getSignaturesForAddress(SCRIP_PROGRAM_ID, opts, "confirmed");
  return indexReceiptsFrom(conn, source, pageSize, maxPages);
}

export async function indexReceiptsFrom(
  conn: Connection,
  source: SignatureSource,
  pageSize: number,
  maxPages: number,
): Promise<Outcome<IndexReport>> {
  const cursor = (await db.select().from(cursors).where(eq(cursors.key, CURSOR_KEY)).limit(1))[0];

  // ── gather every signature newer than the cursor, newest first ──────────────────────
  const fresh: Array<{ signature: string; slot: number; err: unknown }> = [];
  let before: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    let batch;
    try {
      batch = await source({ before, until: cursor?.signature, limit: pageSize });
    } catch (err) {
      return held(`Could not list the program's transactions (${err instanceof Error ? err.message : String(err)}).`);
    }
    fresh.push(...batch);
    if (batch.length < pageSize) break;
    before = batch[batch.length - 1]!.signature;
  }

  const holds: string[] = [];
  let added = 0;
  let updated = 0;
  let skipped = 0;

  // ── oldest first, so the cursor can advance behind what is done ─────────────────────
  const ordered = [...fresh].reverse();
  // One batch per 25 signatures, not one request per signature: see lib/solana/batch.ts.
  const bySignature = await transactionsFor(
    conn,
    ordered.filter((e) => !e.err).map((e) => e.signature),
  );
  for (const entry of ordered) {
    if (entry.err) {
      skipped += 1;
      continue;
    }
    const tx = bySignature.get(entry.signature) ?? null;
    if (!tx) {
      holds.push(`${entry.signature.slice(0, 8)}…: the transaction could not be fetched.`);
      continue;
    }
    const found = await receiptFromTransaction(conn, entry.signature, tx);
    if (!found.ok) {
      // Most signatures are rule changes, book openings and sweeps' measurements: no receipt.
      if (!/did not write a Scrip receipt/.test(found.why)) holds.push(`${entry.signature.slice(0, 8)}…: ${found.why}`);
      skipped += 1;
      continue;
    }
    const r = found.value;
    const nums = {
      basis: toSafeNumber(r.basisUsdc, "basis"),
      paid: toSafeNumber(r.paidUsdc, "paid"),
      amount: toSafeNumber(r.amountRaw, "amount"),
      slot: toSafeNumber(r.settledSlot, "slot"),
      price: toSafeNumber(r.price?.price ?? 0n, "price"),
      conf: toSafeNumber(r.price?.conf ?? 0n, "conf"),
      m7: toSafeNumber(r.measured7d?.balanceRaw ?? 0n, "measured"),
      m30: toSafeNumber(r.measured30d?.balanceRaw ?? 0n, "measured"),
    };
    const bad = Object.values(nums).find((n) => !n.ok);
    if (bad && !bad.ok) {
      holds.push(`${entry.signature.slice(0, 8)}…: ${bad.why}`);
      continue;
    }
    const row = {
      pda: r.address,
      sig: r.signature,
      kind: r.kind,
      recipient: r.recipient,
      payer: r.payer ?? "",
      submitter: r.submitter,
      book: r.book,
      releaseId: r.releaseId,
      runId: r.runId ?? "",
      reasonHash: Buffer.from(r.reasonHash).toString("hex"),
      reason: r.reason ?? "",
      basisUsdc: nums.basis.ok ? nums.basis.value : 0,
      rateBps: r.rateBps,
      paidUsdc: nums.paid.ok ? nums.paid.value : 0,
      asset: r.asset,
      amountRaw: nums.amount.ok ? nums.amount.value : 0,
      priceFeed: r.price?.feed ?? "",
      price: nums.price.ok ? nums.price.value : 0,
      priceExpo: r.price?.expo ?? 0,
      priceConf: nums.conf.ok ? nums.conf.value : 0,
      pricePublishTime: r.price?.publishTime ?? 0,
      settledSlot: nums.slot.ok ? nums.slot.value : 0,
      settledUnix: r.settledUnix,
      measured7dAt: r.measured7d?.at ?? 0,
      measured7dRaw: nums.m7.ok ? nums.m7.value : 0,
      measured30dAt: r.measured30d?.at ?? 0,
      measured30dRaw: nums.m30.ok ? nums.m30.value : 0,
    };
    const existing = (await db.select({ id: receipts.id }).from(receipts).where(eq(receipts.pda, r.address)).limit(1))[0];
    if (existing) {
      await db.update(receipts).set(row).where(eq(receipts.id, existing.id));
      updated += 1;
    } else {
      let attributedJson = "[]";
      if (r.kind === "sweep") {
        const attributed = await attributeSweep(conn, r.recipient, r.settledSlot, r.basisUsdc);
        if (attributed.ok) attributedJson = JSON.stringify(attributed.value);
        else holds.push(`${entry.signature.slice(0, 8)}…: attribution — ${attributed.why}`);
      }
      const id = newId("rcp");
      await db.insert(receipts).values({ id, ...row, attributedJson });
      added += 1;
      // The arrival, as one message, to whoever linked a chat. Never awaited into the index.
      void notifyReceipt({ id, ...row, attributedJson, createdAt: Math.floor(Date.now() / 1000) }).catch(() => undefined);
    }
    // A grant's reason travels as the memo of the transaction that sealed it.
    if (r.kind === "grant" && r.reason) {
      await db.update(grants).set({ reason: r.reason }).where(eq(grants.pda, r.book));
    }
  }

  const newest = fresh[0];
  if (newest && holds.length === 0) {
    await db
      .insert(cursors)
      .values({ key: CURSOR_KEY, signature: newest.signature, slot: newest.slot, updatedAt: Math.floor(Date.now() / 1000) })
      .onConflictDoUpdate({
        target: cursors.key,
        set: { signature: newest.signature, slot: newest.slot, updatedAt: Math.floor(Date.now() / 1000) },
      });
  }

  return ok({ scanned: fresh.length, added, updated, skipped, holds });
}

/**
 * Re-read receipts whose windows may have been measured since we last looked, so the ledger's
 * keep-rate reflects the chain. Bounded: only receipts old enough to have a window due.
 */
export async function refreshMeasurements(conn: Connection = connection(), now = Math.floor(Date.now() / 1000), limit = 50): Promise<Outcome<number>> {
  const due = await db
    .select({ id: receipts.id, pda: receipts.pda })
    .from(receipts)
    .where(
      sql`(${receipts.measured7dAt} = 0 AND ${receipts.settledUnix} + 7 * 86400 <= ${now}) OR (${receipts.measured30dAt} = 0 AND ${receipts.settledUnix} + 30 * 86400 <= ${now})`,
    )
    .limit(limit);
  let refreshed = 0;
  for (const row of due) {
    const r = await readReceiptAccount(conn, new PublicKey(row.pda));
    if (!r.ok || !r.value) continue;
    const m7 = toSafeNumber(r.value.measured7d?.balanceRaw ?? 0n, "measured");
    const m30 = toSafeNumber(r.value.measured30d?.balanceRaw ?? 0n, "measured");
    if (!m7.ok || !m30.ok) continue;
    await db
      .update(receipts)
      .set({
        measured7dAt: r.value.measured7d?.at ?? 0,
        measured7dRaw: m7.value,
        measured30dAt: r.value.measured30d?.at ?? 0,
        measured30dRaw: m30.value,
      })
      .where(eq(receipts.id, row.id));
    refreshed += 1;
  }
  return ok(refreshed);
}

/** Mirror every Book. One `getProgramAccounts` on the discriminator; small at any scale this reaches. */
export async function indexBooks(conn: Connection = connection(), now = Math.floor(Date.now() / 1000)): Promise<Outcome<number>> {
  let accounts;
  let handles;
  try {
    [accounts, handles] = await Promise.all([
      conn.getProgramAccounts(SCRIP_PROGRAM_ID, { commitment: "confirmed", filters: [discriminatorFilter("Book")] }),
      conn.getProgramAccounts(SCRIP_PROGRAM_ID, { commitment: "confirmed", filters: [discriminatorFilter("Handle")] }),
    ]);
  } catch (err) {
    return held(`Could not list books (${err instanceof Error ? err.message : String(err)}).`);
  }
  // Who a handle names lives on the Handle account: a person, or an organisation.
  const kindOf = new Map<string, "person" | "org">();
  for (const { account } of handles) {
    const h = decodeHandle(account.data);
    if (h.ok) kindOf.set(h.value.owner, h.value.kind);
  }
  let n = 0;
  for (const { pubkey, account } of accounts) {
    const b = decodeBook(account.data);
    if (!b.ok) continue;
    const rent = Number(await rentFor(conn, account.data.length));
    const nums = [b.value.rule.floorUsdc, b.value.rule.capUsdc, b.value.rule.watermark].map((v) => toSafeNumber(v, "rule"));
    if (nums.some((x) => !x.ok)) continue;
    const row = {
      owner: b.value.owner,
      pda: pubkey.toBase58(),
      slug: b.value.slug,
      asset: b.value.asset,
      openedUnix: b.value.openedUnix,
      ruleEnabled: b.value.rule.enabled ? 1 : 0,
      rateBps: b.value.rule.rateBps,
      escalateBps: b.value.rule.escalateBps,
      floorUsdc: Number(b.value.rule.floorUsdc),
      capUsdc: Number(b.value.rule.capUsdc),
      toleranceBps: b.value.rule.toleranceBps,
      watermarkUsdc: Number(b.value.rule.watermark),
      enabledUnix: b.value.rule.enabledUnix,
      sweeps: b.value.rule.sweeps,
      floatLamports: Math.max(0, account.lamports - rent),
      kind: kindOf.get(b.value.owner) ?? "person",
      seenAt: now,
    };
    await db
      .insert(books)
      .values({ id: newId("book"), ...row })
      .onConflictDoUpdate({ target: books.pda, set: row });
    n += 1;
  }
  return ok(n);
}

/** Mirror every Grant account: the schedule, what has vested, the float. The reasons come with the receipts. */
export async function indexGrants(conn: Connection = connection(), now = Math.floor(Date.now() / 1000)): Promise<Outcome<number>> {
  let accounts;
  try {
    accounts = await conn.getProgramAccounts(SCRIP_PROGRAM_ID, { commitment: "confirmed", filters: [discriminatorFilter("Grant")] });
  } catch (err) {
    return held(`Could not list grants (${err instanceof Error ? err.message : String(err)}).`);
  }
  let n = 0;
  const rentByLen = new Map<number, number>();
  for (const { pubkey, account } of accounts) {
    const g = decodeGrant(account.data);
    if (!g.ok) continue;
    let rent = rentByLen.get(account.data.length);
    if (rent === undefined) {
      rent = Number(await rentFor(conn, account.data.length));
      rentByLen.set(account.data.length, rent);
    }
    const nums = [g.value.totalRaw, g.value.releasedRaw, g.value.declaredUsdc, g.value.releaseCapRaw ?? 0n].map((v) => toSafeNumber(v, "grant"));
    if (nums.some((x) => !x.ok)) continue;
    const row = {
      pda: pubkey.toBase58(),
      payer: g.value.payer,
      recipient: g.value.recipient,
      asset: g.value.asset,
      grantId: g.value.grantId,
      totalRaw: Number(g.value.totalRaw),
      releasedRaw: Number(g.value.releasedRaw),
      releaseCapRaw: g.value.releaseCapRaw === null ? null : Number(g.value.releaseCapRaw),
      startUnix: g.value.startUnix,
      cliffSecs: g.value.cliffSecs,
      durationSecs: g.value.durationSecs,
      revocable: g.value.revocable ? 1 : 0,
      sealed: g.value.sealed ? 1 : 0,
      state: g.value.state,
      declaredUsdc: Number(g.value.declaredUsdc),
      runId: g.value.runId ?? "",
      createdUnix: g.value.createdUnix,
      vests: g.value.vests,
      floatLamports: Math.max(0, account.lamports - rent),
      seenAt: now,
    };
    await db
      .insert(grants)
      .values({ id: newId("grt"), ...row })
      .onConflictDoUpdate({ target: grants.pda, set: row });
    n += 1;
  }
  return ok(n);
}

// ── what the ledger reads ────────────────────────────────────────────────────────────────

/** A grant's own receipt records stock in escrow; the vests deliver it. Counting both would count it twice. */
const DELIVERED = sql`${receipts.kind} <> 'grant'`;

export async function ledgerTotals() {
  const [r] = await db
    .select({
      receipts: sql<number>`count(*)`,
      paid: sql<number>`coalesce(sum(case when ${receipts.kind} <> 'grant' then ${receipts.paidUsdc} else 0 end), 0)`,
      recipients: sql<number>`count(distinct ${receipts.recipient})`,
      sweeps: sql<number>`sum(case when ${receipts.kind} = 'sweep' then 1 else 0 end)`,
      vests: sql<number>`sum(case when ${receipts.kind} = 'vest' then 1 else 0 end)`,
      grants: sql<number>`sum(case when ${receipts.kind} = 'grant' then 1 else 0 end)`,
    })
    .from(receipts);
  const [b] = await db.select({ on: sql<number>`sum(${books.ruleEnabled})`, total: sql<number>`count(*)` }).from(books);
  return {
    receipts: Number(r?.receipts ?? 0),
    paidUsdc: BigInt(Math.round(Number(r?.paid ?? 0))),
    recipients: Number(r?.recipients ?? 0),
    sweeps: Number(r?.sweeps ?? 0),
    vests: Number(r?.vests ?? 0),
    grants: Number(r?.grants ?? 0),
    rulesOn: Number(b?.on ?? 0),
    books: Number(b?.total ?? 0),
  };
}

/** Units delivered, per asset, for the ledger's "units delivered" line. */
export async function unitsByAsset() {
  return db
    .select({ asset: receipts.asset, amountRaw: sql<number>`coalesce(sum(${receipts.amountRaw}), 0)`, count: sql<number>`count(*)` })
    .from(receipts)
    .where(DELIVERED)
    .groupBy(receipts.asset);
}

export async function recentReceipts(limit = 25) {
  return db.select().from(receipts).orderBy(desc(receipts.settledUnix)).limit(limit);
}

export async function receiptsFor(recipient: string, limit = 50) {
  return db.select().from(receipts).where(eq(receipts.recipient, recipient)).orderBy(desc(receipts.settledUnix)).limit(limit);
}

/** Every delivered receipt, for keep-rate: a grant's escrow receipt is not a delivery. */
export async function allReceiptRows() {
  return db.select().from(receipts).where(DELIVERED);
}

/** Every keeper that has ever submitted a sweep, from the receipts' own `submitter` field. */
export async function keepersFromReceipts() {
  const rows = await db
    .select({
      keeper: receipts.submitter,
      sweeps: sql<number>`count(*)`,
      lastAt: sql<number>`max(${receipts.settledUnix})`,
      firstAt: sql<number>`min(${receipts.settledUnix})`,
      books: sql<number>`count(distinct ${receipts.book})`,
      paid: sql<number>`coalesce(sum(${receipts.paidUsdc}), 0)`,
    })
    .from(receipts)
    .where(sql`${receipts.kind} in ('sweep', 'vest')`)
    .groupBy(receipts.submitter)
    .orderBy(desc(sql`max(${receipts.settledUnix})`));
  return rows.map((r) => ({ keeper: r.keeper, sweeps: Number(r.sweeps), lastAt: Number(r.lastAt), firstAt: Number(r.firstAt), books: Number(r.books), paidUsdc: BigInt(Math.round(Number(r.paid))) }));
}
