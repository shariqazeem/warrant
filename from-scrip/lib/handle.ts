import { type Outcome, held, ok } from "@/lib/outcome";

/**
 * A HANDLE — the slug in `/pay/<handle>` and the seed of the Handle PDA.
 *
 * Mirrors `valid_slug` in the program: 3 to 24 characters of `a-z` and `0-9`. The program
 * refuses anything else, so this refuses it first, while the person is still typing.
 */
export const MIN_SLUG_LEN = 3;
export const MAX_SLUG_LEN = 24;

const SLUG = /^[a-z0-9]+$/;

export function validateSlug(raw: string): Outcome<string> {
  const s = raw.trim();
  if (s.length < MIN_SLUG_LEN) return held(`A handle needs at least ${MIN_SLUG_LEN} characters.`);
  if (s.length > MAX_SLUG_LEN) return held(`A handle can have at most ${MAX_SLUG_LEN} characters.`);
  if (!SLUG.test(s)) return held("A handle is lowercase letters and digits only.");
  return ok(s);
}

/** What a typed handle becomes: lowercased, with spaces and punctuation dropped. */
export function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, MAX_SLUG_LEN);
}
