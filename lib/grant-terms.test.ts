/**
 * A limit written in two languages is a limit that will eventually disagree with itself,
 * and the symptom is a form that lets someone sign a transaction the contract rejects. So
 * these are read out of the contract source rather than trusted.
 *
 * Below the limits: the arithmetic the issue form does before a wallet opens. A schedule's
 * seconds, a fee's basis points and every amount the form prints are money-critical, so
 * each is held to worked cases here.
 */
import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {
  DEFAULT_TIP_BPS,
  MAX_DURATION_DAYS,
  MAX_DURATION_SECONDS,
  MAX_ROUTE_TOKENS,
  MAX_TIP_BPS,
  addMonthsUTC,
  ceilCents,
  ceilOkb,
  checkRoute,
  checkSchedule,
  checkStart,
  checkTip,
  choiceNote,
  cliffWords,
  feeText,
  floorUnits,
  grantDecision,
  localInputToUnix,
  parseFeePercent,
  parseSpan,
  routeTokens,
  scheduleFor,
  scheduleWords,
  spanSeconds,
  spanWords,
  unitPrice,
  unixToLocalInput,
  usdExact,
} from "./grant-terms";

const source = readFileSync("contracts/src/GrantEscrow.sol", "utf8");

describe("the grant limits", () => {
  it("matches GrantEscrow.MAX_TIP_BPS", () => {
    const found = source.match(/uint16 public constant MAX_TIP_BPS = (\d+);/)?.[1];
    expect(found, "MAX_TIP_BPS not found in GrantEscrow.sol").toBeDefined();
    expect(Number(found)).toBe(MAX_TIP_BPS);
  });

  it("matches GrantEscrow.MAX_DURATION", () => {
    const found = source.match(/uint64 public constant MAX_DURATION = (\d+) days;/)?.[1];
    expect(found, "MAX_DURATION not found in GrantEscrow.sol").toBeDefined();
    expect(Number(found)).toBe(MAX_DURATION_DAYS);
    expect(MAX_DURATION_SECONDS).toBe(MAX_DURATION_DAYS * 86_400);
  });

  it("keeps the tip a fraction of a percent, not a fee", () => {
    expect(MAX_TIP_BPS / 100).toBeLessThanOrEqual(2);
  });

  it("starts the form inside the contract's bounds", () => {
    expect(checkTip(DEFAULT_TIP_BPS).ok).toBe(true);
    expect(DEFAULT_TIP_BPS).toBe(50);
  });

  it("checks a schedule in the order GrantEscrow does", () => {
    // ZeroDuration, DurationTooLong, CliffAfterDuration — the order of the reverts.
    expect(source.indexOf("revert ZeroDuration")).toBeLessThan(source.indexOf("revert DurationTooLong"));
    expect(source.indexOf("revert DurationTooLong")).toBeLessThan(source.indexOf("revert CliffAfterDuration"));
    expect(checkSchedule(0, 0)).toEqual({ok: false, why: "Vesting needs a length."});
    expect(checkSchedule(MAX_DURATION_SECONDS + 1, 0).ok).toBe(false);
    expect(checkSchedule(100, 101)).toEqual({ok: false, why: "The cliff can't be longer than the vesting."});
    expect(checkSchedule(1, 1).ok).toBe(true);
    expect(checkSchedule(MAX_DURATION_SECONDS, MAX_DURATION_SECONDS).ok).toBe(true);
    expect(checkSchedule(1.5, 0).ok).toBe(false);
  });
});

// 24 Sep 2026, 12:00:00 UTC.
const SEP_24 = Date.UTC(2026, 8, 24, 12, 0, 0) / 1000;
const DAY = 86_400;

