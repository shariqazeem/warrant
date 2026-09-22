import {describe, expect, it} from "vitest";
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
    expect(resolve("pay").some((d) => d.href === "/pay")).toBe(true);
  });
});
