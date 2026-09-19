/**
 * A limit written in two languages is a limit that will eventually disagree with itself,
 * and the symptom is a form that lets someone sign a transaction the contract rejects. So
 * these are read out of the contract source rather than trusted.
 */
import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {MAX_DURATION_DAYS, MAX_DURATION_SECONDS, MAX_TIP_BPS} from "./grant-terms";

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
});
