/**
 * The certificate prints a grant's units and price. Both are money figures, so both are held
 * to the contract's own arithmetic: the share offset is read out of GrantEscrow.sol, and the
 * conversion is checked against the round trip the contract promises (a deposit into an
 * empty pool converts back to exactly what was put in).
 */
import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {ASSETS} from "./assets";
import {SHARE_OFFSET, certificateDataFor, stockName, unitPrice, unitsOfShares} from "./certificate-data";
import type {Grant} from "./grants";

const source = readFileSync("contracts/src/GrantEscrow.sol", "utf8");
const SPYX = ASSETS[0]!;

function grant(over: Partial<Grant> = {}): Grant {
  return {
    id: 1,
    payer: "0x00000000000000000000000000000000000000a1",
    beneficiary: "0x00000000000000000000000000000000000000b1",
    asset: SPYX.address,
    assetSymbol: SPYX.symbol,
    assetDecimals: 18,
    shares: 1_303_200_000_000_000_000_000_000n,
    sharesReleased: 0n,
    stableCost: 1_000_000_000n,
    start: 1_790_000_000,
    cliffSeconds: 15_768_000,
    durationSeconds: 63_072_000,
    tipBps: 50,
    isSealed: true,
    revoked: false,
    frozenVestedShares: 0n,
    reasonHash: `0x${"ab".repeat(32)}`,
    reason: null,
    state: "open",
    heldUnits: 1_303_200_000_000_000_000n,
    releasableUnits: 0n,
    ...over,
  };
}

describe("the escrow's share arithmetic", () => {
  it("uses GrantEscrow's own share offset", () => {
    const found = source.match(/uint256 private constant SHARE_OFFSET = (\d+)e(\d+);/);
    expect(found, "SHARE_OFFSET not found in GrantEscrow.sol").not.toBeNull();
    expect(BigInt(found![1]!) * 10n ** BigInt(found![2]!)).toBe(SHARE_OFFSET);
  });

  it("converts a first deposit's shares back to exactly what was put in", () => {
    for (const delivered of [1n, 999n, 1_303_200_000_000_000_000n, 10n ** 24n]) {
      // _open: newShares = delivered × (outstanding + OFFSET) / (poolBefore + 1), empty pool.
      const shares = (delivered * (0n + SHARE_OFFSET)) / (0n + 1n);
      expect(unitsOfShares(shares, {poolShares: shares, escrowBalance: delivered})).toBe(delivered);
    }
  });

  it("rounds down, never up, and gives nothing for no shares", () => {
    expect(unitsOfShares(3n, {poolShares: 0n, escrowBalance: 0n})).toBe(0n);
    expect(unitsOfShares(0n, {poolShares: 10n, escrowBalance: 10n ** 18n})).toBe(0n);
    // 10 shares of a pool of 3 with 7 units: 10 × 8 / 1_000_003 rounds to 0.
    expect(unitsOfShares(10n, {poolShares: 3n, escrowBalance: 7n})).toBe(0n);
  });
});

describe("the price a grant paid", () => {
  it("is what was paid over what it bought, in dollars, rounded down", () => {
    expect(unitPrice(1_000_000_000n, 1_303_200_000_000_000_000n, 18)).toBe("767.34");
    expect(unitPrice(10_000_000_000n, 10n ** 18n, 18)).toBe("10,000.00");
    expect(unitPrice(2_000_000n, 2_600_000_000_000_000n, 18)).toBe("769.23");
    expect(unitPrice(1n, 10n ** 18n, 18)).toBe("0.00");
  });

  it("is unknown when nothing was bought", () => {
    expect(unitPrice(1_000_000n, 0n, 18)).toBeNull();
  });
});

describe("a grant as the certificate prints it", () => {
  it("carries the grant's own terms and flags", () => {
    const d = certificateDataFor(grant({revoked: true, isSealed: false, state: "closed"}), {
      tx: `0x${"12".repeat(32)}`,
      route: ["USD₮0", "USDG", "wSPYx", "SPYx"],
    });
    expect(d).toMatchObject({
      id: 1,
      recipient: "0x00000000000000000000000000000000000000b1",
      grantor: "0x00000000000000000000000000000000000000a1",
      asset: {symbol: "SPYx", name: SPYX.name, address: SPYX.address, decimals: 18},
      stableCost: 1_000_000_000n,
      route: ["USD₮0", "USDG", "wSPYx", "SPYx"],
      start: 1_790_000_000,
      cliffSeconds: 15_768_000,
      durationSeconds: 63_072_000,
      tipBps: 50,
      sealed: false,
      revoked: true,
      closed: true,
      tx: `0x${"12".repeat(32)}`,
    });
  });

  it("prints units from the pool when it was read, else from the opening, else nothing", () => {
    const g = grant();
    const pool = {poolShares: g.shares, escrowBalance: 1_303_200_000_000_000_000n};
    const fromPool = certificateDataFor(g, pool);
    expect(fromPool.units).toBe(1_303_200_000_000_000_000n);
    expect(fromPool.poolShares).toBe(g.shares);

    const fromOpening = certificateDataFor(g, {openedUnits: 1_303_200_000_000_000_000n});
    expect(fromOpening.units).toBe(1_303_200_000_000_000_000n);
    expect(fromOpening.unitPriceUsd).toBe("767.34");

    const unknown = certificateDataFor(g);
    expect(unknown.units).toBeNull();
    expect(unknown.unitPriceUsd).toBeNull();
    expect(unknown.route).toEqual([]);
    expect(unknown.tx).toBeNull();
  });

  it("names a stock the way people say it", () => {
    expect(stockName("S&P 500 xStock")).toBe("S&P 500");
    expect(stockName("NVIDIA xStock")).toBe("NVIDIA");
    expect(stockName("Circle")).toBe("Circle");
  });
});
