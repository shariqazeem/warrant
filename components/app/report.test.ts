import {describe, expect, it} from "vitest";
import {isStaleBuild} from "./report";
import {connectWords, switchWords, OKX_CLOSED} from "../wallet/wallet-words";

describe("a tab older than the site", () => {
  it("is recognised by what the browser and Next.js actually throw", () => {
    const chunk = Object.assign(new Error("Loading chunk 8123 failed.\n(error: https://warrant.world/_next/static/chunks/8123.js)"), {name: "ChunkLoadError"});
    expect(isStaleBuild(chunk)).toBe(true);
    expect(isStaleBuild(new TypeError("Failed to fetch dynamically imported module: https://warrant.world/_next/static/chunks/app/me/page-1.js"))).toBe(true);
    expect(isStaleBuild(new TypeError("Importing a module script failed."))).toBe(true);
    // Next 15's words for a server action the new build does not know
    expect(isStaleBuild(new Error('Server Action "7f3a9c" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action'))).toBe(true);
  });

  it("is not every failure: a refused read or a wallet's refusal is something else", () => {
    expect(isStaleBuild(new Error("HTTP request failed. Status: 429"))).toBe(false);
    expect(isStaleBuild(new Error("User rejected the request."))).toBe(false);
    expect(isStaleBuild("some string")).toBe(false);
    expect(isStaleBuild(undefined)).toBe(false);
    expect(isStaleBuild({code: 4001})).toBe(false);
  });
});

describe("what a wallet said, whatever shape it said it in", () => {
  it("reads an Error, a bare string, and an object carrying only a code without throwing", () => {
    expect(connectWords(new Error("User rejected the request."))).toBe("The request was dismissed in your wallet.");
    expect(connectWords("User denied account authorization")).toBe("The request was dismissed in your wallet.");
    expect(connectWords({code: 4001})).toBe("The request was dismissed in your wallet.");
    expect(connectWords({code: -32002})).toBe("Your wallet already has a request open. Check it.");
    expect(connectWords(new Error(OKX_CLOSED))).toContain("Press OKX Wallet");
  });

  it("says something true when the wallet said nothing at all", () => {
    for (const nothing of [undefined, null, {}, {message: undefined}, {message: ""}, "", 42]) {
      expect(() => connectWords(nothing)).not.toThrow();
      expect(() => switchWords(nothing)).not.toThrow();
    }
    expect(connectWords({})).toMatch(/without saying why/);
    expect(switchWords(undefined)).toMatch(/did not switch/);
  });

  it("keeps only the first line of a long message, and reads a wrapped cause", () => {
    expect(connectWords(new Error("Something odd\nat stack line 1\nat stack line 2"))).toBe("Something odd");
    expect(connectWords({cause: {code: 4001, message: "rejected"}})).toBe("The request was dismissed in your wallet.");
  });
});
