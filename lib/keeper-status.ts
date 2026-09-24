/**
 * Whether the release service is running, and when it last worked. A certificate promises
 * "what vests arrives in your wallet on schedule" only while this says it is alive.
 */
export type KeeperStatus = {alive: boolean; lastPassAt: number | null; lastReleaseAt: number | null};

export async function readKeeperStatus(): Promise<KeeperStatus> {
  return {alive: false, lastPassAt: null, lastReleaseAt: null};
} // STUB — lane E owns
