/**
 * THE ARITHMETIC AND THE GUARDS OF ONE PAYMENT, with no network in them.
 *
 * `app/pay/actions.ts` does the part that talks to the aggregator. Everything that decides
 * what a payment IS lives here, pure, so it can be tested: the dollars-to-base-units
 * conversion and the split.
 *
 * USDT IS SIX DECIMALS. Every figure below is in base units, and the only place dollars
 * become base units is `toBase`.
 */
import {getAddress, isAddress} from "viem";
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
      `${STABLE.symbol} is what the payment is made with, so it cannot also be what it buys.`,
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
