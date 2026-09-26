/**
 * The formatters render money, so a wrong one is a wrong number on a receipt with a real
 * transaction under it. The fixtures below are the ACTUAL figures from the fork proof in
 * scripts/prove-route-fork.ts, so if the decimals ever drift these fail with the same
 * numbers a reader would see on the page.
 */
import {describe, expect, it} from "vitest";
import {lengthWords, runLabel, settledUnitPrice, short, unitPlaces, unitsFromRaw, usdt} from "./format";

/** $5 USDT in, 0.022463978563372243 wNVDAx out. Real, from a fork of X Layer. */
const PAID = 5_000_000n;
const ARRIVED = 22_463_978_563_372_243n;

describe("money, at X Layer's decimals", () => {
  it("reads USDT at six decimals, not eighteen", () => {
    expect(usdt(PAID)).toBe("$5");
    expect(usdt(1_234_560_000n)).toBe("$1,234.56");
    expect(usdt(250_000n)).toBe("$0.25");
  });

  it("never renders a payment that happened as $0", () => {
    // One base unit of USDT is $0.000001. Rounded to cents it is "$0", which on a stub
    // under a real transaction reads as "nothing was paid".
    expect(usdt(1n)).toBe("$0.000001");
    expect(usdt(9_999n)).toBe("$0.009999");
    expect(usdt(10_000n)).toBe("$0.01");
    expect(usdt(0n)).toBe("$0");
  });

  it("reads an xStock at eighteen, rounded down to four significant figures", () => {
    // 0.022463978…: rounding printed 0.0225, a figure the chain does not agree with.
    expect(unitsFromRaw(ARRIVED, 18)).toBe("0.02246");
    expect(unitsFromRaw(ARRIVED, 18, 8)).toBe("0.02246397");
  });

  it("prints a holding the one way everywhere: down, never up", () => {
    // Grant No. 000004 on X Layer: 0.0038873479… SPYx. Its certificate said 0.0038 and the
    // public record said 0.0039, on the same page.
    const GRANT_4 = 3_887_347_900_000_000n;
    expect(unitsFromRaw(GRANT_4, 18)).toBe("0.003887");
    expect(unitsFromRaw(999_999_999_999_999_999n, 18)).toBe("0.9999");
    expect(unitsFromRaw(1_234_567_800_000_000_000_000n, 18)).toBe("1,234.5678");
  });

  it("widens small holdings to four significant figures, and stops at eight places", () => {
    expect(unitPlaces(650_000_000_000_000_000n, 18)).toBe(4); // 0.65
    expect(unitPlaces(65_000_000_000_000_000n, 18)).toBe(5); // 0.065
    expect(unitPlaces(3_887_347_900_000_000n, 18)).toBe(6); // 0.0038
    expect(unitPlaces(1n, 18)).toBe(8); // dust
    expect(unitPlaces(0n, 18)).toBe(4);
    expect(unitsFromRaw(0n, 18)).toBe("0.0000");
  });

  it("prices a settled payment from what was paid and what arrived", () => {
    const price = settledUnitPrice(PAID, ARRIVED, 18);
    expect(price).not.toBeNull();
    expect(price!).toBeCloseTo(222.58, 2);
  });

  it("refuses to price a payment that delivered nothing", () => {
    expect(settledUnitPrice(PAID, 0n, 18)).toBeNull();
  });
});

describe("a run id", () => {
  const pad = (s: string) => `0x${Buffer.from(s).toString("hex").padEnd(64, "0")}`;

  it("reads back the name a person gave it", () => {
    expect(runLabel(pad("fork-proof"))).toBe("fork-proof");
    expect(runLabel(pad("run-2026-09-19"))).toBe("run-2026-09-19");
  });

  it("falls back to short hex when it was never a name", () => {
    const random = "0x" + "ab".repeat(32);
    expect(runLabel(random)).toBe(short(random));
  });

  it("does not try to read control bytes as a name", () => {
    const ctrl = "0x01" + "00".repeat(31);
    expect(runLabel(ctrl)).toBe(short(ctrl));
  });

  it("short-hexes anything that is not bytes32", () => {
    expect(runLabel("0xdead")).toBe("0xdead");
  });
});

describe("an address, shortened", () => {
  it("keeps enough of both ends to be recognisable", () => {
    expect(short("0x1E4a5963aBFD975d8c9021ce480b42188849D41d")).toBe("0x1E4a59…D41d");
  });
});

describe("a schedule's length, as a person says it", () => {
  it("says a short grant in minutes and hours, never \"immediately\"", () => {
    // The record printed a 10-minute grant as "vesting over immediately".
    expect(lengthWords(600)).toBe("10 minutes");
    expect(lengthWords(1800)).toBe("30 minutes");
    expect(lengthWords(120)).toBe("2 minutes");
    expect(lengthWords(3600)).toBe("1 hour");
    expect(lengthWords(14 * 86_400)).toBe("14 days");
  });

  it("says a long grant in years, months and days", () => {
    expect(lengthWords(4 * 365 * 86_400)).toBe("4 years");
    expect(lengthWords(365 * 86_400)).toBe("1 year");
    expect(lengthWords(180 * 86_400)).toBe("6 months");
    expect(lengthWords(90 * 86_400)).toBe("3 months");
    expect(lengthWords(45 * 86_400)).toBe("45 days");
  });
});
