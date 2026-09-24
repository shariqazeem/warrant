/**
 * HOW OFTEN THE KEEPER RELEASES A GRANT.
 *
 * Every release costs the keeper gas in OKB, and it passes over the grants once a minute.
 * Releasing every grant on every pass would spend roughly a dollar a day per open grant, which
 * no small grant's release fee repays, and the keeper would need topping up by hand: the
 * opposite of a service that runs by itself. So each grant is released about 48 times over its
 * schedule (every 2.5 minutes on a 2-hour grant, every 30 minutes on a 1-day one, every 15 hours
 * on a 30-day one, and once a day on anything over 48 days), and once more the moment nothing
 * further can vest, when it has ended or been cancelled, so everything owed reaches the person
 * promptly and the grant can be closed.
 *
 * Nothing here changes what anyone receives: a release pays out everything vested so far,
 * however long since the last one. It only decides when the keeper spends gas to do it. The
 * person can always claim in between, for no fee.
 */

/** About this many releases over a grant's schedule. */
export const RELEASES_PER_SCHEDULE = 48;
/** Never closer together than this, in seconds, however short the grant. */
export const MIN_GAP_SECONDS = 120;
/** Never further apart than this, in seconds, however long the grant. */
export const MAX_GAP_SECONDS = 86_400;

/** Seconds between the keeper's releases of a grant with this schedule. */
export function releaseGap(durationSeconds: number): number {
  const spread = Math.floor(Math.max(0, durationSeconds) / RELEASES_PER_SCHEDULE);
  return Math.min(MAX_GAP_SECONDS, Math.max(MIN_GAP_SECONDS, spread));
}

export type CadenceGrant = {
  start: number;
  durationSeconds: number;
  revoked: boolean;
  releasableUnits: bigint;
};

/**
 * Whether the keeper should release this grant now. `lastSentAt` is when it last sent a
 * release for it (unix seconds), or undefined if it has not since it started, in which case
 * whatever is due goes now.
 */
export function releaseNow(g: CadenceGrant, now: number, lastSentAt: number | undefined): boolean {
  if (g.releasableUnits <= 0n) return false;
  // Ended or cancelled: nothing more will vest, so what is due is final. Send it now.
  if (g.revoked || now >= g.start + g.durationSeconds) return true;
  if (lastSentAt === undefined) return true;
  return now - lastSentAt >= releaseGap(g.durationSeconds);
}
