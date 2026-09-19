/**
 * The asset registry is offered on the form, named in the docs and checked by preflight.
 * These are the invariants that make it safe to have one list rather than several.
 */
import {getAddress, isAddress} from "viem";
import {describe, expect, it} from "vitest";
import {ASSETS, ISSUER_NOTE, assetByAddress, defaultAsset} from "./assets";
import {STABLE} from "./chain";

describe("the asset registry", () => {
  it("holds only real, lowercase-safe addresses", () => {
    for (const a of ASSETS) {
      expect(isAddress(a.address, {strict: false}), `${a.symbol} address`).toBe(true);
      expect(a.address, `${a.symbol} should be stored lowercase`).toBe(a.address.toLowerCase());
    }
  });

  it("never lists the same asset twice, by address or by symbol", () => {
    const addresses = ASSETS.map((a) => a.address.toLowerCase());
    const symbols = ASSETS.map((a) => a.symbol);
    expect(new Set(addresses).size).toBe(ASSETS.length);
    expect(new Set(symbols).size).toBe(ASSETS.length);
  });

  it("never offers the stablecoin as something to be paid in", () => {
    expect(assetByAddress(STABLE.address)).toBeUndefined();
  });

  it("only offers assets that were proved end to end and that OKX lists", () => {
    for (const a of ASSETS) {
      expect(a.provedOnFork, `${a.symbol} must be proved through Payroll first`).toBe(true);
      // An unlisted asset can route, but a judge checking it in OKX's tooling finds
      // nothing — or worse, finds its twin at a different price.
      expect(a.listed, `${a.symbol} must appear in the aggregator's all-tokens`).toBe(true);
    }
  });

  it("states every xStock as eighteen decimals, never the stablecoin's six", () => {
    for (const a of ASSETS) expect(a.decimals, a.symbol).toBe(18);
    expect(STABLE.decimals).toBe(6);
  });

  it("finds an asset however its address is cased", () => {
    const a = ASSETS[0]!;
    expect(assetByAddress(a.address)?.symbol).toBe(a.symbol);
    expect(assetByAddress(getAddress(a.address))?.symbol).toBe(a.symbol);
    expect(assetByAddress(a.address.toUpperCase().replace("0X", "0x"))?.symbol).toBe(a.symbol);
  });

  it("falls back to a listed asset rather than an unknown one from the environment", () => {
    const before = process.env.NEXT_PUBLIC_DEFAULT_ASSET;
    try {
      process.env.NEXT_PUBLIC_DEFAULT_ASSET = "0x000000000000000000000000000000000000dead";
      expect(ASSETS.map((a) => a.address)).toContain(defaultAsset().address);

      process.env.NEXT_PUBLIC_DEFAULT_ASSET = ASSETS[1]!.address;
      expect(defaultAsset().symbol).toBe(ASSETS[1]!.symbol);
    } finally {
      if (before === undefined) delete process.env.NEXT_PUBLIC_DEFAULT_ASSET;
      else process.env.NEXT_PUBLIC_DEFAULT_ASSET = before;
    }
  });

  it("discloses what the issuer can do, without claiming the holder owns shares", () => {
    expect(ISSUER_NOTE).toMatch(/economic exposure/);
    expect(ISSUER_NOTE).toMatch(/no voting rights/);
    // CLAUDE.md section 3.7: never "shareholder" or "equity ownership" as a claim.
    expect(ISSUER_NOTE).not.toMatch(/\bequity ownership\b/);
    expect(ISSUER_NOTE).toMatch(/does not make the holder a shareholder/);
  });
});