describe("a schedule's length in seconds", () => {
  it("counts months on the calendar, in UTC", () => {
    expect(addMonthsUTC(SEP_24, 6)).toBe(Date.UTC(2027, 2, 24, 12) / 1000);
    expect(addMonthsUTC(SEP_24, 24)).toBe(Date.UTC(2028, 8, 24, 12) / 1000);
    expect(addMonthsUTC(SEP_24, 0)).toBe(SEP_24);
  });

  it("lands the 31st on the last day of a shorter month, never in the month after", () => {
    const jan31 = Date.UTC(2027, 0, 31, 9, 30) / 1000;
    expect(addMonthsUTC(jan31, 1)).toBe(Date.UTC(2027, 1, 28, 9, 30) / 1000);
    const jan31leap = Date.UTC(2028, 0, 31) / 1000;
    expect(addMonthsUTC(jan31leap, 1)).toBe(Date.UTC(2028, 1, 29) / 1000);
    expect(addMonthsUTC(Date.UTC(2026, 7, 31) / 1000, 1)).toBe(Date.UTC(2026, 8, 30) / 1000);
  });

  it("gives each preset its calendar length from 24 Sep 2026", () => {
    // Bonus: 6 months = 24 Mar 2027, 181 days.
    expect(spanSeconds(SEP_24, {value: 6, unit: "months"})).toBe(181 * DAY);
    // Retention: 2 years = 24 Sep 2028, 731 days (29 Feb 2028 is in it); cliff 6 months.
    expect(spanSeconds(SEP_24, {value: 2, unit: "years"})).toBe(731 * DAY);
    // Standard: 4 years = 24 Sep 2030, 1,461 days; cliff 1 year = 365 days.
    expect(spanSeconds(SEP_24, {value: 4, unit: "years"})).toBe(1461 * DAY);
    expect(spanSeconds(SEP_24, {value: 1, unit: "years"})).toBe(365 * DAY);
  });

  it("counts minutes, hours and days as fixed lengths", () => {
    expect(spanSeconds(SEP_24, {value: 2, unit: "hours"})).toBe(7_200);
    expect(spanSeconds(SEP_24, {value: 1.5, unit: "hours"})).toBe(5_400);
    expect(spanSeconds(SEP_24, {value: 90, unit: "minutes"})).toBe(5_400);
    expect(spanSeconds(SEP_24, {value: 3, unit: "days"})).toBe(3 * DAY);
    // Rounded down to a whole second.
    expect(spanSeconds(SEP_24, {value: 0.01, unit: "minutes"})).toBe(0);
    expect(spanSeconds(SEP_24, {value: 0.02, unit: "minutes"})).toBe(1);
  });

  it("builds a schedule whose dates are the calendar dates it names", () => {
    const s = scheduleFor(SEP_24, {value: 2, unit: "years"}, {value: 6, unit: "months"});
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(s.value.endsAt).toBe(Date.UTC(2028, 8, 24, 12) / 1000);
    expect(s.value.cliffAt).toBe(Date.UTC(2027, 2, 24, 12) / 1000);
    expect(s.value.durationSeconds).toBe(731 * DAY);
    expect(s.value.cliffSeconds).toBe(181 * DAY);
  });

  it("refuses ten calendar years, which is more than 3,650 days", () => {
    const s = scheduleFor(SEP_24, {value: 10, unit: "years"}, {value: 0, unit: "months"});
    expect(s.ok).toBe(false);
    if (s.ok) return;
    expect(s.why).toMatch(/at most 3,650 days/);
  });

  it("refuses a cliff after the end, and a zero length", () => {
    expect(scheduleFor(SEP_24, {value: 1, unit: "hours"}, {value: 2, unit: "hours"}).ok).toBe(false);
    expect(scheduleFor(SEP_24, {value: 0, unit: "hours"}, {value: 0, unit: "hours"}).ok).toBe(false);
    expect(scheduleFor(SEP_24, {value: 1, unit: "minutes"}, {value: 1, unit: "minutes"}).ok).toBe(true);
  });

  it("reads what a person typed for a span", () => {
    expect(parseSpan("2", "hours")).toEqual({ok: true, value: {value: 2, unit: "hours"}});
    expect(parseSpan(" 1.5 ", "hours")).toEqual({ok: true, value: {value: 1.5, unit: "hours"}});
    expect(parseSpan("", "hours").ok).toBe(false);
    expect(parseSpan("-1", "days").ok).toBe(false);
    expect(parseSpan("1.5", "months").ok).toBe(false);
    expect(parseSpan("two", "years").ok).toBe(false);
  });

  it("says a schedule the way a company does", () => {
    expect(scheduleWords({value: 6, unit: "months"}, {value: 0, unit: "months"})).toBe("6 months, no cliff");
    expect(scheduleWords({value: 2, unit: "years"}, {value: 6, unit: "months"})).toBe("2 years, 6-month cliff");
    expect(scheduleWords({value: 4, unit: "years"}, {value: 1, unit: "years"})).toBe("4 years, 1-year cliff");
    expect(spanWords({value: 1, unit: "hours"})).toBe("1 hour");
    expect(spanWords({value: 1.5, unit: "hours"})).toBe("1.5 hours");
    expect(cliffWords({value: 30, unit: "minutes"})).toBe("30-minute cliff");
  });
});

