/**
 * A PRESET'S CARD MUST SAY WHAT ITS SCHEDULE DOES. The name under each card is built from
 * the same two spans the grant is built from, and these tests hold the three presets to the
 * words the brief gives them — so a changed span shows up here, not on a certificate.
 */
import {describe, expect, it} from "vitest";
import {ASSETS} from "../../lib/assets";
import {scheduleFor} from "../../lib/grant-terms";
import {
  CUSTOM_START,
  DEFAULT_PRESET,
  FEATURED_SYMBOLS,
  PRESETS,
  curvePath,
  featuredAssets,
  presetById,
  presetDetail,
  reviewLine,
  searchAssets,
  shortName,
} from "./presets";

describe("the vesting presets", () => {
  it("are the three the brief names, in its words", () => {
    expect(PRESETS.map((p) => [p.label, presetDetail(p)])).toEqual([
      ["Bonus", "6 months, no cliff"],
      ["Retention", "2 years, 6-month cliff"],
      ["Standard", "4 years, 1-year cliff"],
    ]);
  });

  it("each makes a schedule the contract accepts, from any start", () => {
    const starts = [Date.UTC(2026, 8, 24, 12) / 1000, Date.UTC(2027, 0, 31) / 1000, Date.UTC(2028, 1, 29) / 1000];
    for (const start of starts) {
      for (const p of PRESETS) expect(scheduleFor(start, p.length, p.cliff).ok, p.id).toBe(true);
      expect(scheduleFor(start, CUSTOM_START.length, CUSTOM_START.cliff).ok).toBe(true);
    }
  });

  it("starts on Retention, and Custom starts at two hours with no cliff", () => {
    expect(DEFAULT_PRESET).toBe("retention");
    expect(presetById(DEFAULT_PRESET)?.label).toBe("Retention");
    expect(presetDetail(CUSTOM_START)).toBe("2 hours, no cliff");
  });
});

describe("the curve on a preset's card", () => {
  it("is a straight line with no cliff", () => {
    expect(curvePath(0)).toBe("M2 27 L62 4");
  });

  it("steps up at the cliff to where the line already is", () => {
    // Retention: a 6-month cliff on 2 years is a quarter of the way along.
    expect(curvePath(0.25)).toBe("M2 27 L17.0 27 L17.0 21.3 L62 4");
    expect(curvePath(1)).toBe("M2 27 L62.0 27 L62.0 4.0 L62 4");
  });

  it("stays inside its box whatever it is given", () => {
    expect(curvePath(-1)).toBe(curvePath(0));
    expect(curvePath(Number.NaN)).toBe(curvePath(0));
    expect(curvePath(7)).toBe(curvePath(1));
  });
});

describe("the stock picker", () => {
  it("features only stocks Warrant lists", () => {
    for (const s of FEATURED_SYMBOLS) expect(ASSETS.some((a) => a.symbol === s), s).toBe(true);
  });

  it("offers all fifteen when nothing is typed", () => {
    expect(searchAssets("")).toHaveLength(ASSETS.length);
    expect(ASSETS).toHaveLength(15);
  });

  it("finds a stock by symbol or by name, whatever the case", () => {
    expect(searchAssets("nvda").map((a) => a.symbol)).toEqual(["NVDAx"]);
    expect(searchAssets("s&p").map((a) => a.symbol)).toEqual(["SPYx"]);
    expect(searchAssets("zzz")).toEqual([]);
  });

  it("always shows the chosen stock among the chips", () => {
    const tsla = ASSETS.find((a) => a.symbol === "TSLAx")!;
    const chips = featuredAssets(tsla.address);
    expect(chips).toHaveLength(FEATURED_SYMBOLS.length);
    expect(chips.at(-1)?.symbol).toBe("TSLAx");
    const spy = ASSETS.find((a) => a.symbol === "SPYx")!;
    expect(featuredAssets(spy.address).map((a) => a.symbol)).toEqual([...FEATURED_SYMBOLS]);
  });

  it("says who can hold it in the words lib/assets.ts states", () => {
    expect(reviewLine("0x7c1E5a…9aB2")).toBe(
      "0x7c1E5a…9aB2 can hold xStocks where they live. xStocks aren't available to US " +
        "persons, or in Canada, the UK or Australia.",
    );
    expect(reviewLine(null)).toMatch(/^The person you're granting to can hold xStocks/);
  });

  it("drops the word xStock from a chip's name", () => {
    expect(shortName({name: "S&P 500 xStock"})).toBe("S&P 500");
    expect(shortName({name: "NVIDIA xStock"})).toBe("NVIDIA");
  });
});
