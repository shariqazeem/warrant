/**
 * WHAT AN EVENT CLAIMS, CHECKED AGAINST WHAT ITS TRANSACTION MOVED.
 *
 * `Paid` and `GrantOpened` are emitted by our contracts, but their fields are only as honest
 * as the call that produced them. Two things in a call are the caller's to choose and are not
 * checked by the contracts: the asset (any token address) and the route (any calldata for the
 * OKX router). So anyone, for the price of gas, can make the Payroll contract emit a `Paid`
 * that says a million dollars became a stock — with a token they wrote that reports whatever
 * balance they like, or with a route that spends nothing and hands the whole amount back.
 * Measured against the deployed contract on 23 Sep: the call succeeds and the payer's USDT
 * is untouched.
 *
 * Nothing is lost when that happens; the danger is a public page printing it as a payment.
 * So before an event becomes a row, or a receipt, two things must be true of it:
 *
 *   1. its asset is one of the stocks Warrant lists, whose balances the issuer's own
 *      contract reports; and
 *   2. the payer's USDT really went: what the payer sent the contract, less what the
 *      contract sent back, covers what the events say was paid — within the dust an honest
 *      route hands back.
 *
 * Pure on purpose: the indexer and the receipt page both call it, and the tests read it.
 */
import {decodeEventLog, parseAbiItem} from "viem";
import {ASSETS} from "./assets";
import {held, ok, type Outcome} from "./outcome";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

/** One stablecoin transfer inside a transaction, addresses lower-cased. */
export type Movement = {from: string; to: string; value: bigint};

/** What one event says the payer paid. `cash` is the part delivered as USDT. */
export type Claim = {payer: string; recipient: string; asset: string; stable: bigint; cash: bigint};

/**
 * How far below the amount on its lines an honest transaction may fall: the dust a route
 * leaves unspent, which the contract hands back. In practice it is zero or a few units of
 * USDT; a route that spends nothing falls short by all of it.
 */
export const DUST_TOLERANCE_BPS = 100n;

type RawLog = {address: string; topics: readonly `0x${string}`[]; data: `0x${string}`};

/** The stablecoin's Transfer logs from a transaction receipt. Everything else is ignored. */
export function stableMovements(logs: readonly RawLog[], stable: string): Movement[] {
  const out: Movement[] = [];
  for (const log of logs) {
    if (log.address.toLowerCase() !== stable.toLowerCase()) continue;
    try {
      const d = decodeEventLog({abi: [TRANSFER], topics: [...log.topics] as [`0x${string}`, ...`0x${string}`[]], data: log.data});
      out.push({from: d.args.from.toLowerCase(), to: d.args.to.toLowerCase(), value: d.args.value});
    } catch {
      // Approval, or anything else the token emits: not a movement.
    }
  }
  return out;
}

const LISTED = new Set(ASSETS.map((a) => a.address.toLowerCase()));

/**
 * Whether every claim in one transaction is backed by what the transaction did. `contract`
 * is the one that emitted the claims (Payroll or GrantEscrow).
 */
export function confirmClaims(claims: readonly Claim[], moves: readonly Movement[], contract: string): Outcome<true> {
  const self = contract.toLowerCase();

  for (const c of claims) {
    if (!LISTED.has(c.asset.toLowerCase())) {
      return held(
        "This transaction names a token that is not one of the stocks Warrant lists, so it " +
          "is not shown as a payment.",
      );
    }
  }

  const declared = new Map<string, bigint>();
  for (const c of claims) {
    const p = c.payer.toLowerCase();
    declared.set(p, (declared.get(p) ?? 0n) + c.stable);
  }

  for (const [payer, owed] of declared) {
    let went = 0n;
    for (const m of moves) {
      if (m.from === payer && m.to === self) went += m.value;
      if (m.from === self && m.to === payer) went -= m.value;
    }
    // Cash a payer sent to themselves comes back the same way dust does. It was paid.
    for (const c of claims) {
      if (c.payer.toLowerCase() === payer && c.recipient.toLowerCase() === payer) went += c.cash;
    }
    if (went * 10_000n < owed * (10_000n - DUST_TOLERANCE_BPS)) {
      return held(
        "This transaction says more USDT was paid than actually left the payer's wallet, so " +
          "it is not shown as a payment.",
      );
    }
  }

  return ok(true);
}
