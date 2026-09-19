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
import {reasonHash} from "./reason";

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

    -- One row. The indexer only advances it when a window was read cleanly.
    CREATE TABLE IF NOT EXISTS cursor (
      id            INTEGER PRIMARY KEY CHECK (id = 1),
      last_block    INTEGER NOT NULL
    );
  `);
  return db;
}

/**
 * Remember the text a payer typed, keyed by its hash. Writing the same reason twice is
 * free and idempotent — many payments share one reason, which is the normal case in a run.
 */
export function rememberReason(text: string): `0x${string}` {
  const hash = reasonHash(text);
  database()
    .prepare(
      `INSERT INTO reasons (hash, text, written_at) VALUES (?, ?, ?)
       ON CONFLICT(hash) DO NOTHING`,
    )
    .run(hash, text, Math.floor(Date.now() / 1000));
  return hash;
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