describe("the release fee", () => {
  it("reads a percentage into basis points without float error", () => {
    expect(parseFeePercent("0.5")).toEqual({ok: true, value: 50});
    expect(parseFeePercent("0.29")).toEqual({ok: true, value: 29});
    expect(parseFeePercent("2%")).toEqual({ok: true, value: 200});
    expect(parseFeePercent("0")).toEqual({ok: true, value: 0});
    expect(parseFeePercent(".25")).toEqual({ok: true, value: 25});
    expect(parseFeePercent("1.1")).toEqual({ok: true, value: 110});
  });

  it("refuses more than the contract takes, and more than two decimals", () => {
    expect(parseFeePercent("2.01")).toEqual({ok: false, why: "The release fee can be at most 2%."});
    expect(parseFeePercent("0.125").ok).toBe(false);
    expect(parseFeePercent("").ok).toBe(false);
    expect(parseFeePercent("-1").ok).toBe(false);
    expect(checkTip(201).ok).toBe(false);
    expect(checkTip(-1).ok).toBe(false);
    expect(checkTip(12.5).ok).toBe(false);
  });

  it("prints basis points as a percentage", () => {
    expect(feeText(50)).toBe("0.5%");
    expect(feeText(200)).toBe("2%");
    expect(feeText(0)).toBe("0%");
    expect(feeText(25)).toBe("0.25%");
  });
});

describe("a future start", () => {
  const now = SEP_24;

  it("takes zero as 'when it is issued'", () => {
    expect(checkStart(0, now)).toEqual({ok: true, value: 0});
  });

  it("refuses a start that is not in the future, which would vest part of it at once", () => {
    expect(checkStart(now, now).ok).toBe(false);
    expect(checkStart(now - 60, now).ok).toBe(false);
    expect(checkStart(now + 60, now)).toEqual({ok: true, value: now + 60});
    expect(checkStart(now + MAX_DURATION_SECONDS + 1, now).ok).toBe(false);
  });

  it("reads a datetime-local value on the person's own clock, and back", () => {
    const unix = localInputToUnix("2026-09-25T14:30");
    expect(unix).toBe(new Date(2026, 8, 25, 14, 30).getTime() / 1000);
    expect(unixToLocalInput(unix!)).toBe("2026-09-25T14:30");
    expect(localInputToUnix("2026-02-31T10:00")).toBeNull();
    expect(localInputToUnix("")).toBeNull();
    expect(localInputToUnix("tomorrow")).toBeNull();
  });
});

describe("amounts, as the form prints them", () => {
  it("cuts units down and never rounds them up", () => {
    // 0.645199999… SPYx must not print as 0.6452.
    expect(floorUnits(645_199_999_999_999_999n, 18)).toBe("0.6451");
    expect(floorUnits(1_000_000_000_000_000_000n, 18)).toBe("1.0000");
    expect(floorUnits(1_234_567_800_000_000_000_000n, 18)).toBe("1,234.5678");
    expect(floorUnits(0n, 18)).toBe("0.0000");
  });

  it("never prints a nonzero amount as zero", () => {
    expect(floorUnits(12_345_678_900_000n, 18)).toBe("0.000012");
    expect(floorUnits(1n, 18)).toBe("0.000000000000000001");
  });

  it("states a dollar amount exactly, cents always shown", () => {
    expect(usdExact(500_000_000n)).toBe("$500.00");
    expect(usdExact(2_500_000n)).toBe("$2.50");
    expect(usdExact(123_456n)).toBe("$0.123456");
    expect(usdExact(1_234_567_890_000n)).toBe("$1,234,567.89");
  });

  it("rounds a shortfall up, so topping up that much is enough", () => {
    expect(ceilCents(12_400_000n)).toBe("12.40");
    expect(ceilCents(12_400_001n)).toBe("12.41");
    expect(ceilCents(1n)).toBe("0.01");
    expect(ceilCents(0n)).toBe("0.00");
    expect(ceilCents(1_234_500_000n)).toBe("1,234.50");
    expect(ceilOkb(12_300_000_000_000n)).toBe("0.000013");
    expect(ceilOkb(2_000_000_000_000_000n)).toBe("0.002");
    expect(ceilOkb(1n)).toBe("0.000001");
    expect(ceilOkb(0n)).toBe("0");
  });

  it("works out one unit's price from a quote's two numbers", () => {
    // $500 for 0.6516 SPYx is $767.34 a unit (to the cent).
    expect(unitPrice(500_000_000n, 651_600_000_000_000_000n, 18)).toBe("767.34");
    expect(unitPrice(2_000_000n, 2_600_000_000_000_000n, 18)).toBe("769.23");
    expect(unitPrice(1_000_000n, 0n, 18)).toBeNull();
  });
});

