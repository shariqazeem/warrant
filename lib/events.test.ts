/**
 * TWO COPIES OF EACH EVENT. The indexer and the receipt page decode the contracts' events
 * from definitions written by hand; the contracts' own ABI is generated from the build.
 * If they drift, logs decode into the wrong fields — silently. This reads both.
 */
import {describe, expect, it} from "vitest";
import type {AbiEvent} from "viem";
import {GRANT_OPENED_EVENT, VESTED_EVENT} from "./indexer";
import {grantEscrowAbi, payrollAbi} from "./payroll-abi";
import {PAID_EVENT} from "./receipts";

const shape = (e: AbiEvent) =>
  `${e.name}(${e.inputs.map((i) => `${i.type}${i.indexed ? " indexed" : ""} ${i.name}`).join(", ")})`;

const compiled = (abi: readonly unknown[], name: string) => {
  const e = (abi as AbiEvent[]).find((x) => x.type === "event" && x.name === name);
  if (!e) throw new Error(`${name} is not in the compiled ABI`);
  return e;
};

describe("hand-written events match the compiled contracts", () => {
  it("Paid", () => expect(shape(PAID_EVENT)).toBe(shape(compiled(payrollAbi, "Paid"))));
  it("GrantOpened", () =>
    expect(shape(GRANT_OPENED_EVENT)).toBe(shape(compiled(grantEscrowAbi, "GrantOpened"))));
  it("Vested", () => expect(shape(VESTED_EVENT)).toBe(shape(compiled(grantEscrowAbi, "Vested"))));
});
