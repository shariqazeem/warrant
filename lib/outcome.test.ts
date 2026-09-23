import {describe, expect, it} from "vitest";
import {attempt, isThrottle, shortReason} from "./outcome";

describe("isThrottle", () => {
  it("knows the public endpoint's throttle by its status and its code", () => {
    expect(isThrottle({status: 429})).toBe(true);
    expect(isThrottle({code: -32016, details: "over rate limit"})).toBe(true);
    expect(isThrottle({shortMessage: "HTTP request failed.", cause: {details: "over rate limit"}})).toBe(true);
  });

  it("is not fooled by a 429 inside a hex string in the request body", () => {
    // The GrantOpened topic contains "429"; viem's message carries the request body.
    const e = Object.assign(new Error("Request body: {\"topics\":[\"0xc23f…34297a…\"]}"), {
      shortMessage: "Invalid params",
      code: -32602,
    });
    expect(isThrottle(e)).toBe(false);
  });
});

describe("shortReason", () => {
  it("prefers viem's short message over its multi-line dump", () => {
    const e = Object.assign(new Error("line one\nRequest body: …\nVersion: viem@2"), {shortMessage: "Block not found."});
    expect(shortReason(e)).toBe("Block not found.");
  });

  it("falls back to the first line only", () => {
    expect(shortReason(new Error("first\nsecond"))).toBe("first");
  });
});

describe("attempt", () => {
  it("holds with a readable sentence instead of throwing", async () => {
    const r = await attempt("this receipt", async () => {
      throw Object.assign(new Error("long dump\nVersion: viem@2.56.8"), {shortMessage: "Transaction not found."});
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.why).toContain("Transaction not found.");
      expect(r.why).not.toContain("Version");
    }
  });
});
