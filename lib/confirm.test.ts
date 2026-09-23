import {describe, expect, it} from "vitest";
import {encodeAbiParameters, encodeEventTopics, parseAbiItem} from "viem";
import {ASSETS} from "./assets";
import {confirmClaims, stableMovements, type Claim, type Movement} from "./confirm";

const PAYROLL = "0xbe70cb6941e9943ad00968858388c580e0dbb5cd";
const PAYER = "0x00000000000000000000000000000000000000a1";
const OTHER = "0x00000000000000000000000000000000000000b2";
const ROUTER = "0x00000000000000000000000000000000000000c3";
const SPYX = ASSETS[0]!.address.toLowerCase();
const USD = (n: number) => BigInt(Math.round(n * 1e6));

const claim = (over: Partial<Claim> = {}): Claim => ({
  payer: PAYER,
  recipient: OTHER,
  asset: SPYX,
  stable: USD(25),
  cash: 0n,
  ...over,
});
const move = (from: string, to: string, value: bigint): Movement => ({from, to, value});

describe("confirmClaims", () => {
  it("accepts an honest payment: the payer's USDT went and the route spent it", () => {
    const moves = [move(PAYER, PAYROLL, USD(25)), move(PAYROLL, ROUTER, USD(25))];
    expect(confirmClaims([claim()], moves, PAYROLL).ok).toBe(true);
  });

  it("accepts the dust an honest route hands back", () => {
    const moves = [move(PAYER, PAYROLL, USD(25)), move(PAYROLL, PAYER, 3n)];
    expect(confirmClaims([claim()], moves, PAYROLL).ok).toBe(true);
  });

  it("refuses a route that spent nothing and handed the whole amount back", () => {
    // What was measured against the deployed contract: the event says 1,000,000 USDT, the
    // payer's balance never moved.
    const big = USD(1_000_000);
    const moves = [move(PAYER, PAYROLL, big), move(PAYROLL, PAYER, big)];
    const r = confirmClaims([claim({stable: big})], moves, PAYROLL);
    expect(r.ok).toBe(false);
  });

  it("refuses a route that spent a sliver of the amount on its line", () => {
    const moves = [move(PAYER, PAYROLL, USD(1000)), move(PAYROLL, PAYER, USD(990))];
    expect(confirmClaims([claim({stable: USD(1000)})], moves, PAYROLL).ok).toBe(false);
  });

  it("accepts a payment made all in dollars, which names no stock", () => {
    const zero = "0x0000000000000000000000000000000000000000";
    const moves = [move(PAYER, PAYROLL, USD(25)), move(PAYROLL, OTHER, USD(25))];
    expect(confirmClaims([claim({asset: zero, cash: USD(25)})], moves, PAYROLL).ok).toBe(true);
  });

  it("refuses a line that names no stock but did not pay all in dollars", () => {
    const zero = "0x0000000000000000000000000000000000000000";
    const moves = [move(PAYER, PAYROLL, USD(25))];
    expect(confirmClaims([claim({asset: zero, cash: USD(5)})], moves, PAYROLL).ok).toBe(false);
  });

  it("refuses a token Warrant does not list, whatever it reports", () => {
    const fake = "0x00000000000000000000000000000000000000f4";
    const moves = [move(PAYER, PAYROLL, USD(25))];
    expect(confirmClaims([claim({asset: fake})], moves, PAYROLL).ok).toBe(false);
  });

  it("refuses when USDT went somewhere other than this contract", () => {
    const moves = [move(PAYER, OTHER, USD(25))];
    expect(confirmClaims([claim()], moves, PAYROLL).ok).toBe(false);
  });

  it("counts cash a payer sent to themselves as paid, not as a refund", () => {
    const c = claim({recipient: PAYER, stable: USD(10), cash: USD(4)});
    const moves = [move(PAYER, PAYROLL, USD(10)), move(PAYROLL, PAYER, USD(4))];
    expect(confirmClaims([c], moves, PAYROLL).ok).toBe(true);
  });

  it("checks a run as one total: every line's USDT, from one pull", () => {
    const lines = [claim({stable: USD(25)}), claim({stable: USD(40), recipient: ROUTER})];
    expect(confirmClaims(lines, [move(PAYER, PAYROLL, USD(65))], PAYROLL).ok).toBe(true);
    expect(confirmClaims(lines, [move(PAYER, PAYROLL, USD(25))], PAYROLL).ok).toBe(false);
  });
});

describe("stableMovements", () => {
  const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
  const APPROVAL = parseAbiItem("event Approval(address indexed owner, address indexed spender, uint256 value)");
  const USDT = "0x1E4a5963aBFD975d8c9021ce480b42188849D41d";

  const log = (address: string, event: typeof TRANSFER | typeof APPROVAL, a: string, b: string, v: bigint) => ({
    address,
    topics: encodeEventTopics({
      abi: [event],
      args: event.name === "Transfer" ? {from: a, to: b} : {owner: a, spender: b},
    } as never) as `0x${string}`[],
    data: encodeAbiParameters([{type: "uint256"}], [v]),
  });

  it("reads only the stablecoin's transfers, lower-cased", () => {
    const logs = [
      log(USDT, TRANSFER, PAYER, PAYROLL, 7n),
      log(USDT, APPROVAL, PAYROLL, ROUTER, 7n),
      log(SPYX, TRANSFER, PAYROLL, OTHER, 9n),
    ];
    expect(stableMovements(logs, USDT)).toEqual([{from: PAYER, to: PAYROLL, value: 7n}]);
  });
});
