"use server";

/**
 * BUILDING A GRANT, SERVER SIDE.
 *
 * A grant buys its asset ONCE, at open, and holds it. So the route is built here exactly
 * as a payment's is — with one difference that matters: the asset is delivered to the
 * ESCROW, not to the beneficiary. They receive it later, on the schedule, and until then
 * it sits somewhere the payer cannot reach.
 *
 * The aggregator's answer is checked exactly as a payment's is (see app/pay/actions.ts),
 * against the router GrantEscrow calls.
 *
 * THE PERSON'S CHOICE IS READ HERE. Someone who has signed a choice has said which stock they
 * want; the form preselects it, and this says whose decision the stock on these terms is —
 * theirs, when the grant is in the stock they chose, or the company's, when it picked
 * another. The stock is never swapped behind the form's back: the terms carry exactly the
 * stock the form showed.
 *
 * Relative imports, so the tests can load this file without the app's alias.
 */
import {createPublicClient, getAddress, http, parseEventLogs, zeroHash} from "viem";
import {assetByAddress} from "../../lib/assets";
import {STABLE, xLayer} from "../../lib/chain";
import {rememberReason, rememberRoute as keepRoute} from "../../lib/db";
import {escrowAddress} from "../../lib/grants";
import {
  STABLE_NAME,
  checkRoute as checkRouteNames,
  checkSchedule,
  checkStart,
  checkTip,
  grantDecision,
  routeTokens,
} from "../../lib/grant-terms";
import {routerOf, swap} from "../../lib/okx";
import {held, ok, type Outcome} from "../../lib/outcome";
import {
  checkAddress,
  checkListedAsset,
  checkPriceImpact,
  checkRoute,
  readPriceImpact,
  toBase,
} from "../../lib/payment";
import {grantEscrowAbi} from "../../lib/payroll-abi";
import {choiceFor} from "../../lib/person";
import {MAX_REASON_LENGTH} from "../../lib/reason";

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

/** The stock a person signed for, as the form says it beside their address. */
export type GrantChoice = {
  /** The stock they chose, or null when they chose to be paid all in dollars. */
  asset: `0x${string}` | null;
  symbol: string | null;
  issuedAt: number;
};

export type BuiltGrant = {
  /** What the wallet signs. Null for a price only, asked before a recipient is entered:
   *  the route does not depend on who receives the grant, so the form can show it early. */
  terms: BuiltTerms | null;
  escrow: `0x${string}`;
  /** What the aggregator expects the escrow to receive, before slippage. */
  expectedUnits: string;
  /** The floor the contract enforces (`BelowMinimum`): the aggregator's own minReceiveAmount. */
  minUnits: string;
  /** How far buying the grant moves the price, as the aggregator reported it, in percent.
   *  Null when it did not say — never a zero for unknown. */
  priceImpactPercent: number | null;
  /** The venues, as the aggregator named them. */
  hops: string[];
  /** The route as tokens, USD₮0 first and the stock last: what a certificate prints. */
  route: string[];
  /** Whose decision the stock is: the stock the person chose, or the company's. */
  decidedBy: "their-choice" | "company";
  /** The person's signed choice, when there is one. */
  choice: GrantChoice | null;
};

export type GrantRequest = {
  /** Their address. Empty for a price only. */
  beneficiary: string;
  asset: string;
  usd: number;
  /** Seconds. */
  cliffSeconds: number;
  durationSeconds: number;
  tipBps: number;
  /** Unix seconds; 0 or absent means when the grant lands, decided by the chain. */
  start?: number;
  /** An optional note for the grant's record. Only its hash goes on chain. */
  reason?: string;
  slippagePercent?: string;
};

function choiceOf(person: string): GrantChoice | null {
  const c = choiceFor(person);
  if (!c) return null;
  const listed = c.stockBps > 0 ? assetByAddress(c.asset) : undefined;
  return {
    asset: listed ? listed.address : null,
    symbol: listed ? listed.symbol : null,
    issuedAt: c.issuedAt,
  };
}

