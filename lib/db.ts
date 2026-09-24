/**
 * THE CACHE. Only the hash of a reason goes on chain; the text lives here.
 *
 * That split is the whole trust story of a receipt, and it has one failure mode worth
 * guarding: text that does not hash to the log's `reasonHash`. That is either the wrong
 * reason or a tampered one, and in both cases the receipt must say so rather than print
 * it. `reasonFor` returns the text AND whether it verifies; the page decides what to show.
 *
 * SQLite because the shape mirrors Scrip's and because a hackathon judge can open the
 * file. Nothing here is a source of truth — the chain is. Delete it and the receipts
 * still render, minus the reason text.
 */
import Database from "better-sqlite3";
import {mkdirSync} from "node:fs";
import {dirname} from "node:path";
import type {Choice, StoredChoice} from "./choice";
import {stampUTC} from "./format";
import {held, ok, type Outcome} from "./outcome";
import {MAX_REASON_LENGTH, normaliseReason, reasonHash} from "./reason";

const PATH = process.env.WARRANT_DB_PATH ?? "var/warrant.db";

let db: Database.Database | null = null;

export function database(): Database.Database {
  if (db) return db;
  mkdirSync(dirname(PATH), {recursive: true});
  db = new Database(PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS reasons (
      hash        TEXT PRIMARY KEY,
      text        TEXT NOT NULL,
      written_at  INTEGER NOT NULL
    );

    -- The indexer's view of Paid. The chain is the source of truth; this is for speed.
    CREATE TABLE IF NOT EXISTS receipts (
      tx_hash       TEXT NOT NULL,
      log_index     INTEGER NOT NULL,
      block_number  INTEGER NOT NULL,
      block_time    INTEGER,
      payer         TEXT NOT NULL,
      recipient     TEXT NOT NULL,
      run_id        TEXT NOT NULL,
      asset         TEXT NOT NULL,
      stable_amount TEXT NOT NULL,
      cash_amount   TEXT NOT NULL,
      asset_amount  TEXT NOT NULL,
      reason_hash   TEXT NOT NULL,
      PRIMARY KEY (tx_hash, log_index)
    );

    CREATE INDEX IF NOT EXISTS receipts_payer     ON receipts (payer, block_number DESC);
    CREATE INDEX IF NOT EXISTS receipts_recipient ON receipts (recipient, block_number DESC);
    CREATE INDEX IF NOT EXISTS receipts_run       ON receipts (run_id);

    -- Grants, as the escrow reported them when they were opened. The live figures —
    -- what is held, what is due — are read from the contract, never from here.
    CREATE TABLE IF NOT EXISTS grants (
      id            INTEGER PRIMARY KEY,
      tx_hash       TEXT NOT NULL,
      block_number  INTEGER NOT NULL,
      block_time    INTEGER,
      payer         TEXT NOT NULL,
      beneficiary   TEXT NOT NULL,
      asset         TEXT NOT NULL,
      units         TEXT NOT NULL,
      shares        TEXT NOT NULL,
      stable_cost   TEXT NOT NULL,
      start_at      INTEGER NOT NULL,
      cliff_seconds INTEGER NOT NULL,
      duration_secs INTEGER NOT NULL,
      tip_bps       INTEGER NOT NULL,
      reason_hash   TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS grants_payer ON grants (payer, block_number DESC);
    CREATE INDEX IF NOT EXISTS grants_beneficiary ON grants (beneficiary, block_number DESC);

    -- Every release. A vest is a money moment and prints a receipt like any other.
    CREATE TABLE IF NOT EXISTS vests (
      tx_hash       TEXT NOT NULL,
      log_index     INTEGER NOT NULL,
      block_number  INTEGER NOT NULL,
      block_time    INTEGER,
      grant_id      INTEGER NOT NULL,
      beneficiary   TEXT NOT NULL,
      caller        TEXT NOT NULL,
      asset         TEXT NOT NULL,
      units_to_beneficiary TEXT NOT NULL,
      units_to_caller      TEXT NOT NULL,
      PRIMARY KEY (tx_hash, log_index)
    );

    CREATE INDEX IF NOT EXISTS vests_grant ON vests (grant_id, block_number DESC);
    CREATE INDEX IF NOT EXISTS vests_beneficiary ON vests (beneficiary, block_number DESC);

    -- One row per watched contract. THE CURSOR ONLY ADVANCES WHEN A WINDOW WAS READ
    -- CLEANLY: a refused range leaves it where it was, so nothing is ever skipped.
    CREATE TABLE IF NOT EXISTS cursor (
      name          TEXT PRIMARY KEY,
      last_block    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );

    -- How each person chose to be paid, as they signed it (lib/choice.ts). NOT A CACHE:
    -- these are off chain, so this table is the record, and the signature is kept so anyone
    -- can check a row against the wallet that made it. Append-only: a change is a new row,
    -- so a receipt can say which choice stood when it was paid. Addresses are lowercase.
    CREATE TABLE IF NOT EXISTS choices (
      person        TEXT NOT NULL,
      stock_bps     INTEGER NOT NULL,
      asset         TEXT NOT NULL,
      eligible      INTEGER NOT NULL,
      issued_at     INTEGER NOT NULL,
      signature     TEXT NOT NULL,
      saved_at      INTEGER NOT NULL,
      PRIMARY KEY (person, issued_at)
    );
  `);
  return db;
}

/**
 * Remember the text a payer typed, keyed by its hash. Writing the same reason twice is
 * free and idempotent — many payments share one reason, which is the normal case in a run.
 */
export function rememberReason(text: string): `0x${string}` {
  // The hash is of the text as given. Truncating before hashing would store a reason that
  // does not match the receipt, which reasonFor would then correctly refuse to vouch for.
  if (text.length > MAX_REASON_LENGTH) {
    throw new Error(`A reason cannot be longer than ${MAX_REASON_LENGTH} characters.`);
  }
  const hash = reasonHash(text);
  // Kept as it was hashed: the hash is of the normalised text, so the normalised text is
  // what an outside checker must be able to hash again — with the contract's own
  // hashReason, which takes the bytes as they are — and arrive at the same hash.
  database()
    .prepare(
      `INSERT INTO reasons (hash, text, written_at) VALUES (?, ?, ?)
       ON CONFLICT(hash) DO NOTHING`,
    )
    .run(hash, normaliseReason(text), Math.floor(Date.now() / 1000));
  return hash;
}

/** Where the indexer has read up to for a contract, or nothing if it never has. */
export function readCursor(name: string): number | null {
  const row = database().prepare(`SELECT last_block FROM cursor WHERE name = ?`).get(name) as
    | {last_block: number}
    | undefined;
  return row ? row.last_block : null;
}

/** Only ever called after a window was read without a refusal. */
export function writeCursor(name: string, lastBlock: number): void {
  database()
    .prepare(
      `INSERT INTO cursor (name, last_block, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET last_block = excluded.last_block, updated_at = excluded.updated_at`,
    )
    .run(name, lastBlock, Math.floor(Date.now() / 1000));
}

export type StoredReason =
  | {found: false}
  | {found: true; text: string; verified: boolean};

/**
 * The reason behind a hash, and whether it actually hashes to it.
 *
 * `verified: false` is not a rendering detail. It means the stored text is not the text
 * that was paid for, and a receipt showing it as the reason would be a lie anchored to a
 * real transaction — worse than showing nothing.
 */
export function reasonFor(hash: string): StoredReason {
  const row = database()
    .prepare(`SELECT text FROM reasons WHERE hash = ?`)
    .get(hash.toLowerCase()) as {text: string} | undefined;

  if (!row) return {found: false};
  return {found: true, text: row.text, verified: reasonHash(row.text) === hash.toLowerCase()};
}

type ChoiceRow = {
  person: string;
  stock_bps: number;
  asset: string;
  eligible: number;
  issued_at: number;
  signature: string;
  saved_at: number;
};

function toStoredChoice(r: ChoiceRow): StoredChoice {
  return {
    person: r.person as `0x${string}`,
    stockBps: r.stock_bps,
    asset: r.asset as `0x${string}`,
    eligible: r.eligible === 1,
    issuedAt: r.issued_at,
    signature: r.signature as `0x${string}`,
    savedAt: r.saved_at,
  };
}

/**
 * Keep a choice that `verifyChoice` (lib/choice.ts) has already checked.
 *
 * REFUSES ONE THAT IS NOT NEWER THAN THE LATEST KEPT FOR THAT WALLET. A signature stays a
 * valid signature for ever, and every choice is on its person's public page — so without
 * this, anyone could put back a choice the person has since changed. The check and the
 * write are one IMMEDIATE transaction: nothing can land between them.
 */
export function rememberChoice(
  choice: Choice,
  savedAt: number = Math.floor(Date.now() / 1000),
): Outcome<StoredChoice> {
  const conn = database();
  const person = choice.person.toLowerCase();
  const write = conn.transaction((): Outcome<StoredChoice> => {
    const latest = conn
      .prepare(`SELECT MAX(issued_at) AS at FROM choices WHERE person = ?`)
      .get(person) as {at: number | null};
    if (latest.at !== null && choice.issuedAt <= latest.at) {
      return held(
        `A newer choice is already saved for this wallet (signed ${stampUTC(latest.at)}), so ` +
          "an older one cannot replace it. To change it, sign a new one.",
      );
    }
    const row: ChoiceRow = {
      person,
      stock_bps: choice.stockBps,
      asset: choice.asset.toLowerCase(),
      eligible: choice.eligible ? 1 : 0,
      issued_at: choice.issuedAt,
      signature: choice.signature.toLowerCase(),
      saved_at: savedAt,
    };
    conn
      .prepare(
        `INSERT INTO choices (person, stock_bps, asset, eligible, issued_at, signature, saved_at)
         VALUES (@person, @stock_bps, @asset, @eligible, @issued_at, @signature, @saved_at)`,
      )
      .run(row);
    return ok(toStoredChoice(row));
  });
  return write.immediate();
}

/** The latest choice kept for a wallet, whatever case its address arrives in, or null. */
export function readLatestChoice(person: string): StoredChoice | null {
  const row = database()
    .prepare(`SELECT * FROM choices WHERE person = ? ORDER BY issued_at DESC LIMIT 1`)
    .get(person.toLowerCase()) as ChoiceRow | undefined;
  return row ? toStoredChoice(row) : null;
}

/** The latest choice a wallet had signed at or before a moment (unix seconds), or null. */
export function readChoiceAt(person: string, unixSeconds: number): StoredChoice | null {
  const row = database()
    .prepare(
      `SELECT * FROM choices WHERE person = ? AND issued_at <= ?
        ORDER BY issued_at DESC LIMIT 1`,
    )
    .get(person.toLowerCase(), unixSeconds) as ChoiceRow | undefined;
  return row ? toStoredChoice(row) : null;
}

/**
 * The route a transaction's swap took, token by token, as the OKX quote named it — for
 * example ["USD₮0", "USDG", "wSPYx", "SPYx"] — or null when none was recorded.
 */
export function routeFor(_tx: string): string[] | null { return null } // STUB — lane C owns
