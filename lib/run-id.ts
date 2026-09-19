/**
 * A RUN ID IS A NAME, NOT A HASH.
 *
 * It is `bytes32` on chain, and the whole point of it is that a person can say "run-0919-1432"
 * out loud and someone else can find it. So it is left-aligned ASCII with zero padding,
 * which `runLabel` in lib/format.ts reads back. A random hash would work identically for
 * the contract and be useless to everyone else.
 */
import {stringToHex} from "viem";

/** bytes32 can hold 32 ASCII characters and not one more. */
export const MAX_RUN_NAME = 32;

export function runIdFromName(name: string): `0x${string}` {
  const clean = name.trim().slice(0, MAX_RUN_NAME);
  return stringToHex(clean, {size: 32});
}

function stamp(now: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(now.getUTCFullYear() % 100)}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}` +
    `-${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`
  );
}

/** "pay-260919-143205" — one person, and when. */
export function singlePayRunId(now = new Date()): `0x${string}` {
  return runIdFromName(`pay-${stamp(now)}`);
}

/** "run-260919-1432" — a file of people, and when. */
export function newRunId(now = new Date()): `0x${string}` {
  return runIdFromName(`run-${stamp(now)}`);
}