export async function buildGrant(req: GrantRequest): Promise<Outcome<BuiltGrant>> {
  const escrow = escrowAddress();
  if (!escrow.ok) return escrow;

  let beneficiary: `0x${string}` | null = null;
  if (req.beneficiary.trim() !== "") {
    const checked = checkAddress(req.beneficiary.trim(), "their wallet address");
    if (!checked.ok) return checked;
    beneficiary = getAddress(checked.value);
    if (beneficiary.toLowerCase() === escrow.value.toLowerCase()) {
      return held("That is the escrow's own address. A grant goes to a person's wallet.");
    }
  }

  const asset = checkAddress(req.asset, "an asset address");
  if (!asset.ok) return asset;
  if (asset.value.toLowerCase() === STABLE.address.toLowerCase()) {
    return held(`${STABLE_NAME} is what a grant is paid with, so it cannot be what it holds.`);
  }
  const listed = checkListedAsset(asset.value);
  if (!listed.ok) return listed;

  const amount = toBase(req.usd);
  if (!amount.ok) return amount;
  if (amount.value === 0n) return held("Enter a grant value.");

  const schedule = checkSchedule(req.durationSeconds, req.cliffSeconds);
  if (!schedule.ok) return schedule;
  const tip = checkTip(req.tipBps);
  if (!tip.ok) return tip;
  const start = checkStart(req.start ?? 0, Math.floor(Date.now() / 1000));
  if (!start.ok) return start;

  const reason = req.reason?.trim() ?? "";
  if (reason.length > MAX_REASON_LENGTH) {
    return held(`A note can be at most ${MAX_REASON_LENGTH} characters.`);
  }

  // Whose decision the stock is. Read from what they signed, here, on the server.
  const choice = beneficiary ? choiceOf(beneficiary) : null;
  const decidedBy = grantDecision(choice, listed.value.address);

  const router = await routerOf(escrow.value);
  if (!router.ok) return router;

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
  if (!first) return held("OKX DEX built no route for this stock just now. Try again in a moment.");

  // A route aimed anywhere but the escrow's router is refused here — a loop back into
  // the escrow included.
  const answer = checkRoute(first, {
    router: router.value,
    from: STABLE.address,
    to: asset.value,
    amount: amount.value,
  });
  if (!answer.ok) return answer;

  const impact = checkPriceImpact(
    readPriceImpact(first.routerResult.priceImpactPercent),
    listed.value.symbol,
  );
  if (!impact.ok) return impact;

  const minOut = BigInt(first.tx.minReceiveAmount ?? "0");
  if (minOut === 0n) {
    return held(
      "OKX DEX did not state a minimum it would deliver, so there is nothing for the " +
        "contract to hold it to. A grant is not issued without a floor.",
    );
  }

  // Only once everything else stands, so a refused grant leaves nothing behind.
  const reasonHash = reason === "" ? zeroHash : rememberReason(reason);

  const dexes = first.routerResult.dexRouterList ?? [];
  return ok({
    terms: beneficiary
      ? {
          beneficiary,
          asset: listed.value.address,
          stableAmount: amount.value.toString(),
          minOut: minOut.toString(),
          // Zero means "now", decided by the chain rather than by a clock in a browser.
          start: String(start.value),
          cliff: String(req.cliffSeconds),
          duration: String(req.durationSeconds),
          tipBps: tip.value,
          reasonHash,
          routerCalldata: first.tx.data as `0x${string}`,
        }
      : null,
    escrow: escrow.value,
    expectedUnits: first.routerResult.toTokenAmount,
    minUnits: minOut.toString(),
    priceImpactPercent: impact.value,
    hops: dexes.map((h) => h.dexProtocol?.dexName).filter((n): n is string => Boolean(n)),
    route: routeTokens(
      dexes,
      {address: STABLE.address, symbol: STABLE_NAME},
      {address: listed.value.address, symbol: listed.value.symbol},
    ),
    decidedBy,
    choice,
  });
}

/** How many times a just-mined transaction is looked for before the answer is "not yet". */
const RECEIPT_TRIES = 3;
const RECEIPT_GAP_MS = 1_000;

/**
 * The grant a transaction opened in this escrow, read from its receipt: its id and stock.
 * A node behind the one the wallet used may not have the transaction yet, so it is asked a
 * few times before the answer is "not yet".
 */
async function openedIn(
  txHash: `0x${string}`,
  escrow: `0x${string}`,
): Promise<Outcome<{id: bigint; asset: `0x${string}`}>> {
  const rpc = createPublicClient({chain: xLayer, transport: http()});
  for (let attempt = 1; ; attempt++) {
    try {
      const receipt = await rpc.getTransactionReceipt({hash: txHash});
      if (receipt.status !== "success") return held("That transaction reverted, so it opened no grant.");
      const opened = parseEventLogs({abi: grantEscrowAbi, eventName: "GrantOpened", logs: receipt.logs}).find(
        (l) => l.address.toLowerCase() === escrow.toLowerCase(),
      );
      if (!opened) return held("That transaction did not open a grant in Warrant's escrow.");
      return ok({id: opened.args.id, asset: opened.args.asset});
    } catch {
      if (attempt >= RECEIPT_TRIES) {
        return held("X Layer has not shown that transaction yet, so its route was not kept. Try again shortly.");
      }
      await new Promise((r) => setTimeout(r, RECEIPT_GAP_MS));
    }
  }
}

/**
 * KEEP THE ROUTE A GRANT WAS BOUGHT THROUGH, for its certificate. Called by the issue form
 * once the grant's transaction has confirmed, with the route of the quote it was issued on.
 *
 * Anyone can call a server action, so nothing is taken on trust: the hash must be a
 * transaction that opened a grant in this escrow, the route must be 2 to 12 printable
 * names that start with USD₮0 and end with the stock that grant holds, and the first route
 * kept for a transaction stands.
 */
export async function rememberRoute(txHash: string, hops: string[]): Promise<Outcome<{kept: boolean}>> {
  if (typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return held("That is not a transaction hash.");
  }
  const route = checkRouteNames(hops);
  if (!route.ok) return route;
  if (route.value[0] !== STABLE_NAME) return held(`A grant's route starts with ${STABLE_NAME}.`);

  const escrow = escrowAddress();
  if (!escrow.ok) return escrow;

  const opened = await openedIn(txHash as `0x${string}`, escrow.value);
  if (!opened.ok) return opened;
  const stock = assetByAddress(opened.value.asset);
  if (!stock || route.value[route.value.length - 1] !== stock.symbol) {
    return held("That route does not end in the stock the grant holds, so it was not kept.");
  }

  return ok({kept: keepRoute(txHash, route.value)});
}
