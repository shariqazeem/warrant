/**
 * A PERSON'S PAY LINK, IN WORDS: warrant.world/@<their wallet>, which anyone can pay.
 *
 * The page, its share card and the pay form all say who is being paid and how they are
 * split, so the sentences live here once and a test holds them to lib/choice.ts. Pure, and
 * no database: the pay form runs in the browser and imports this.
 */
import {getAddress} from "viem";
import {assetByAddress} from "../../lib/assets";
import {MAX_BPS, ZERO_ADDRESS} from "../../lib/choice";
import {bps, cap, short} from "../../lib/format";
import {checkAddress} from "../../lib/payment";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * A wallet as a page prints it: checksummed (EIP-55), whatever case it arrived in. The
 * record is kept lowercase; this is only how it reads. Anything that is not an address is
 * handed back unchanged, never guessed at.
 */
export function displayAddress(address: string): string {
  return ADDRESS.test(address) ? getAddress(address.toLowerCase()) : address;
}

/** The link itself, from the site's root: "/@0xD5FE4a…". */
export const payLinkPath = (address: string): string => `/@${displayAddress(address)}`;

/** "Pay 0xD5FE4a…125B". The heading, the tab title and the share card all start with it. */
export const payHeading = (address: string): string => `Pay ${short(displayAddress(address))}`;

/** The tab title of a pay link. */
export const payTitle = (address: string): string => `${payHeading(address)} — Warrant`;

/** What a pay link says of itself when it is shared, for someone who has chosen. */
export const PAY_DESCRIPTION = "Pay them in dollars; they get their own split of stock, with a receipt.";

/** The same, for someone paid before who has not chosen: the split is the payer's, so it says so. */
export const PAY_DESCRIPTION_UNCHOSEN =
  "Pay them in dollars, with a receipt. They haven't chosen their split yet, so you pick.";

/** What a pay link says of someone who has been paid but has not chosen how. */
export const NOT_CHOSEN = "They haven't chosen yet — you pick for this payment.";

/**
 * WHEN AN ADDRESS'S PAGE IS A PAY LINK. Someone who has signed a choice has asked to be paid
 * through Warrant, and someone already paid through it is someone people pay. Anyone else's
 * page stays the public record it was: a company's, or nobody's yet.
 *
 * The page and its share card both decide by this, so a card never advertises a page that
 * is not there.
 */
export type PageKind = "pay-link" | "record";

export function pageKind(a: {hasChoice: boolean; timesPaid: number}): PageKind {
  return a.hasChoice || a.timesPaid > 0 ? "pay-link" : "record";
}

// ── the split, in words ─────────────────────────────────────────────────────────────

/**
 * A choice as either side holds it. A stored choice names the zero address when nothing
 * becomes stock; the pay form's view of one names null.
 */
export type SplitLike = {stockBps: number; asset: string | null};

/**
 * THE SPLIT AS A PAYER READS IT: the share, for a page to print as a figure, and the words
 * after it. With nothing as stock there is no share to print.
 *
 *   {share: "25%", rest: "of each payment in S&P 500 xStock (SPYx), the rest in USDT."}
 *   {share: null,  rest: "all of each payment in USDT, no stock."}
 *
 * The same reading of a choice as the payment builder's (lib/payment.ts, resolveSplit): a
 * share with no stock named is all USDT.
 */
export function splitWords(c: SplitLike): {share: string | null; rest: string} {
  if (c.stockBps <= 0 || c.asset === null || c.asset.toLowerCase() === ZERO_ADDRESS) {
    return {share: null, rest: "all of each payment in USDT, no stock."};
  }
  const stock = assetByAddress(c.asset);
  // A choice signed for a stock that has since been taken off the list says so, rather than
  // hiding it: a payment in it would be refused, and the payer is owed the reason.
  const named = stock
    ? `${stock.name} (${stock.symbol})`
    : `a stock Warrant no longer pays in (${short(c.asset)})`;
  const rest = c.stockBps >= MAX_BPS ? "" : ", the rest in USDT";
  return {share: bps(c.stockBps), rest: `of each payment in ${named}${rest}.`};
}

/** Beside a "They chose" label: "25% of each payment in S&P 500 xStock (SPYx), the rest in USDT." */
export function choiceLine(c: SplitLike): string {
  const {share, rest} = splitWords(c);
  return share ? `${share} ${rest}` : cap(rest);
}

/** The pay link's one line: "They get 25% of each payment in …". No choice yet: NOT_CHOSEN. */
export function theyGet(c: SplitLike | null): string {
  if (!c) return NOT_CHOSEN;
  const {share, rest} = splitWords(c);
  return share ? `They get ${share} ${rest}` : `They get ${rest}`;
}

// ── /pay?to=0x… ─────────────────────────────────────────────────────────────────────

export type ToParam =
  | {kind: "none"}
  | {kind: "fixed"; address: `0x${string}`}
  | {kind: "refused"; why: string};

/**
 * THE WALLET A /pay LINK ASKS TO PAY, checked the way the form checks a typed one
 * (lib/payment.ts, checkAddress), because the form will not let the payer edit it.
 *
 * One address or none. A link that names two is refused rather than guessed between, and a
 * mixed-case address whose checksum fails is refused with the reason, since that is how a
 * mistyped character shows.
 */
export function readTo(raw: string | string[] | undefined): ToParam {
  if (raw === undefined) return {kind: "none"};
  if (Array.isArray(raw)) {
    return raw.length === 0
      ? {kind: "none"}
      : {kind: "refused", why: "The link names more than one wallet, so it is not clear whom to pay."};
  }
  const value = raw.trim().replace(/^@/, "");
  if (value === "") return {kind: "none"};
  const checked = checkAddress(value, "a wallet address");
  if (!checked.ok) return {kind: "refused", why: checked.why};
  return {kind: "fixed", address: displayAddress(checked.value) as `0x${string}`};
}
