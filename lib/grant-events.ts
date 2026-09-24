/**
 * A GRANT'S OTHER THREE MOMENTS: sealed, revoked, closed.
 *
 * The indexer has always kept a grant's opening and its releases. A certificate also lists
 * the transaction that sealed it, the one that cancelled it and the one that closed it, each
 * linked to OKLink — so those are kept too, here, from the same walk (lib/indexer.ts reads
 * all five escrow events in one `getLogs` per window) and from `recordTransaction` the moment
 * a wallet on the certificate page sends one.
 *
 * Like every table in var/warrant.db this is a copy for speed: the escrow's own storage says
 * whether a grant is sealed or revoked, and a page always reads that live. This only says
 * which transaction did it, and when.
 *
 * Its own table, created on first use, so the schema in lib/db.ts is left as it was.
 */
import {parseAbiItem, type Address} from "viem";
import {database} from "./db";

export const GRANT_SEALED_EVENT = parseAbiItem("event GrantSealed(uint256 indexed id, address indexed payer)");
export const GRANT_REVOKED_EVENT = parseAbiItem(
  "event GrantRevoked(uint256 indexed id, address indexed payer, uint256 vestedUnits, uint256 returnedUnits)",
);
export const GRANT_CLOSED_EVENT = parseAbiItem("event GrantClosed(uint256 indexed id, uint256 unused)");

export type GrantEventKind = "sealed" | "revoked" | "closed";

/** One of the three, as a log decodes. Loose on purpose: viem's decoded shapes all fit. */
export type GrantEventLog = {
  eventName: string;
  transactionHash: `0x${string}` | null;
  logIndex: number | null;
  blockNumber: bigint | null;
  args: {id?: bigint; payer?: Address; vestedUnits?: bigint; returnedUnits?: bigint};
};

export type GrantEvent = {
  kind: GrantEventKind;
  txHash: `0x${string}`;
  logIndex: number;
  blockNumber: number;
  blockTime: number | null;
  /** On a cancel: what had vested and stayed theirs, and what went back to the grantor. */
  vestedUnits: bigint | null;
  returnedUnits: bigint | null;
};

let ready = false;

function table() {
  const db = database();
  if (!ready) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS grant_events (
        escrow         TEXT NOT NULL,
        tx_hash        TEXT NOT NULL,
        log_index      INTEGER NOT NULL,
        block_number   INTEGER NOT NULL,
        block_time     INTEGER,
        grant_id       INTEGER NOT NULL,
        kind           TEXT NOT NULL,
        payer          TEXT,
        vested_units   TEXT,
        returned_units TEXT,
        PRIMARY KEY (tx_hash, log_index)
      );
      CREATE INDEX IF NOT EXISTS grant_events_grant ON grant_events (escrow, grant_id, block_number);
    `);
    ready = true;
  }
  return db;
}

const KIND: Record<string, GrantEventKind | undefined> = {
  GrantSealed: "sealed",
  GrantRevoked: "revoked",
  GrantClosed: "closed",
};

/** Is this decoded escrow log one of the three? */
export function isGrantEvent(l: {eventName?: string}): boolean {
  return l.eventName !== undefined && KIND[l.eventName] !== undefined;
}

/**
 * Keep the three moments of grants that are on the record. A moment of a grant whose
 * opening never checked out (and so never became a row) is not kept, as with releases.
 * Repeats are ignored. Returns how many rows it wrote.
 */
export function writeGrantEvents(escrow: Address, logs: readonly GrantEventLog[], times: Map<bigint, number>): number {
  const mine = logs.filter((l) => isGrantEvent(l) && l.transactionHash && l.logIndex !== null && l.blockNumber !== null);
  if (mine.length === 0) return 0;
  const db = table();
  const known = db.prepare(`SELECT 1 FROM grants WHERE id = ?`);
  const insert = db.prepare(
    `INSERT INTO grant_events (escrow, tx_hash, log_index, block_number, block_time, grant_id, kind,
       payer, vested_units, returned_units)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tx_hash, log_index) DO NOTHING`,
  );
  let rows = 0;
  db.transaction(() => {
    for (const l of mine) {
      const id = Number(l.args.id!);
      if (!known.get(id)) continue;
      insert.run(
        escrow.toLowerCase(),
        l.transactionHash!.toLowerCase(),
        l.logIndex,
        Number(l.blockNumber),
        times.get(l.blockNumber!) ?? null,
        id,
        KIND[l.eventName]!,
        l.args.payer ? l.args.payer.toLowerCase() : null,
        l.args.vestedUnits !== undefined ? l.args.vestedUnits.toString() : null,
        l.args.returnedUnits !== undefined ? l.args.returnedUnits.toString() : null,
      );
      rows++;
    }
  })();
  return rows;
}

/**
 * A grant's seal, cancel and close, oldest first. Only rows from this escrow, and only
 * sealed and revoked rows naming the grant's own payer: the table is a cache, and a cache
 * left over from another deployment must not lend its rows to this one.
 */
export function readGrantEvents(escrow: string, g: {id: number; payer: string}): GrantEvent[] {
  const rows = table()
    .prepare(
      `SELECT tx_hash, log_index, block_number, block_time, kind, payer, vested_units, returned_units
         FROM grant_events
        WHERE escrow = ? AND grant_id = ?
        ORDER BY block_number ASC, log_index ASC`,
    )
    .all(escrow.toLowerCase(), g.id) as Array<{
    tx_hash: string;
    log_index: number;
    block_number: number;
    block_time: number | null;
    kind: GrantEventKind;
    payer: string | null;
    vested_units: string | null;
    returned_units: string | null;
  }>;
  return rows
    .filter((r) => r.kind === "closed" || r.payer === g.payer.toLowerCase())
    .map((r) => ({
      kind: r.kind,
      txHash: r.tx_hash as `0x${string}`,
      logIndex: r.log_index,
      blockNumber: r.block_number,
      blockTime: r.block_time,
      vestedUnits: r.vested_units === null ? null : BigInt(r.vested_units),
      returnedUnits: r.returned_units === null ? null : BigInt(r.returned_units),
    }));
}
