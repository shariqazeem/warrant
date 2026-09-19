/**
 * The vesting schedule in two languages, held to one fixture. The Solidity test reads the
 * same file; if either implementation moves, one of the two suites goes red.
 */
import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {humanDuration, progress, vestedSharesAt, type Schedule} from "./schedule";

type Fixture = {
  shares: string;
  start: number;
  cliffSeconds: number;
  durationSeconds: number;
  /** Parallel arrays, because forge's JSON reader has no wildcard. Both suites assert
   *  they are the same length, so a ragged fixture fails rather than silently skipping. */
  at: number[];
  vested: string[];
  notes: string[];
};

const fx = JSON.parse(
  readFileSync("contracts/test/fixtures/schedule.json", "utf8"),
) as Fixture;

const schedule: Schedule = {
  shares: BigInt(fx.shares),
  start: fx.start,
  cliffSeconds: fx.cliffSeconds,
  durationSeconds: fx.durationSeconds,
};

describe("the vesting schedule", () => {
  it("has a fixture that is not ragged", () => {
    expect(fx.at.length).toBeGreaterThan(0);
    expect(fx.vested).toHaveLength(fx.at.length);
    expect(fx.notes).toHaveLength(fx.at.length);
  });

  for (const [i, at] of fx.at.entries()) {
    it(`${fx.notes[i]}`, () => {
      expect(vestedSharesAt(schedule, at).toString()).toBe(fx.vested[i]);
    });
  }

  it("never goes backwards and never exceeds the grant", () => {
    let previous = 0n;
    for (let at = fx.start - 1000; at < fx.start + fx.durationSeconds * 2; at += 86_400) {
      const v = vestedSharesAt(schedule, at);
      expect(v).toBeGreaterThanOrEqual(previous);
      expect(v).toBeLessThanOrEqual(schedule.shares);
      previous = v;
    }
  });

  it("stops dead at revocation and never moves again", () => {
    const revoked: Schedule = {...schedule, revoked: true, frozenShares: 123n};
    expect(vestedSharesAt(revoked, fx.start)).toBe(123n);
    expect(vestedSharesAt(revoked, fx.start + fx.durationSeconds * 10)).toBe(123n);
  });

  it("rounds down, so a grant never over-pays", () => {
    const odd: Schedule = {shares: 7n, start: 0, cliffSeconds: 0, durationSeconds: 10};
    expect(vestedSharesAt(odd, 1)).toBe(0n); // 7 * 1 / 10 = 0.7
    expect(vestedSharesAt(odd, 5)).toBe(3n); // 3.5
    expect(vestedSharesAt(odd, 10)).toBe(7n);
  });
});

describe("what the bar draws", () => {
  it("places the cliff proportionally along the term", () => {
    const p = progress(schedule, 0n, fx.start);
    expect(p.cliffFraction).toBeCloseTo(fx.cliffSeconds / fx.durationSeconds, 6);
    expect(p.pastCliff).toBe(false);
    expect(p.vestedFraction).toBe(0);
  });

  it("tracks vested and released separately, because they are different things", () => {
    const halfway = fx.start + fx.durationSeconds / 2;
    const p = progress(schedule, schedule.shares / 4n, halfway);
    expect(p.vestedFraction).toBeCloseTo(0.5, 3);
    expect(p.releasedFraction).toBeCloseTo(0.25, 3);
    expect(p.finished).toBe(false);
  });

  it("is finished at the end, and stays finished", () => {
    expect(progress(schedule, schedule.shares, fx.start + fx.durationSeconds).finished).toBe(true);
    expect(progress(schedule, 0n, fx.start + fx.durationSeconds * 5).vestedFraction).toBe(1);
  });

  it("survives a zero-share grant without dividing by zero", () => {
    const empty: Schedule = {shares: 0n, start: 0, cliffSeconds: 0, durationSeconds: 100};
    const p = progress(empty, 0n, 50);
    expect(Number.isFinite(p.vestedFraction)).toBe(true);
    expect(p.vestedFraction).toBe(0);
  });
});

describe("a duration, as a person says it", () => {
  it("prefers years, then months, then days", () => {
    expect(humanDuration(4 * 365 * 86_400)).toBe("4 years");
    expect(humanDuration(365 * 86_400)).toBe("1 year");
    expect(humanDuration(180 * 86_400)).toBe("6 months");
    expect(humanDuration(90 * 86_400)).toBe("3 months");
    expect(humanDuration(45 * 86_400)).toBe("45 days");
    expect(humanDuration(0)).toBe("immediately");
  });
});
