"use server";

/**
 * BRING THE RECORD UP TO THE CHAIN, NOW.
 *
 * Called the moment a payment confirms, before the payer is sent anywhere. Without it the
 * receipt opens — it reads the transaction directly — but the company page and the run
 * page are still empty, because nothing has walked the log yet. That is the demo failing
 * at exactly the moment it should land.
 *
 * It never throws. Being behind is a state a page can render honestly; a 500 is not.
 */
import {catchUp} from "@/lib/indexer";

export async function syncFromChain(): Promise<{rows: number; behind: boolean}> {
  try {
    const reports = await catchUp(3);
    return {
      rows: reports.reduce((n, r) => n + r.rows, 0),
      behind: reports.length === 0,
    };
  } catch {
    return {rows: 0, behind: true};
  }
}
