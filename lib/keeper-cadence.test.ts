import {describe, expect, it} from "vitest";
import {MAX_GAP_SECONDS, MIN_GAP_SECONDS, RELEASES_PER_SCHEDULE, releaseGap, releaseNow} from "./keeper-cadence";

const HOUR = 3_600;
const DAY = 86_400;

describe("releaseGap", () => {
  it("spreads about 48 releases over a schedule", () => {
    expect(RELEASES_PER_SCHEDULE).toBe(48);
    expect(releaseGap(2 * HOUR)).toBe(150);
    expect(releaseGap(DAY)).toBe(30 * 60);
    expect(releaseGap(30 * DAY)).toBe(15 * HOUR);
  });

  it("never releases a short grant more than every two minutes", () => {
    expect(releaseGap(10 * 60)).toBe(MIN_GAP_SECONDS);
    expect(releaseGap(0)).toBe(MIN_GAP_SECONDS);
    expect(releaseGap(-5)).toBe(MIN_GAP_SECONDS);
  });

  it("releases a long grant at least once a day", () => {
    expect(releaseGap(4 * 365 * DAY)).toBe(MAX_GAP_SECONDS);
    expect(releaseGap(48 * DAY)).toBe(DAY);
  });
});

describe("releaseNow", () => {
  const start = 1_000_000;
  const twoHours = {start, durationSeconds: 2 * HOUR, revoked: false, releasableUnits: 5n};

  it("never sends when nothing is due", () => {
    expect(releaseNow({...twoHours, releasableUnits: 0n}, start + HOUR, undefined)).toBe(false);
    expect(releaseNow({...twoHours, releasableUnits: 0n, revoked: true}, start + HOUR, undefined)).toBe(false);
  });

  it("sends at once what is due when it has not sent for this grant yet", () => {
    expect(releaseNow(twoHours, start + 60, undefined)).toBe(true);
  });

  it("waits out the gap after a release, then sends", () => {
    const sent = start + 600;
    expect(releaseNow(twoHours, sent + 149, sent)).toBe(false);
    expect(releaseNow(twoHours, sent + 150, sent)).toBe(true);
  });

  it("sends what is due at once when the grant has ended, whatever the gap", () => {
    const end = start + 2 * HOUR;
    expect(releaseNow(twoHours, end, end - 10)).toBe(true);
    expect(releaseNow(twoHours, end + DAY, end + DAY - 1)).toBe(true);
  });

  it("sends what had vested at once when the grant was cancelled", () => {
    expect(releaseNow({...twoHours, revoked: true}, start + 700, start + 690)).toBe(true);
  });

  it("releases a four-year grant about daily", () => {
    const long = {start, durationSeconds: 4 * 365 * DAY, revoked: false, releasableUnits: 1n};
    const sent = start + 400 * DAY;
    expect(releaseNow(long, sent + DAY - 1, sent)).toBe(false);
    expect(releaseNow(long, sent + DAY, sent)).toBe(true);
  });
});
