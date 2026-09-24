/**
 * A certificate lists the transactions that sealed, cancelled and closed its grant. They are
 * kept from the escrow's own logs, decoded here from real encodings of the contract's events,
 * and only for grants on the record, from this escrow, naming the grant's own payer.
 */
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {encodeAbiParameters, encodeEventTopics, parseEventLogs, type Hex} from "viem";
import {grantEscrowAbi} from "./payroll-abi";

let ge: typeof import("./grant-events");
let db: typeof import("./db");
let dir: string;

const ESCROW = "0xb238d76499616377abd4908e46f29c7ce50908d1" as const;
const PAYER = "0x3fa9000000000000000000000000000000041c0a" as const;
const TX = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "warrant-ge-"));
  process.env.WARRANT_DB_PATH = join(dir, "test.db");
  db = await import("./db");
  ge = await import("./grant-events");
  // Grant 7 is on the record; grant 8 is not.
  db.database()
    .prepare(
      `INSERT INTO grants (id, tx_hash, block_number, block_time, payer, beneficiary, asset, units,
         shares, stable_cost, start_at, cliff_seconds, duration_secs, tip_bps, reason_hash)
       VALUES (7, ?, 100, 1, ?, ?, ?, '1', '1', '1', 1, 0, 10, 50, ?)`,
    )
    .run(TX(1), PAYER, "0x00000000000000000000000000000000000ca511", "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48", TX(0));
});

afterAll(() => rmSync(dir, {recursive: true, force: true}));

/** A raw log as the escrow would emit it. */
function raw(eventName: "GrantSealed" | "GrantRevoked" | "GrantClosed", args: Record<string, unknown>, data: Hex, tx: number, logIndex: number) {
  const topics = encodeEventTopics({abi: grantEscrowAbi, eventName, args} as never) as Hex[];
  return {
    address: ESCROW,
    topics: topics as [Hex, ...Hex[]],
    data,
    transactionHash: TX(tx),
    logIndex,
    blockNumber: 200n + BigInt(tx),
    blockHash: TX(999),
    transactionIndex: 0,
    removed: false,
  };
}

describe("the seal, cancel and close of a grant", () => {
  it("keeps all three for a grant on the record, oldest first, with what a cancel moved", () => {
    const logs = [
      raw("GrantSealed", {id: 7n, payer: PAYER}, "0x", 10, 0),
      raw(
        "GrantRevoked",
        {id: 7n, payer: PAYER},
        encodeAbiParameters([{type: "uint256"}, {type: "uint256"}], [123n, 456n]),
        11,
        3,
      ),
      raw("GrantClosed", {id: 7n}, encodeAbiParameters([{type: "uint256"}], [0n]), 12, 1),
    ];
    const decoded = parseEventLogs({abi: grantEscrowAbi, logs}) as unknown as import("./grant-events").GrantEventLog[];
    expect(decoded.every((l) => ge.isGrantEvent(l))).toBe(true);

    const times = new Map<bigint, number>([[210n, 1_790_000_000]]);
    expect(ge.writeGrantEvents(ESCROW, decoded, times)).toBe(3);
    // The same logs again are ignored.
    expect(ge.writeGrantEvents(ESCROW, decoded, times)).toBe(3);

    const events = ge.readGrantEvents(ESCROW, {id: 7, payer: PAYER});
    expect(events.map((e) => e.kind)).toEqual(["sealed", "revoked", "closed"]);
    expect(events[0]!.txHash).toBe(TX(10));
    expect(events[0]!.blockTime).toBe(1_790_000_000);
    expect(events[1]!.vestedUnits).toBe(123n);
    expect(events[1]!.returnedUnits).toBe(456n);
    expect(events[2]!.vestedUnits).toBeNull();
  });

  it("keeps nothing for a grant that is not on the record", () => {
    const decoded = parseEventLogs({
      abi: grantEscrowAbi,
      logs: [raw("GrantSealed", {id: 8n, payer: PAYER}, "0x", 20, 0)],
    }) as unknown as import("./grant-events").GrantEventLog[];
    expect(ge.writeGrantEvents(ESCROW, decoded, new Map())).toBe(0);
    expect(ge.readGrantEvents(ESCROW, {id: 8, payer: PAYER})).toEqual([]);
  });

  it("lends no rows to another escrow, or to a grant with another payer", () => {
    expect(ge.readGrantEvents("0x5a5af2d85e46b56e8f6de73d273eea9e868c71dc", {id: 7, payer: PAYER})).toEqual([]);
    const other = ge.readGrantEvents(ESCROW, {id: 7, payer: "0x0000000000000000000000000000000000000001"});
    // Only the close, which names no payer, survives the check.
    expect(other.map((e) => e.kind)).toEqual(["closed"]);
  });
});
