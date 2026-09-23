"use server";

/**
 * A PERSON'S CHOICE, READ AND SAVED, SERVER SIDE.
 *
 * Anyone can call these with anything, so nothing the browser sends is trusted: a choice is
 * saved only after `verifyChoice` has checked every rule, the clock and the signature, and
 * `rememberChoice` has refused anything not newer than what is already kept.
 */
import {revalidatePath} from "next/cache";
import {verifyChoice, type ChoiceMessage, type StoredChoice} from "@/lib/choice";
import {rememberChoice} from "@/lib/db";
import {attempt, held, ok, shortReason, type Outcome} from "@/lib/outcome";
import {choiceFor} from "@/lib/person";

export type ChoiceNow = {
  /** The choice in force for this wallet, or null if it has never chosen. */
  choice: StoredChoice | null;
  /** The server's clock, unix seconds, so a browser with a wrong clock still signs a
   *  time the server will accept. */
  now: number;
};

export async function readChoice(person: string): Promise<Outcome<ChoiceNow>> {
  return attempt("your current choice", async () => {
    if (typeof person !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(person)) {
      return held("That is not a wallet address.");
    }
    return ok({choice: choiceFor(person), now: Math.floor(Date.now() / 1000)});
  });
}

export async function saveChoice(message: ChoiceMessage, signature: string): Promise<Outcome<StoredChoice>> {
  try {
    const verified = await verifyChoice(message, signature);
    if (!verified.ok) return verified;
    const saved = rememberChoice(verified.value);
    // The person's public page shows their choice; it must not show the old one for the
    // next fifteen seconds of its cache.
    if (saved.ok) revalidatePath("/[company]", "page");
    return saved;
  } catch (err) {
    return held(`Your choice could not be saved (${shortReason(err)}). Nothing changed; try again.`);
  }
}
