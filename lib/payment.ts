/**
 * THE ARITHMETIC AND THE GUARDS OF ONE PAYMENT, with no network in them.
 *
 * `app/pay/actions.ts` does the part that talks to the aggregator. Everything that decides
 * what a payment IS lives here, pure, so it can be tested: the dollars-to-base-units
 * conversion, the split, and the checks on what the aggregator answered.
 *
 * USDT IS SIX DECIMALS. Every figure below is in base units, and the only place dollars
 * become base units is `toBase`.
 */
import {getAddress, isAddress} from "viem";
import {ASSETS, assetByAddress, type Asset} from "./assets";
import {STABLE} from "./chain";
import {MAX_REASON_LENGTH} from "./reason";
import {held, ok, type Outcome} from "./outcome";

/**
 * Dollars as typed into a form, to USDT base units.
 *
 * Rounded, not truncated: at six decimals a truncation loses up to a millionth of a dollar
 * per line, and across a run of a hundred that is a number nobody can reconcile.
 *
 * The float is safe here because 2^53 base units is about nine billion dollars, far above
 * anything this rail will carry, but a payment above that is refused rather than silently
 * rounded to something else.
 */
export const MAX_USD = 9_000_000_000;

export function toBase(usd: number): Outcome<bigint> {
  if (!Number.isFinite(usd)) return held("That is not an amount.");
  if (usd < 0) return held("A payment cannot be negative.");
  if (usd > MAX_USD) {
    return held(`Amounts above $${MAX_USD.toLocaleString()} cannot be represented exactly.`);
  }
  return ok(BigInt(Math.round(usd * 10 ** STABLE.decimals)));
}

export type Split = {
  /** Everything pulled from the payer for this line. */
  total: bigint;
  /** The part delivered as the stablecoin, unswapped. */
  cash: bigint;
  /** The part routed into the asset. Zero means no route is built at all. */
  swapAmount: bigint;
};

/**
 * AN ADDRESS, AND WHY IT WAS REFUSED, SEPARATELY.
 *
 * viem's `isAddress` enforces EIP-55: an all-lowercase address is fine, but a MIXED-case
 * one must match its checksum. That check exists to catch a mistyped character, so a
 * failure is worth refusing on — and worth naming, because "it should be 42 characters"
 * sent to someone holding a 42-character address is a refusal that helps nobody.
 */
export function checkAddress(value: string, what: string): Outcome<`0x${string}`> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    return held(`That is not ${what}. An address on X Layer starts 0x and has 40 hex characters after it.`);
  }
  if (!isAddress(value)) {
    let suggestion = "";
    try {
      suggestion = ` Did you mean ${getAddress(value.toLowerCase())}?`;
    } catch {
      // the checksum helper refused too; the plain sentence still stands
    }
    return held(
      `That address has the right shape but its capitalisation does not match its ` +
        `checksum, which usually means a character was mistyped.${suggestion}`,
    );
  }
  return ok(value as `0x${string}`);
}

export type LineRequest = {
  recipient: string;
  usd: number;
  cashUsd: number;
  asset: string;
  reason: string;
};

/**
 * Everything that can be decided about a line without asking the aggregator anything.
 * Each refusal names the rule that caused it, in the words the form uses.
 */
export function checkLine(req: LineRequest): Outcome<Split> {
  const recipient = checkAddress(req.recipient, "an address to pay");
  if (!recipient.ok) return recipient;
  const asset = checkAddress(req.asset, "an asset address");
  if (!asset.ok) return asset;
  if (req.asset.toLowerCase() === STABLE.address.toLowerCase()) {
    return held(
      `USD₮0 is what the payment is made with, so it cannot also be what it buys.`,
    );
  }
  if (req.reason.trim().length === 0) {
    return held("Every payment carries a reason. It is the point of the receipt.");
  }
  if (req.reason.length > MAX_REASON_LENGTH) {
    return held(`A reason cannot be longer than ${MAX_REASON_LENGTH} characters.`);
  }

  const total = toBase(req.usd);
  if (!total.ok) return total;
  const cash = toBase(req.cashUsd);
  if (!cash.ok) return cash;

  if (total.value === 0n) return held("A payment needs an amount.");
  if (cash.value > total.value) {
    return held("The cash part of a payment cannot be more than the payment.");
  }

  return ok({total: total.value, cash: cash.value, swapAmount: total.value - cash.value});
}

