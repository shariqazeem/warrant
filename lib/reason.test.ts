/**
 * TWO LISTS THAT DRIFT IS THE DOMINANT DEFECT SHAPE, and the reason hash lives in two
 * languages: `Payroll.hashReason` in Solidity and `reasonHash` here. If they disagree, a
 * receipt stops verifying and nobody finds out until a judge opens one.
 *
 * So this test does not test TypeScript against TypeScript. It reads the fixture that
 * `contracts/test/Payroll.t.sol` asserts against, and checks this implementation produces
 * the same bytes. Change one side and this fails.
 */
import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {EMPTY_REASON_HASH, REASON_FIXTURE, normaliseReason, reasonHash} from "./reason";

describe("the reason hash", () => {
  it("agrees with the fixture the Solidity test asserts", () => {
    expect(reasonHash(REASON_FIXTURE.text)).toBe(REASON_FIXTURE.hash);
  });

  it("hashes an empty reason the way keccak256 of nothing does", () => {
    expect(reasonHash("")).toBe(EMPTY_REASON_HASH);
  });

  it("reads the same constants out of the Solidity test, so neither side can move alone", () => {
    const sol = readFileSync("contracts/test/Payroll.t.sol", "utf8");

    const text = sol.match(/string internal constant REASON = "([^"]+)"/)?.[1];
    const hash = sol.match(/bytes32 internal constant REASON_HASH\s*=\s*(0x[0-9a-fA-F]{64})/)?.[1];
    const empty = sol.match(/payroll\.hashReason\(""\),\s*(0x[0-9a-fA-F]{64})/)?.[1];

    expect(text, "REASON not found in Payroll.t.sol").toBeDefined();
    expect(hash, "REASON_HASH not found in Payroll.t.sol").toBeDefined();
    expect(empty, "the empty-reason vector not found in Payroll.t.sol").toBeDefined();

    expect(text).toBe(REASON_FIXTURE.text);
    expect(hash!.toLowerCase()).toBe(REASON_FIXTURE.hash.toLowerCase());
    expect(empty!.toLowerCase()).toBe(EMPTY_REASON_HASH.toLowerCase());
    expect(reasonHash(text!)).toBe(hash!.toLowerCase());
  });

  it("treats a reason the payer cannot see the difference between as the same reason", () => {
    expect(reasonHash("  Design review,  week 38 ")).toBe(REASON_FIXTURE.hash);
    expect(normaliseReason("a\n\nb")).toBe("a b");
  });

  it("does not collapse reasons that genuinely differ", () => {
    expect(reasonHash("Design review, week 38")).not.toBe(reasonHash("Design review, week 39"));
  });
});
