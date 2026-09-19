/**
 * A QUOTE IS ONLY GOOD FOR A WHILE.
 *
 * A route is a price at a moment. The contract already refuses to settle below the floor
 * the payer signed for, so a stale quote costs a reverted transaction rather than money —
 * but a button that stays live on a price from ten minutes ago is still telling the payer
 * something that is no longer true, and a reverted payment in front of an audience is its
 * own kind of expensive.
 *
 * These are the two thresholds the surfaces use, in one place so /pay and /run cannot
 * disagree about what "fresh" means.
 */

/** Refreshed automatically before this, where refreshing is cheap. */
export const QUOTE_FRESH_MS = 60_000;

/** Beyond this the payer is told, and asked to reprice rather than sign blind. */
export const QUOTE_STALE_MS = 180_000;

export type Freshness = "fresh" | "ageing" | "stale";

export function freshness(quotedAt: number, now = Date.now()): Freshness {
  const age = now - quotedAt;
  if (age < QUOTE_FRESH_MS) return "fresh";
  if (age < QUOTE_STALE_MS) return "ageing";
  return "stale";
}

/** "just now", "2 minutes ago" — the age of a price, said plainly. */
export function quoteAge(quotedAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - quotedAt) / 1000));
  if (seconds < 20) return "just now";
  // Switch to minutes at a minute, because "60 seconds ago" is not how anyone says it.
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
}
