// STUB — lane E owns
/**
 * Whether the release service is running. Lane E's keeper writes a heartbeat this reads; the
 * stand-in says it is not running, so no page promises releases that are not happening.
 */
export type KeeperStatus = {alive: boolean; lastPassAt: number | null; lastReleaseAt: number | null};

export function readKeeperStatus(): KeeperStatus {
  return {alive: false, lastPassAt: null, lastReleaseAt: null};
}