/** The sum a payer must approve to Payroll before a run can be signed. */
export function runTotal(splits: readonly Split[]): bigint {
  return splits.reduce((sum, s) => sum + s.total, 0n);
}

/**
 * ONLY A STOCK WARRANT LISTS. The public record shows nothing else as a payment
 * (lib/confirm.ts reads the same list), so a payment in any other token would take the
 * payer's money and never print a receipt. The forms only offer the list; this is for
 * the server actions, which anyone can call.
 */
export function checkListedAsset(address: string): Outcome<Asset> {
  const listed = assetByAddress(address);
  if (listed) return ok(listed);
  return held(
    `That asset is not one of the ${ASSETS.length} stocks Warrant lists, so a payment in it would ` +
      `never print a receipt.`,
  );
}

/**
 * HOW FAR ONE PAYMENT MAY MOVE THE PRICE. Beyond this, the market for that stock on X Layer
 * is too thin for the amount: the person being paid would get noticeably less than the
 * stock trades for, and the payer would be the one who moved it.
 */
export const MAX_PRICE_IMPACT_PERCENT = 3;

/**
 * The aggregator's `priceImpactPercent`, as a size. Negative means the price moved against
 * the payer; how far is what matters here, so it is read with Math.abs.
 *
 * NULL WHEN THE AGGREGATOR DID NOT SAY. Never zero standing in for unknown: a surface with
 * no figure says nothing, and a surface with a zero says the payment moves nothing.
 */
export function readPriceImpact(raw: string | null | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const text = raw.trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Math.abs(Number(text));
}

/** "0.08%", "4.2%", "under 0.01%". Only ever given a figure the aggregator reported. */
export function impactText(percent: number): string {
  if (percent === 0) return "0%";
  if (percent < 0.01) return "under 0.01%";
  return `${Number(percent.toFixed(2))}%`;
}

/**
 * Refuses a line that would move the price too far. A line with no reported figure passes,
 * unlabelled: the contract's minimum still holds it, and a guess would be worse.
 */
export function checkPriceImpact(percent: number | null, symbol: string): Outcome<number | null> {
  if (percent === null) return ok(null);
  // Compared as it is shown, so a refusal never names a figure at or under the limit.
  if (Number(percent.toFixed(2)) > MAX_PRICE_IMPACT_PERCENT) {
    return held(
      `The market for ${symbol} on X Layer is too thin for this amount right now — ` +
        `the price would move ${impactText(percent)}. Try a smaller amount.`,
    );
  }
  return ok(percent);
}

/**
 * The worst line of a run, for its summary. Null when there are no lines, or when any line
 * did not report a figure — the worst of the lines that did would understate the run.
 */
export function worstPriceImpact(impacts: readonly (number | null)[]): number | null {
  if (impacts.length === 0) return null;
  let worst = 0;
  for (const impact of impacts) {
    if (impact === null) return null;
    if (impact > worst) worst = impact;
  }
  return worst;
}

/** What the aggregator's answer says it will do, narrowed to the parts that are checked. */
export type RouteAnswer = {
  routerResult: {
    fromTokenAmount: string;
    fromToken?: {tokenContractAddress: string};
    toToken?: {tokenContractAddress: string};
  };
  tx: {to: string; value?: string};
};

/** What was asked for: this much of `from`, into `to`, through the contract's router. */
export type RouteAsk = {router: string; from: string; to: string; amount: bigint};

/** A whole number of base units, decimal or hex. Null for anything else, never a guess. */
function wholeUnits(text: string | undefined): bigint | null {
  if (text === undefined) return null;
  const t = text.trim();
  if (/^\d+$/.test(t) || /^0x[0-9a-fA-F]+$/.test(t)) return BigInt(t);
  return null;
}

