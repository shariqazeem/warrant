/**
 * THE SPLIT ARITHMETIC, in TypeScript this time. CLAUDE.md names it money-critical and
 * Payroll.t.sol already fuzzes the Solidity side; this is the other half, where dollars
 * typed into a form become base units.
 *
 * A wrong conversion here does not revert. It sends a different payment from the one the
 * payer read on screen, and the receipt agrees with the contract rather than with them.
 */
import {describe, expect, it} from "vitest";
import {ASSETS} from "./assets";
import {STABLE} from "./chain";
import {
  MAX_PRICE_IMPACT_PERCENT,
  MAX_USD,
  checkAddress,
  checkLine,
  checkListedAsset,
  checkPriceImpact,
  checkRoute,
  impactText,
  readPriceImpact,
  runTotal,
  toBase,
  worstPriceImpact,
  type RouteAnswer,
} from "./payment";
import {MAX_REASON_LENGTH} from "./reason";

const OK_LINE = {
  recipient: "0x00000000000000000000000000000000000ca511",
  usd: 25,
  cashUsd: 0,
  asset: "0xa8ddb5cd96b5222afe198316e9a57caa642850d5",
  reason: "Design review, week 38",
};

const unwrap = <T>(o: {ok: true; value: T} | {ok: false; why: string}): T => {
  if (!o.ok) throw new Error(`expected ok, got: ${o.why}`);
  return o.value;
};

