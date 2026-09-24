/**
 * WHAT A WALLET SAID WHEN IT REFUSED, AS ONE SENTENCE A PERSON CAN ACT ON.
 *
 * One reading for every wallet panel on the site, so a refusal reads the same on /me, /pay
 * and /run, and the words cannot drift between copies.
 *
 * A wallet may refuse with anything: an Error, a bare string, or an object carrying only a
 * code. wagmi hands the unknown ones through untouched, so nothing here assumes a message
 * exists. A reading that threw would take the whole page down with it, which is worse than
 * any refusal it was trying to explain.
 */

/** Thrown by the OKX connector when its window closes before a wallet connects. */
export const OKX_CLOSED = "You closed the OKX window before connecting.";

/** Every string a refusal carries, outermost first, following `cause` a few levels down. */
export function saidBy(err: unknown): {text: string; first: string; code: number | undefined} {
  if (typeof err === "string") return {text: err, first: err, code: undefined};
  const said: string[] = [];
  let code: number | undefined;
  let e: unknown = err;
  for (let depth = 0; typeof e === "object" && e !== null && depth < 6; depth++) {
    const o = e as {shortMessage?: unknown; details?: unknown; message?: unknown; code?: unknown; cause?: unknown};
    if (code === undefined && typeof o.code === "number") code = o.code;
    for (const s of [o.shortMessage, o.message, o.details]) if (typeof s === "string" && s.trim()) said.push(s);
    e = o.cause;
  }
  return {text: said.join(" "), first: (said[0] ?? "").split("\n")[0]!.slice(0, 200), code};
}

/** A connect that failed. */
export function connectWords(err: unknown): string {
  const {text, first, code} = saidBy(err);
  if (text.includes(OKX_CLOSED)) return `${OKX_CLOSED} Press OKX Wallet to show the code again.`;
  if (code === 4001 || /rejected|denied/i.test(text)) return "The request was dismissed in your wallet.";
  if (code === -32002 || /already pending/i.test(text)) return "Your wallet already has a request open. Check it.";
  return first || "Your wallet stopped without saying why. Try again, or pick another wallet.";
}

/** A network switch that failed. */
export function switchWords(err: unknown): string {
  const {text, first, code} = saidBy(err);
  if (code === 4001 || /rejected|denied/i.test(text)) return "The switch was dismissed in your wallet.";
  return first || "Your wallet did not switch, and did not say why. Switch it to X Layer in the wallet itself.";
}
