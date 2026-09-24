/**
 * THEIR CHOICE AS THE PAY FORM HOLDS IT, read before the page is sent, so a pay link opens
 * on it rather than on the stock picker and then jumping when the form's own lookup lands.
 *
 * It calls the same function the form's lookup calls (app/pay/actions.ts, readChoices), so
 * the two cannot disagree about what a choice looks like. For the pages only (a server
 * component may call a server action as a plain function); the share card never needs it.
 */
import {readChoices, type ChoiceView} from "@/app/pay/actions";

/** Their choice, null when they have none, or undefined when it could not be read — which is
 *  not "no choice": the form then asks again, as it does for a typed address. */
export async function readChoiceView(address: string): Promise<ChoiceView | null | undefined> {
  try {
    return (await readChoices([address]))[address.toLowerCase()] ?? null;
  } catch {
    return undefined;
  }
}
