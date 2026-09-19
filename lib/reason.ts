/**
 * THE REASON HASH, IN TYPESCRIPT.
 *
 * Only the hash goes on chain; the text lives in the indexer. That is the whole trust
 * story of a receipt, so the two implementations must agree exactly. `Payroll.hashReason`
 * is the other one, and `lib/reason.test.ts` checks both against the same fixture —
 * because two lists that drift is the defect shape that costs the most here.
 *
 * Normalisation is deliberate and minimal: trim the ends, collapse runs of whitespace.
 * A reason typed with a trailing space must hash to the same receipt as one without, or a
 * payer who cannot see the difference gets a stub that will not verify.
 */
import {keccak256, toHex} from "viem";

/**
 * Longer than any reason a person writes on a payment, short enough that a public endpoint
 * cannot be used to fill a disk.
 *
 * DELIBERATELY HERE AND NOT IN lib/db.ts. Line validation runs in the browser, and a
 * constant imported from the module that opens SQLite would drag better-sqlite3 into the
 * client bundle with it.
 */
export const MAX_REASON_LENGTH = 500;

export function normaliseReason(reason: string): string {
  return reason.trim().replace(/\s+/g, " ");
}

export function reasonHash(reason: string): `0x${string}` {
  return keccak256(toHex(normaliseReason(reason)));
}

/** The shared fixture. Solidity's test asserts the same pair. */
export const REASON_FIXTURE = {
  text: "Design review, week 38",
  hash: "0xc35125c0955cfae5de059f0930914793effb971856e9d81ca483713b022aaa14",
} as const;

export const EMPTY_REASON_HASH =
  "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470" as const;