const sameAddress = (a: string | undefined, b: string) =>
  a !== undefined && a.toLowerCase() === b.toLowerCase();

/**
 * THE AGGREGATOR'S ANSWER, CHECKED AGAINST THE QUESTION, before it goes into anything a
 * payer signs.
 *
 * The contract already refuses to deliver less than the floor, so a wrong answer cannot
 * cost the payer the payment — but it can revert in front of them for a reason nobody can
 * read, or be built for a router the contract never calls. So the answer must target the
 * router the contract was deployed against, spend exactly this line's USDT and nothing
 * else, buy the stock that was chosen, and carry no OKB, because the contract sends none.
 */
export function checkRoute(answer: RouteAnswer, ask: RouteAsk): Outcome<void> {
  const refused = (what: string) =>
    held<void>(`OKX DEX answered with a route ${what}, so it was not used. Nothing was sent.`);

  if (!sameAddress(answer.tx.to, ask.router)) {
    return refused("through a contract Warrant does not pay through");
  }
  const value = answer.tx.value?.trim();
  if (wholeUnits(value === undefined || value === "" ? "0" : value) !== 0n) {
    return refused("that needs OKB sent along with it, which a USDT payment never does");
  }
  if (!sameAddress(answer.routerResult.fromToken?.tokenContractAddress, ask.from)) {
    return refused("that spends something other than USDT");
  }
  if (!sameAddress(answer.routerResult.toToken?.tokenContractAddress, ask.to)) {
    return refused("for a different stock than the one chosen");
  }
  if (wholeUnits(answer.routerResult.fromTokenAmount) !== ask.amount) {
    return refused("for a different amount than this payment");
  }
  return ok(undefined);
}

/**
 * The smallest stock purchase worth routing. Below it a route costs more in price than it
 * buys, and some pools refuse it outright, so that slice is paid in dollars instead — and
 * the line says so. $0.50, in USDT's six decimals.
 */
export const MIN_STOCK = 500_000n;

export type Resolved = {
  /** Paid as USDT. */
  cash: bigint;
  /** Swapped into `asset`. */
  stock: bigint;
  /** The stock bought, or null when the line is paid all in dollars. */
  asset: `0x${string}` | null;
  /** Whose decision the split is: the person's signed choice, or the payer's for someone who has not chosen. */
  decidedBy: "their-choice" | "payer";
  /** The chosen stock slice was under MIN_STOCK, so it was paid in dollars. */
  tooSmall: boolean;
};

/**
 * WHOSE SPLIT A LINE FOLLOWS. The person's signed choice when there is one — the payer
 * never overrides it; the payer's only for someone who has not chosen yet. The stock slice
 * is floor(total × bps / 10000) and the rest is dollars, so rounding can never create or
 * lose a unit. A slice too small to buy is paid in dollars, and says so.
 */
export function resolveSplit(
  total: bigint,
  choice: {stockBps: number; asset: `0x${string}` | null} | null,
  fallback: {cash: bigint; asset: `0x${string}`},
): Resolved {
  let stock: bigint;
  let asset: `0x${string}` | null;
  let decidedBy: Resolved["decidedBy"];

  if (choice) {
    const bps = Math.max(0, Math.min(10_000, Math.trunc(choice.stockBps)));
    stock = bps > 0 && choice.asset ? (total * BigInt(bps)) / 10_000n : 0n;
    asset = stock > 0n ? choice.asset : null;
    decidedBy = "their-choice";
  } else {
    const cash = fallback.cash > total ? total : fallback.cash;
    stock = total - cash;
    asset = stock > 0n ? fallback.asset : null;
    decidedBy = "payer";
  }

  let tooSmall = false;
  if (stock > 0n && stock < MIN_STOCK) {
    stock = 0n;
    asset = null;
    tooSmall = true;
  }

  return {cash: total - stock, stock, asset, decidedBy, tooSmall};
}
