/**
 * THE SPLIT ARITHMETIC, in TypeScript this time. CLAUDE.md names it money-critical and
 * Payroll.t.sol already fuzzes the Solidity side; this is the other half, where dollars
 * typed into a form become base units.
 *
 * A wrong conversion here does not revert. It sends a different payment from the one the
 * payer read on screen, and the receipt agrees with the contract rather than with them.
 */
import {describe, expect, it} from "vitest";
import {STABLE} from "./chain";
import {MAX_USD, checkAddress, checkLine, runTotal, toBase} from "./payment";

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
