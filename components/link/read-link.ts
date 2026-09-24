/**
 * WHAT A PAY LINK READS, SERVER SIDE. The page, its tab title and its share card each ask
 * the same question — is this address's page a pay link? — and answer it here, from the
 * same rows, by the same rule (pay-link.ts, pageKind).
 *
 * Server only: it reads SQLite. The words the browser also needs are in pay-link.ts.
 */
import type {StoredChoice} from "@/lib/choice";
import {choiceFor, readPaidTo} from "@/lib/person";
import {pageKind, type PageKind} from "./pay-link";

export type LinkFacts = {
  kind: PageKind;
  /** The latest choice this wallet signed, or null. */
  choice: StoredChoice | null;
  /** Payments made to this wallet through Warrant, counted over every row. */
  timesPaid: number;
};

/** Enough to decide what an address's page is, and to title it. Two small reads. */
export function linkFacts(address: string): LinkFacts {
  const choice = choiceFor(address);
  // One receipt row is plenty: the count is taken over every payment regardless.
  const paid = readPaidTo(address, 1);
  const timesPaid = paid.ok ? paid.value.paymentCount : 0;
  return {kind: pageKind({hasChoice: choice !== null, timesPaid}), choice, timesPaid};
}
