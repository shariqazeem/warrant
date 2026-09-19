/**
 * The app reads Paid logs through lib/payroll-abi.ts. The contract defines them in
 * Payroll.sol. If the two drift, the indexer silently decodes nothing and every surface
 * goes empty with no error anywhere — the worst failure shape this project has.
 *
 * So this regenerates the module from the compiled artifact and compares.
 */
import {existsSync, readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {render} from "../scripts/sync-abi";
import {payrollAbi} from "./payroll-abi";

describe("the Payroll ABI", () => {
  it("matches the compiled contract", () => {
    expect(
      existsSync("contracts/out/Payroll.sol/Payroll.json"),
      "no artifact — run: cd contracts && forge build",
    ).toBe(true);
    expect(readFileSync("lib/payroll-abi.ts", "utf8")).toBe(render());
  });

  it("carries the Paid event the indexer reads, with the fields the receipt renders", () => {
    const paid = payrollAbi.find((e) => e.type === "event" && e.name === "Paid");
    expect(paid, "Paid event missing from the ABI").toBeDefined();

    const inputs = (paid as {inputs: ReadonlyArray<{name: string; indexed?: boolean}>}).inputs;
    expect(inputs.map((i) => i.name)).toEqual([
      "payer",
      "recipient",
      "runId",
      "asset",
      "stableAmount",
      "cashAmount",
      "assetAmount",
      "reasonHash",
    ]);

    // The three the surfaces filter on: a company's page, a person, a run.
    expect(inputs.filter((i) => i.indexed).map((i) => i.name)).toEqual([
      "payer",
      "recipient",
      "runId",
    ]);
  });
});
