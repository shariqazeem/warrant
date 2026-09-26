/**
 * WHAT A PAYSLIP LINE DELIVERED, in the words a row shows: the stock, the dollars, or both.
 *
 * One source for every list of payslips. A company's page printed a line paid all in dollars
 * as "0.0000 USD₮0", which reads as nothing paid, while the person's own page said "$2 USD₮0"
 * for the same line.
 */
import {unitsFromRaw, usdt} from "./format";
import {STABLE_NAME} from "./grant-terms";

export type Delivered = {assetAmount: bigint; assetDecimals: number; assetSymbol: string; cashAmount: bigint};

export function received(r: Delivered): {main: string; plus: string | null} {
  if (r.assetAmount > 0n) {
    return {
      main: `${unitsFromRaw(r.assetAmount, r.assetDecimals)} ${r.assetSymbol}`,
      plus: r.cashAmount > 0n ? `+ ${usdt(r.cashAmount)} ${STABLE_NAME}` : null,
    };
  }
  return {main: `${usdt(r.cashAmount)} ${STABLE_NAME}`, plus: null};
}
