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

/**
 * FOUR CHARACTERS NOBODY CAN GUESS. The time alone is predictable, and anyone can call the
 * contract with any run id: a name like "run-260925-130000" could be taken minutes before
 * the payer who meant it, and the run's public page would open on a stranger's rows. With
 * a tag drawn at random (about a million possibilities, no look-alike letters) the name is
 * still sayable, and it cannot be claimed in advance.
 */
const TAG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function runTag(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return Array.from(random(4), (b) => TAG_ALPHABET[b % TAG_ALPHABET.length]).join("");
}

/** "pay-260919-143205-k3f9" — one person, when, and a tag. */
export function singlePayRunId(now = new Date(), tag = runTag()): `0x${string}` {
  return runIdFromName(`pay-${stamp(now)}-${tag}`);
}

/** "run-260919-143205-k3f9" — a file of people, when, and a tag. */
export function newRunId(now = new Date(), tag = runTag()): `0x${string}` {
  return runIdFromName(`run-${stamp(now)}-${tag}`);
}
