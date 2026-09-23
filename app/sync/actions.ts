"use server";

/**
 * BRING THE RECORD UP TO THE CHAIN, NOW.
 *
 * Called the moment a payment confirms, just after the payer is sent to its receipt (which
 * reads its own transaction, so it is true already). Without it the company page and the
 * run page could still be empty, because nothing has walked the log yet — the demo failing
 * at exactly the moment it should land.
 *
 * It never throws. Being behind is a state a page can render honestly; a 500 is not.
 */
import {revalidatePath} from "next/cache";
import {catchUp, recordTransaction} from "@/lib/indexer";

/**
 * `hash` is the transaction the payer just signed. It is recorded directly, whatever the
 * walk has reached, so the run page and the company page are true the moment they open.
 */
export async function syncFromChain(hash?: string): Promise<{rows: number; behind: boolean}> {
  let rows = 0;
  let behind = true;
  try {
    if (hash && /^0x[0-9a-fA-F]{64}$/.test(hash)) {
      rows += await recordTransaction(hash as `0x${string}`);
      behind = false;
    }
  } catch {
    // Not fatal: the walk will reach it. The receipt page reads the chain regardless.
  }
  try {
    const reports = await catchUp(3);
    rows += reports.reduce((n, r) => n + r.rows, 0);
    if (reports.length > 0) behind = false;
  } catch {
    // Behind is a state a page can render; see above.
  }
  // The front page and the grants page are cached for a few seconds; a payer who has just
  // paid must not open them and find the old version.
  revalidatePath("/");
  revalidatePath("/grants");
  revalidatePath("/[company]", "page");
  revalidatePath("/run/[id]", "page");
  return {rows, behind};
}
