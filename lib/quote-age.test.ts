import {describe, expect, it} from "vitest";
import {QUOTE_FRESH_MS, QUOTE_STALE_MS, freshness, quoteAge} from "./quote-age";

const now = 1_700_000_000_000;

describe("how old a price is", () => {
  it("is fresh right after it was taken", () => {
    expect(freshness(now, now)).toBe("fresh");
    expect(freshness(now - QUOTE_FRESH_MS + 1, now)).toBe("fresh");
  });

  it("ages, then goes stale, and the boundaries do not overlap", () => {
    expect(freshness(now - QUOTE_FRESH_MS, now)).toBe("ageing");
    expect(freshness(now - QUOTE_STALE_MS + 1, now)).toBe("ageing");
    expect(freshness(now - QUOTE_STALE_MS, now)).toBe("stale");
    expect(freshness(now - 60 * 60_000, now)).toBe("stale");
  });

  it("never reports a price from the future as old", () => {
    expect(quoteAge(now + 5000, now)).toBe("just now");
    expect(freshness(now + 5000, now)).toBe("fresh");
  });

  it("says the age the way a person would", () => {
    expect(quoteAge(now, now)).toBe("just now");
    expect(quoteAge(now - 45_000, now)).toBe("45 seconds ago");
    expect(quoteAge(now - 120_000, now)).toBe("2 minutes ago");
    expect(quoteAge(now - 60_000, now)).toBe("1 minute ago");
  });
});
