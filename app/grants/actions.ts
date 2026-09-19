"use server";

/**
 * BUILDING A GRANT, SERVER SIDE.
 *
 * A grant buys its asset ONCE, at open, and holds it. So the route is built here exactly
 * as a payment's is — with one difference that matters: the asset is delivered to the
 * ESCROW, not to the beneficiary. They receive it later, on the schedule, and until then
 * it sits somewhere the payer cannot reach.
 */
import {STABLE} from "@/lib/chain";
import {rememberReason} from "@/lib/db";
import {swap} from "@/lib/okx";
import {held, ok, type Outcome} from "@/lib/outcome";
import {checkAddress, toBase} from "@/lib/payment";
import {escrowAddress} from "@/lib/grants";
import {MAX_DURATION_SECONDS, MAX_TIP_BPS} from "@/lib/grant-terms";

/** Mirrors GrantEscrow.Terms exactly. */
export type BuiltTerms = {
  beneficiary: `0x${string}`;
  asset: `0x${string}`;
  stableAmount: string;
  minOut: string;
  start: string;
  cliff: string;
  duration: string;
  tipBps: number;
  reasonHash: `0x${string}`;
  routerCalldata: `0x${string}`;
};

export type BuiltGrant = {
  terms: BuiltTerms;
  escrow: `0x${string}`;
  expectedUnits: string;
  minUnits: string;
  priceImpactPercent: string | null;
  hops: string[];
};

export type GrantRequest = {
  beneficiary: string;
  asset: string;
  usd: number;
  /** Seconds. */
  cliffSeconds: number;
  durationSeconds: number;
  tipBps: number;
  reason: string;
  slippagePercent?: string;
};

export async function buildGrant(req: GrantRequest): Promise<Outcome<BuiltGrant>> {
  const escrow = escrowAddress();
  if (!escrow.ok) return escrow;

  const beneficiary = checkAddress(req.beneficiary, "someone to grant to");
  if (!beneficiary.ok) return beneficiary;

  const asset = checkAddress(req.asset, "an asset address");
  if (!asset.ok) return asset;
  if (asset.value.toLowerCase() === STABLE.address.toLowerCase()) {
    return held(`${STABLE.symbol} is what a grant is funded with, so it cannot be what it holds.`);
  }

  const amount = toBase(req.usd);
  if (!amount.ok) return amount;
  if (amount.value === 0n) return held("A grant needs an amount.");

  if (req.durationSeconds <= 0) return held("A grant needs a term. Zero is not a schedule.");
  if (req.durationSeconds > MAX_DURATION_SECONDS) {
    return held("A grant cannot run longer than ten years.");
  }
  if (req.cliffSeconds < 0) return held("A cliff cannot be negative.");
  if (req.cliffSeconds > req.durationSeconds) {
    return held("The cliff cannot fall after the grant has fully vested.");
  }
  if (req.tipBps < 0 || req.tipBps > MAX_TIP_BPS) {
    return held(`A keeper's share cannot exceed ${MAX_TIP_BPS / 100}% of each release.`);
  }
  if (req.reason.trim().length === 0) {
    return held("Every grant carries a reason. It is what the receipt is for.");
  }

  const reasonHash = rememberReason(req.reason);

  // The asset is bought now and delivered to the escrow, not to the person.
  const route = await swap({
    from: STABLE.address,
    to: asset.value,
    amount: amount.value.toString(),
    slippagePercent: req.slippagePercent ?? "1",
    userWalletAddress: escrow.value,
    receiver: escrow.value,
  });
  if (!route.ok) return route;

  const first = route.value[0];
  if (!first) return held("The aggregator built no route for this pair.");

  const minOut = BigInt(first.tx.minReceiveAmount ?? "0");
  if (minOut === 0n) {
    return held(
      "The aggregator did not state a minimum it would deliver, so there is nothing for " +
        "the contract to hold it to. A grant is not opened without a floor.",
    );
  }
  if (first.tx.to.toLowerCase() === escrow.value.toLowerCase()) {
    return held("The route points back at the escrow. That is not a route; it is a loop.");
  }

  return ok({
    terms: {
      beneficiary: beneficiary.value,
      asset: asset.value,
      stableAmount: amount.value.toString(),
      minOut: minOut.toString(),
      // Zero means "now", decided by the chain rather than by a clock in a browser.
      start: "0",
      cliff: String(Math.floor(req.cliffSeconds)),
      duration: String(Math.floor(req.durationSeconds)),
      tipBps: Math.floor(req.tipBps),
      reasonHash,
      routerCalldata: first.tx.data as `0x${string}`,
    },
    escrow: escrow.value,
    expectedUnits: first.routerResult.toTokenAmount,
    minUnits: minOut.toString(),
    priceImpactPercent: first.routerResult.priceImpactPercent ?? null,
    hops: (first.routerResult.dexRouterList ?? [])
      .map((h) => h.dexProtocol?.dexName)
      .filter((n): n is string => Boolean(n)),
  });
}