describe("dollars to USDT base units", () => {
  it("uses six decimals, not eighteen", () => {
    expect(unwrap(toBase(1))).toBe(1_000_000n);
    expect(unwrap(toBase(25))).toBe(25_000_000n);
    expect(STABLE.decimals).toBe(6);
  });

  it("rounds rather than truncating, so a run does not lose a cent a line", () => {
    // 0.1 * 1e6 is 100000.00000000001 in binary floating point.
    expect(unwrap(toBase(0.1))).toBe(100_000n);
    expect(unwrap(toBase(3.33))).toBe(3_330_000n);
    expect(unwrap(toBase(0.0000005))).toBe(1n); // rounds up, not away
    expect(unwrap(toBase(0.0000004))).toBe(0n);
  });

  it("refuses an amount it cannot represent exactly rather than rounding it", () => {
    const tooBig = toBase(MAX_USD + 1);
    expect(tooBig.ok).toBe(false);
    expect(unwrap(toBase(MAX_USD))).toBe(BigInt(MAX_USD) * 1_000_000n);
  });

  it("refuses nonsense", () => {
    expect(toBase(Number.NaN).ok).toBe(false);
    expect(toBase(Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(toBase(-1).ok).toBe(false);
  });
});

describe("an address", () => {
  it("accepts a correctly checksummed one", () => {
    expect(checkAddress("0x1E4a5963aBFD975d8c9021ce480b42188849D41d", "an address").ok).toBe(true);
  });

  it("accepts an all-lowercase one", () => {
    expect(checkAddress("0x1e4a5963abfd975d8c9021ce480b42188849d41d", "an address").ok).toBe(true);
  });

  it("refuses a bad checksum and names it", () => {
    const o = checkAddress("0x1e4A5963abfd975d8c9021ce480b42188849d41d", "an address");
    expect(o.ok).toBe(false);
    expect(o.ok === false && o.why).toMatch(/checksum/);
  });
});

describe("the split", () => {
  it("routes the whole line when there is no cash part", () => {
    const s = unwrap(checkLine(OK_LINE));
    expect(s.total).toBe(25_000_000n);
    expect(s.cash).toBe(0n);
    expect(s.swapAmount).toBe(25_000_000n);
  });

  it("splits cash and ownership so the two always sum to the line", () => {
    const s = unwrap(checkLine({...OK_LINE, usd: 100, cashUsd: 40}));
    expect(s.cash).toBe(40_000_000n);
    expect(s.swapAmount).toBe(60_000_000n);
    expect(s.cash + s.swapAmount).toBe(s.total);
  });

  it("allows a line that is all cash, which builds no route at all", () => {
    const s = unwrap(checkLine({...OK_LINE, usd: 50, cashUsd: 50}));
    expect(s.swapAmount).toBe(0n);
    expect(s.cash).toBe(s.total);
  });

  it("refuses a cash part larger than the payment", () => {
    const o = checkLine({...OK_LINE, usd: 25, cashUsd: 26});
    expect(o.ok).toBe(false);
    expect(o.ok === false && o.why).toMatch(/cannot be more than the payment/);
  });

  it("refuses a payment with no amount", () => {
    expect(checkLine({...OK_LINE, usd: 0}).ok).toBe(false);
  });

  it("refuses a payment with no reason, because the reason is the point", () => {
    const o = checkLine({...OK_LINE, reason: "   "});
    expect(o.ok).toBe(false);
    expect(o.ok === false && o.why).toMatch(/carries a reason/);
  });

  it("refuses to buy the stablecoin with itself", () => {
    const o = checkLine({...OK_LINE, asset: STABLE.address});
    expect(o.ok).toBe(false);
    expect(o.ok === false && o.why).toMatch(/cannot also be what it buys/);
  });

  it("refuses an address that is not one, and says which rule it broke", () => {
    const short = checkLine({...OK_LINE, recipient: "0xnope"});
    expect(short.ok).toBe(false);
    expect(short.ok === false && short.why).toMatch(/40 hex characters/);

    expect(checkLine({...OK_LINE, recipient: ""}).ok).toBe(false);
  });

  it("accepts an all-lowercase address, which EIP-55 says is valid", () => {
    const o = checkLine({...OK_LINE, recipient: "0x1e4a5963abfd975d8c9021ce480b42188849d41d",
      asset: "0xa8ddb5cd96b5222afe198316e9a57caa642850d5"});
    expect(o.ok).toBe(true);
  });

  it("refuses a mistyped mixed-case address rather than paying it, and offers the fix", () => {
    // Right length, right characters, wrong capitalisation: EIP-55's whole purpose.
    const o = checkLine({...OK_LINE, recipient: "0xA8ddb5cd96b5222afe198316e9a57caa642850d5"});
    expect(o.ok).toBe(false);
    expect(o.ok === false && o.why).toMatch(/checksum/);
    expect(o.ok === false && o.why).toMatch(/Did you mean 0x/);
  });

  it("sums a run exactly, with no float in the middle", () => {
    const lines = [0.1, 0.2, 0.3, 3.33, 25].map((usd) =>
      unwrap(checkLine({...OK_LINE, usd, cashUsd: 0})),
    );
    // 0.1 + 0.2 + 0.3 is famously not 0.6 in floating point. In base units it is exact.
    expect(runTotal(lines)).toBe(100_000n + 200_000n + 300_000n + 3_330_000n + 25_000_000n);
    expect(runTotal(lines)).toBe(28_930_000n);
  });
});

describe("a reason", () => {
  it("is bounded, because the form that posts it is a public endpoint", () => {
    const tooLong = "x".repeat(MAX_REASON_LENGTH + 1);
    const o = checkLine({...OK_LINE, reason: tooLong});
    expect(o.ok).toBe(false);
    expect(o.ok === false && o.why).toMatch(/cannot be longer/);

    expect(checkLine({...OK_LINE, reason: "x".repeat(MAX_REASON_LENGTH)}).ok).toBe(true);
  });
});

describe("the asset", () => {
  it("is one Warrant lists, whatever the capitalisation", () => {
    for (const a of ASSETS) {
      expect(unwrap(checkListedAsset(a.address.toUpperCase().replace("0X", "0x"))).symbol).toBe(a.symbol);
    }
  });

  it("refuses anything else, naming what it does pay in", () => {
    // wNVDAx routes and settles, but the record does not list it, so it would print nothing.
    const o = checkListedAsset("0xa8ddb5cd96b5222afe198316e9a57caa642850d5");
    expect(o.ok).toBe(false);
    expect(o.ok === false && o.why).toMatch(/not one of the \d+ stocks Warrant lists/);
  });
});

describe("price impact", () => {
  it("reads the aggregator's figure as a size, whichever way it moved", () => {
    expect(readPriceImpact("-0.08")).toBe(0.08);
    expect(readPriceImpact("0.08")).toBe(0.08);
    expect(readPriceImpact("0")).toBe(0);
    expect(readPriceImpact(" 4.2 ")).toBe(4.2);
  });

  it("is unknown, never zero, when the aggregator did not say", () => {
    for (const raw of [undefined, null, "", "  ", "n/a", "1e2", "0x10", "--1"]) {
      expect(readPriceImpact(raw), JSON.stringify(raw)).toBeNull();
    }
  });

  it("says a small figure as a person would", () => {
    expect(impactText(0.08)).toBe("0.08%");
    expect(impactText(4.2)).toBe("4.2%");
    expect(impactText(0.004)).toBe("under 0.01%");
    expect(impactText(0)).toBe("0%");
    expect(impactText(12)).toBe("12%");
  });

  it("refuses a line that would move the price more than the limit, in words", () => {
    expect(MAX_PRICE_IMPACT_PERCENT).toBe(3);
    const o = checkPriceImpact(4.2, "SPYx");
    expect(o.ok).toBe(false);
    expect(o.ok === false && o.why).toBe(
      "The market for SPYx on X Layer is too thin for this amount right now — the price " +
        "would move 4.2%. Try a smaller amount.",
    );
  });

  it("lets through a line at the limit, and never refuses one it cannot measure", () => {
    expect(unwrap(checkPriceImpact(3, "SPYx"))).toBe(3);
    // 3.004 is shown as 3%, so refusing it would name a figure inside the limit.
    expect(unwrap(checkPriceImpact(3.004, "SPYx"))).toBe(3.004);
    expect(checkPriceImpact(3.01, "SPYx").ok).toBe(false);
    expect(unwrap(checkPriceImpact(null, "SPYx"))).toBeNull();
  });

  it("gives a run its worst line, or nothing if any line did not say", () => {
    expect(worstPriceImpact([0.08, 0.5, 0.2])).toBe(0.5);
    expect(worstPriceImpact([0])).toBe(0);
    expect(worstPriceImpact([0.08, null, 0.2])).toBeNull();
    expect(worstPriceImpact([])).toBeNull();
  });
});

describe("the aggregator's answer", () => {
  const ROUTER = "0x8b773d83bc66be128c60e07e17c8901f7a64f000";
  const SPYX = ASSETS[0]!.address;
  const ask = {router: ROUTER, from: STABLE.address, to: SPYX, amount: 25_000_000n};

  /** What the aggregator returns for exactly `ask`, in the V6 shape. */
  const answer = (over: {
    to?: string;
    value?: string;
    from?: string;
    toToken?: string;
    amount?: string;
  } = {}): RouteAnswer => ({
    routerResult: {
      fromTokenAmount: over.amount ?? "25000000",
      fromToken: {tokenContractAddress: over.from ?? STABLE.address.toLowerCase()},
      toToken: {tokenContractAddress: over.toToken ?? SPYX},
    },
    tx: {to: over.to ?? ROUTER.toUpperCase().replace("0X", "0x"), value: over.value ?? "0"},
  });

  const why = (o: {ok: boolean; why?: string}) => (o.ok ? "" : (o.why ?? ""));

  it("passes an answer that matches what was asked, whatever the capitalisation", () => {
    expect(checkRoute(answer(), ask).ok).toBe(true);
    expect(checkRoute(answer({value: ""}), ask).ok).toBe(true);
    expect(checkRoute(answer({value: "0x0"}), ask).ok).toBe(true);
  });

  it("refuses a route through any contract but the router the contract calls", () => {
    // Payroll itself, say: a loop rather than a route.
    const o = checkRoute(answer({to: "0x00000000000000000000000000000000000ca511"}), ask);
    expect(why(o)).toMatch(/through a contract Warrant does not pay through/);
    expect(why(o)).toMatch(/Nothing was sent\.$/);
  });

  it("refuses a route that spends a different amount than the line", () => {
    for (const amount of ["24999999", "25000001", "0", "", "25000000.5", "2.5e7"]) {
      expect(why(checkRoute(answer({amount}), ask)), amount).toMatch(/different amount/);
    }
  });

  it("refuses a route that buys a different stock", () => {
    const o = checkRoute(answer({toToken: ASSETS[1]!.address}), ask);
    expect(why(o)).toMatch(/different stock than the one chosen/);
  });

  it("refuses a route that spends something other than USDT", () => {
    const o = checkRoute(answer({from: ASSETS[2]!.address}), ask);
    expect(why(o)).toMatch(/spends something other than USDT/);
  });

  it("refuses a route that wants OKB sent with it, which Payroll never sends", () => {
    for (const value of ["1", "0x1", "lots"]) {
      expect(why(checkRoute(answer({value}), ask)), value).toMatch(/needs OKB/);
    }
  });

  it("refuses an answer that leaves out which tokens it trades", () => {
    const bare: RouteAnswer = {routerResult: {fromTokenAmount: "25000000"}, tx: {to: ROUTER}};
    expect(checkRoute(bare, ask).ok).toBe(false);
  });
});
