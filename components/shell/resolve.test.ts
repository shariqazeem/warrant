import {describe, expect, it} from "vitest";
import {DOORS} from "../site/doors";
import {resolve} from "./resolve";

const TX = `0x${"a".repeat(64)}`;
const ADDR = "0x1e4a5963abfd975d8c9021ce480b42188849d41d";

describe("what a typed string resolves to", () => {
  it("offers the doors when nothing is typed", () => {
    expect(resolve("").every((d) => d.kind === "page")).toBe(true);
    expect(resolve("   ").length).toBeGreaterThan(0);
  });

  it("reads 32 bytes as a receipt first, then as a run", () => {
    const out = resolve(TX);
    expect(out[0]!.kind).toBe("receipt");
    expect(out[0]!.href).toBe(`/receipt/${TX}`);
    expect(out[1]!.kind).toBe("run");
  });

  it("reads 20 bytes as a company", () => {
    const out = resolve(ADDR);
    expect(out[0]!.kind).toBe("company");
    expect(out[0]!.href).toBe(`/@${ADDR}`);
  });

  it("accepts a hash pasted without its 0x", () => {
    expect(resolve("a".repeat(64))[0]!.href).toBe(`/receipt/${TX}`);
    expect(resolve(ADDR.slice(2))[0]!.kind).toBe("company");
  });

  it("turns a run's name back into its id", () => {
    const out = resolve("run-fork-proof");
    expect(out[0]!.kind).toBe("run");
    // bytes32, left-aligned ASCII, zero padded — the same shape lib/run-id.ts writes.
    expect(out[0]!.href).toBe(
      `/run/0x${Buffer.from("run-fork-proof").toString("hex").padEnd(64, "0")}`,
    );
  });

  it("NEVER half-matches an address, because that is a payment to the wrong person", () => {
    const truncated = ADDR.slice(0, 30);
    expect(resolve(truncated).some((d) => d.kind === "company")).toBe(false);
    const tooLong = `${ADDR}ff`;
    expect(resolve(tooLong).some((d) => d.kind === "company")).toBe(false);
  });

  it("finds the doors by name", () => {
    expect(resolve("grants").some((d) => d.href === "/grants")).toBe(true);
    expect(resolve("grant").some((d) => d.label === "Issue a grant")).toBe(true);
    expect(resolve("payroll").some((d) => d.href === "/run")).toBe(true);
    expect(resolve("record").some((d) => d.href === "/record")).toBe(true);
    expect(resolve("recipients").some((d) => d.href === "/me")).toBe(true);
  });

  it("offers exactly the nav's doors, in the nav's order", () => {
    expect(resolve("").map((d) => d.href)).toEqual(DOORS.map((d) => d.href));
    expect(resolve("").map((d) => d.label)).toEqual([
      "Issue a grant",
      "Payroll",
      "Public record",
      "For recipients",
    ]);
  });

  it("reads a certificate number as engraved, then still offers the run of that name", () => {
    for (const typed of ["000042", "42", "No. 42", "no.42", "#42"]) {
      const out = resolve(typed);
      expect(out[0]!.kind).toBe("certificate");
      expect(out[0]!.href).toBe("/g/42");
      expect(out[0]!.label).toBe("Open certificate No. 000042");
      expect(out.some((d) => d.kind === "run")).toBe(true);
    }
    expect(resolve("0").some((d) => d.kind === "certificate")).toBe(false);
    expect(resolve("1234567").some((d) => d.kind === "certificate")).toBe(false);
  });
});
