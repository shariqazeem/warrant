"use server";

/**
 * BUILDING A PAYMENT, SERVER SIDE.
 *
 * The aggregator credentials sign every request, so the route is built here and the
 * browser only ever receives the finished calldata. Nothing in this file decides anything:
 * the payer chose the recipient, the amount, the asset, the split and the reason.
 *
 * THE CALLDATA IS BOUND TO WHOEVER HOLDS THE STABLECOIN AT SWAP TIME, and that is the
 * Payroll contract, not the payer. `userWalletAddress` is Payroll; `swapReceiverAddress`
 * is the person being paid. Getting those two the wrong way round produces a route that
 * builds, sends, and pays the wrong address.
 */
import {STABLE} from "@/lib/chain";
import {rememberReason} from "@/lib/db";
import {swap} from "@/lib/okx";
import {held, ok, type Outcome} from "@/lib/outcome";
import {checkLine} from "@/lib/payment";
import {payrollAddress} from "@/lib/receipts";

/** One line of a payment, ready for the wallet to sign. Mirrors Payroll.Line exactly. */
export type BuiltLine = {
  recipient: `0x${string}`;
  stableAmount: string;
  cashAmount: string;
  minOut: string;
  reasonHash: `0x${string}`;
  routerCalldata: `0x${string}`;
};

export type BuiltPayment = {
  line: BuiltLine;
  asset: `0x${string}`;
  /** What the aggregator expects to deliver, before slippage. */
  expectedOut: string;
  /** The floor the contract will enforce. Below this the whole payment reverts. */
  minOut: string;
  priceImpactPercent: string | null;
  hops: string[];
  payroll: `0x${string}`;
  /** The total the payer must have approved to Payroll. */
  totalStable: string;
};

export type PaymentRequest = {
  recipient: string;
  /** Dollars, as typed. */
  usd: number;
  /** Dollars of the total delivered as cash rather than ownership. The split. */
  cashUsd: number;
  asset: string;
  reason: string;
  slippagePercent?: string;
};

export async function buildPayment(req: PaymentRequest): Promise<Outcome<BuiltPayment>> {
  const payroll = payrollAddress();
  if (!payroll.ok) return payroll;

  const split = checkLine(req);
  if (!split.ok) return split;
  const {total, cash, swapAmount} = split.value;

  // The reason text is kept so the receipt can show it; only its hash goes on chain.
  const reasonHash = rememberReason(req.reason);

  // All cash: no route to build, and the contract refuses a floor it cannot deliver.
  if (swapAmount === 0n) {
    return ok({
      line: {
        recipient: req.recipient as `0x${string}`,
        stableAmount: total.toString(),
        cashAmount: cash.toString(),
        minOut: "0",
        reasonHash,
        routerCalldata: "0x",
      },
      asset: req.asset as `0x${string}`,
      expectedOut: "0",
      minOut: "0",
      priceImpactPercent: null,
      hops: [],
      payroll: payroll.value,
      totalStable: total.toString(),
    });
  }

  const route = await swap({
    from: STABLE.address,
    to: req.asset,
    amount: swapAmount.toString(),
    slippagePercent: req.slippagePercent ?? "1",
    userWalletAddress: payroll.value,
    receiver: req.recipient,
  });
  if (!route.ok) return route;

  const first = route.value[0];
  if (!first) return held("The aggregator built no route for this pair.");

  const minOut = BigInt(first.tx.minReceiveAmount ?? "0");
  if (minOut === 0n) {
    return held(
      "The aggregator did not state a minimum it would deliver, so there is nothing for " +
        "the contract to hold it to. A payment is not sent without a floor.",
    );
  }
  if (first.tx.to.toLowerCase() === payroll.value.toLowerCase()) {
    return held("The route points back at Payroll. That is not a route; it is a loop.");
  }

  return ok({
    line: {
      recipient: req.recipient as `0x${string}`,
      stableAmount: total.toString(),
      cashAmount: cash.toString(),
      minOut: minOut.toString(),
      reasonHash,
      routerCalldata: first.tx.data as `0x${string}`,
    },
    asset: req.asset as `0x${string}`,
    expectedOut: first.routerResult.toTokenAmount,
    minOut: minOut.toString(),
    priceImpactPercent: first.routerResult.priceImpactPercent ?? null,
    hops: (first.routerResult.dexRouterList ?? [])
      .map((h) => h.dexProtocol?.dexName)
      .filter((n): n is string => Boolean(n)),
    payroll: payroll.value,
    totalStable: total.toString(),
  });
}
