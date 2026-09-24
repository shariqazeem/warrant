"use server";

/**
 * A WALLET ON THE CERTIFICATE PAGE JUST CHANGED THIS GRANT: sealed it, released it,
 * cancelled it. Record that transaction now (the walk would reach it within a pass, but the
 * page is about to show it), drop the page's kept read, and let the next render read the
 * chain again. It never throws: behind is a state a page can render; a 500 is not.
 */
import {revalidatePath} from "next/cache";
import {recordTransaction} from "@/lib/indexer";
import {parseGrantId} from "@/lib/grants";
import {forgetCertificate} from "./read";

export async function settleCertificate(rawId: string, hash?: string): Promise<{recorded: boolean}> {
  const id = parseGrantId(rawId);
  if (id === null) return {recorded: false};
  let recorded = false;
  try {
    if (hash && /^0x[0-9a-fA-F]{64}$/.test(hash)) {
      await recordTransaction(hash as `0x${string}`);
      recorded = true;
    }
  } catch {
    // The walk will reach it; the page reads the escrow live regardless.
  }
  forgetCertificate(id);
  revalidatePath(`/g/${id}`);
  revalidatePath("/grants");
  revalidatePath("/");
  return {recorded};
}
