import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * THE CACHE OF A CHAIN, NOT A LEDGER OF RECORD.
 *
 * Every row mirrors something on Solana: a Receipt account, a Book account, a mint's
 * multiplier, a transaction's memo. The chain is the memory; this is the index that makes
 * the ledger fast and the attribution possible. Nothing may be stored here that exists ONLY
 * here — delete the file and a re-index rebuilds it. The file is per cluster
 * (`var/scrip.<cluster>.db`) so a devnet row can never render under a mainnet chip.
 *
 * AMOUNT UNITS. `*_usdc` is 6-decimal USDC base units. `*_raw` is the asset's own raw units
 * at the mint's decimals (from the registry, never a guess). Both are SQLite INTEGERs, exact
 * below 2^53; `toSafeNumber` guards every bigint on its way into a column.
 */

const id = () => text("id").primaryKey();
const createdAt = () =>
  integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`);

/** A Book: mirrors the on-chain account, refreshed by the indexer. */
export const books = sqliteTable(
  "books",
  {
    id: id(),
    owner: text("owner").notNull(),
    pda: text("pda").notNull(),
    slug: text("slug").notNull(),
    asset: text("asset").notNull(),
    openedUnix: integer("opened_unix").notNull(),
    ruleEnabled: integer("rule_enabled").notNull().default(0),
    rateBps: integer("rate_bps").notNull().default(0),
    escalateBps: integer("escalate_bps").notNull().default(0),
    floorUsdc: integer("floor_usdc").notNull().default(0),
    capUsdc: integer("cap_usdc").notNull().default(0),
    toleranceBps: integer("tolerance_bps").notNull().default(0),
    watermarkUsdc: integer("watermark_usdc").notNull().default(0),
    enabledUnix: integer("enabled_unix").notNull().default(0),
    sweeps: integer("sweeps").notNull().default(0),
    /** Lamports on the account above its rent — the float. */
    floatLamports: integer("float_lamports").notNull().default(0),
    /**
     * A book is private by default; a public page at /book/<handle> is OPT-IN, set by the
     * owner with a signed session. Chain data is public; a savings product should not be
     * the surface that makes somebody's arrivals searchable by name unless they chose it.
     */
    published: integer("published").notNull().default(0),
    /** "person" | "org" — from the Handle account. An organisation pays in stock. */
    kind: text("kind").notNull().default("person"),
    seenAt: integer("seen_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("books_owner_uq").on(t.owner), uniqueIndex("books_pda_uq").on(t.pda), uniqueIndex("books_slug_uq").on(t.slug)],
);

/**
 * A Receipt: the program account, plus the two things only a transaction carries — the
 * signature that anchors it and the memo with the reason — plus the attribution the indexer
 * reads from the owner's transfer history for a sweep.
 */
export const receipts = sqliteTable(
  "receipts",
  {
    id: id(),
    pda: text("pda").notNull(),
    sig: text("sig").notNull(),
    /** "sweep" | "pay" | "gift" | "grant" | "vest" */
    kind: text("kind").notNull(),
    recipient: text("recipient").notNull(),
    /** Empty for a sweep. */
    payer: text("payer").notNull().default(""),
    submitter: text("submitter").notNull(),
    book: text("book").notNull(),
    releaseId: text("release_id").notNull(),
    /** The payroll run this receipt belongs to, hex, or "". */
    runId: text("run_id").notNull().default(""),
    reasonHash: text("reason_hash").notNull(),
    /** The memo read off the transaction, verified against `reason_hash`. */
    reason: text("reason").notNull().default(""),
    basisUsdc: integer("basis_usdc").notNull(),
    rateBps: integer("rate_bps").notNull(),
    paidUsdc: integer("paid_usdc").notNull(),
    asset: text("asset").notNull(),
    amountRaw: integer("amount_raw").notNull(),
    priceFeed: text("price_feed").notNull().default(""),
    price: integer("price").notNull().default(0),
    priceExpo: integer("price_expo").notNull().default(0),
    priceConf: integer("price_conf").notNull().default(0),
    pricePublishTime: integer("price_publish_time").notNull().default(0),
    settledSlot: integer("settled_slot").notNull(),
    settledUnix: integer("settled_unix").notNull(),
    measured7dAt: integer("measured_7d_at").notNull().default(0),
    measured7dRaw: integer("measured_7d_raw").notNull().default(0),
    measured30dAt: integer("measured_30d_at").notNull().default(0),
    measured30dRaw: integer("measured_30d_raw").notNull().default(0),
    /** Senders found in the USDC account's transfer history for a sweep — `[{from, usdc, sig}]`. */
    attributedJson: text("attributed_json").notNull().default("[]"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("receipts_pda_uq").on(t.pda),
    uniqueIndex("receipts_sig_uq").on(t.sig),
    index("receipts_recipient_idx").on(t.recipient),
    index("receipts_settled_idx").on(t.settledUnix),
  ],
);

/**
 * Every issuer multiplier we have ever seen, kept forever, so a rebase is auditable after
 * the fact. `seen_at` is when WE observed it; `effective_at` is when the issuer activates it.
 */
export const multipliers = sqliteTable(
  "multipliers",
  {
    id: id(),
    mint: text("mint").notNull(),
    /** Decimal string, exactly as published. Never a float. */
    value: text("value").notNull(),
    effectiveAt: integer("effective_at").notNull(),
    source: text("source").notNull(),
    seenAt: integer("seen_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("multipliers_mint_effective_uq").on(t.mint, t.effectiveAt)],
);

/**
 * A GRANT, mirrored from its account: stock bought now that vests on a schedule. The
 * receipts it writes (one at seal, one per vest) are in `receipts`, keyed back by `pda`.
 */
export const grants = sqliteTable(
  "grants",
  {
    id: id(),
    pda: text("pda").notNull(),
    payer: text("payer").notNull(),
    recipient: text("recipient").notNull(),
    asset: text("asset").notNull(),
    grantId: text("grant_id").notNull(),
    totalRaw: integer("total_raw").notNull().default(0),
    releasedRaw: integer("released_raw").notNull().default(0),
    /** null while unrevoked. */
    releaseCapRaw: integer("release_cap_raw"),
    startUnix: integer("start_unix").notNull(),
    cliffSecs: integer("cliff_secs").notNull(),
    durationSecs: integer("duration_secs").notNull(),
    revocable: integer("revocable").notNull().default(0),
    sealed: integer("sealed").notNull().default(0),
    /** "active" | "completed" | "revoked" */
    state: text("state").notNull().default("active"),
    /** The memo from the sealing transaction, verified against the reason hash; "" until seen. */
    reason: text("reason").notNull().default(""),
    declaredUsdc: integer("declared_usdc").notNull().default(0),
    runId: text("run_id").notNull().default(""),
    createdUnix: integer("created_unix").notNull(),
    vests: integer("vests").notNull().default(0),
    /** Lamports above rent: the float that pays for vests. */
    floatLamports: integer("float_lamports").notNull().default(0),
    seenAt: integer("seen_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("grants_pda_uq").on(t.pda), index("grants_payer_idx").on(t.payer), index("grants_recipient_idx").on(t.recipient)],
);

/** A payroll run: many payments sharing a run id, signed in one sitting. The receipts carry it. */
export const runs = sqliteTable("runs", {
  /** hex, sixteen bytes */
  id: text("id").primaryKey(),
  payer: text("payer").notNull(),
  label: text("label").notNull().default(""),
  /** How many payments the run was built with; the receipts say how many settled. */
  planned: integer("planned").notNull().default(0),
  createdAt: createdAt(),
});

/**
 * A register linked to a Telegram chat: every stub that prints for `owner` is one message.
 * `code` is the one-time /start payload; `chatId` is set when the bot sees it.
 */
export const telegramLinks = sqliteTable("telegram_links", {
  owner: text("owner").primaryKey(),
  code: text("code").notNull(),
  chatId: text("chat_id").notNull().default(""),
  linkedAt: integer("linked_at").notNull().default(0),
  createdAt: createdAt(),
});

/** The indexer's cursor: the newest signature it has fully processed, per program. */
export const cursors = sqliteTable("cursors", {
  key: text("key").primaryKey(),
  signature: text("signature").notNull(),
  slot: integer("slot").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * An intake the pay page is watching: the release id the QR or the form carried, and the
 * payer who asked for the transaction. Ephemeral by nature; the receipt is the record.
 */
export const intakes = sqliteTable("intakes", {
  releaseId: text("release_id").primaryKey(),
  payer: text("payer").notNull(),
  owner: text("owner").notNull(),
  createdAt: createdAt(),
});