describe("the route, as tokens", () => {
  const USDT = {address: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736", symbol: "USD₮0"};
  const SPYX = {address: "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48", symbol: "SPYx"};
  const tok = (tokenSymbol: string, tokenContractAddress: string) => ({tokenSymbol, tokenContractAddress});
  const USDG = tok("USDG", "0x0000000000000000000000000000000000000001");
  const WSPYX = tok("wSPYx", "0x0000000000000000000000000000000000000002");

  it("names each token once, in the order the route reaches it", () => {
    const hops = [
      {fromToken: tok("USDT", USDT.address), toToken: USDG},
      // A split: the same leg through a second venue.
      {fromToken: tok("USDT", USDT.address), toToken: USDG},
      {fromToken: USDG, toToken: WSPYX},
      {fromToken: WSPYX, toToken: tok("SPYx", SPYX.address)},
    ];
    expect(routeTokens(hops, USDT, SPYX)).toEqual(["USD₮0", "USDG", "wSPYx", "SPYx"]);
  });

  it("starts with what was paid and ends with the stock, whatever the hops said", () => {
    expect(routeTokens([], USDT, SPYX)).toEqual(["USD₮0", "SPYx"]);
    expect(routeTokens([{fromToken: undefined, toToken: undefined}], USDT, SPYX)).toEqual(["USD₮0", "SPYx"]);
  });

  it("keeps a long route's two ends inside the printable length", () => {
    const hops = Array.from({length: 20}, (_, i) => ({
      toToken: tok(`T${i}`, `0x${String(i + 10).padStart(40, "0")}`),
    }));
    const route = routeTokens(hops, USDT, SPYX);
    expect(route).toHaveLength(MAX_ROUTE_TOKENS);
    expect(route[0]).toBe("USD₮0");
    expect(route.at(-1)).toBe("SPYx");
    expect(checkRoute(route).ok).toBe(true);
  });

  it("stores only a route a certificate can print", () => {
    expect(checkRoute(["USD₮0", "USDG", "wSPYx", "SPYx"])).toEqual({
      ok: true,
      value: ["USD₮0", "USDG", "wSPYx", "SPYx"],
    });
    expect(checkRoute(["SPYx"]).ok).toBe(false);
    expect(checkRoute("USD₮0 → SPYx").ok).toBe(false);
    expect(checkRoute(["USD₮0", "x".repeat(41)]).ok).toBe(false);
    expect(checkRoute(["USD₮0", "<script>"]).ok).toBe(false);
    expect(checkRoute(["USD₮0", "a\nb"]).ok).toBe(false);
    expect(checkRoute(Array.from({length: MAX_ROUTE_TOKENS + 1}, () => "T")).ok).toBe(false);
    expect(checkRoute(["USD₮0", 7]).ok).toBe(false);
  });
});

describe("the person's choice, on a grant", () => {
  const NVDAX = "0xc845b2894dbddd03858fd2d643b4ef725fe0849d";
  const SPYX = "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48";

  it("follows their choice only when the grant is in the stock they chose", () => {
    expect(grantDecision({asset: NVDAX}, NVDAX.toUpperCase().replace("0X", "0x"))).toBe("their-choice");
    expect(grantDecision({asset: NVDAX}, SPYX)).toBe("company");
    expect(grantDecision({asset: null}, SPYX)).toBe("company");
    expect(grantDecision(null, SPYX)).toBe("company");
  });

  it("says so under their address, and keeps saying it when the company picks another", () => {
    const nvda = {symbol: "NVDAx", asset: NVDAX};
    expect(choiceNote(nvda, {symbol: "NVDAx", address: NVDAX})).toBe("They chose NVDAx.");
    expect(choiceNote(nvda, {symbol: "SPYx", address: SPYX})).toBe("They chose NVDAx; you're granting SPYx.");
    expect(choiceNote(null, {symbol: "SPYx", address: SPYX})).toBeNull();
    expect(choiceNote({symbol: null, asset: null}, {symbol: "SPYx", address: SPYX})).toMatch(/dollars/);
  });
});
