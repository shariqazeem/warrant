/**
 * A PAY LINK'S WORDS. The page, its share card and the pay form print these, so what a
 * payer is told about a person's split is decided here once — and held, below, to the words
 * lib/choice.ts uses for the same choice on /me and in the signature section.
 */
import {getAddress} from "viem";
import {describe, expect, it} from "vitest";
import {ASSETS} from "../../lib/assets";
import {MAX_BPS, ZERO_ADDRESS, choiceParts} from "../../lib/choice";
import {short} from "../../lib/format";
import {
  NOT_CHOSEN,
  PAY_DESCRIPTION,
  choiceLine,
  displayAddress,
  pageKind,
  payHeading,
  payLinkPath,
  payTitle,
  readTo,
  splitWords,
  theyGet,
} from "./pay-link";

const SPYX = ASSETS[0]!;
const LOWER = "0xd5fe4a6fbd8e2b2dd2e8a3e5b5c1f2c3d4e5125b";
const CHECKSUMMED = getAddress(LOWER);

/** The same wallet with one letter's case flipped: still mixed case, so its checksum fails. */
function miscased(a: string): string {
  const body = a.slice(2).split("");
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (!/[a-fA-F]/.test(ch)) continue;
    const next = [...body];
    next[i] = ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase();
    const text = next.join("");
    // All one case has no checksum to fail, so it would not be a mistake at all.
    if (text !== text.toLowerCase() && text !== text.toUpperCase()) return `0x${text}`;
  }
  throw new Error(`No letter in ${a} can be flipped and leave it mixed case.`);
}

describe("the wallet a pay link names", () => {
  it("prints checksummed, whatever case it arrived in", () => {
    expect(displayAddress(LOWER)).toBe(CHECKSUMMED);
    expect(displayAddress(LOWER.toUpperCase().replace("0X", "0x"))).toBe(CHECKSUMMED);
    expect(displayAddress(CHECKSUMMED)).toBe(CHECKSUMMED);
  });

  it("hands back anything that is not an address unchanged, rather than guessing", () => {
    expect(displayAddress("0x1234")).toBe("0x1234");
    expect(displayAddress("nobody")).toBe("nobody");
  });

  it("is the heading, the title and the link, all from the same short form", () => {
    expect(payHeading(LOWER)).toBe(`Pay ${short(CHECKSUMMED)}`);
    expect(payHeading(LOWER)).toMatch(/^Pay 0x[0-9a-fA-F]{6}…[0-9a-fA-F]{4}$/);
    expect(payTitle(LOWER)).toBe(`Pay ${short(CHECKSUMMED)} — Warrant`);
    expect(payLinkPath(LOWER)).toBe(`/@${CHECKSUMMED}`);
    expect(PAY_DESCRIPTION).toBe("Pay them in dollars; they get their own split of stock, with a receipt.");
  });
});

describe("when an address's page is a pay link", () => {
  it("is one for anyone who has signed a choice, paid or not", () => {
    expect(pageKind({hasChoice: true, timesPaid: 0})).toBe("pay-link");
    expect(pageKind({hasChoice: true, timesPaid: 4})).toBe("pay-link");
  });

  it("is one for anyone already paid through Warrant, chosen or not", () => {
    expect(pageKind({hasChoice: false, timesPaid: 1})).toBe("pay-link");
  });

  it("stays the record for everyone else: a company that only pays, or nobody yet", () => {
    expect(pageKind({hasChoice: false, timesPaid: 0})).toBe("record");
  });
});

describe("the split, as a payer reads it", () => {
  it("says a part-stock choice with its share, its stock and the rest", () => {
    const c = {stockBps: 2_500, asset: SPYX.address};
    expect(theyGet(c)).toBe(`They get 25% of each payment in ${SPYX.name} (${SPYX.symbol}), the rest in USD₮0.`);
    expect(choiceLine(c)).toBe(`25% of each payment in ${SPYX.name} (${SPYX.symbol}), the rest in USD₮0.`);
    expect(splitWords(c)).toEqual({
      share: "25%",
      rest: `of each payment in ${SPYX.name} (${SPYX.symbol}), the rest in USD₮0.`,
    });
  });

  it("drops 'the rest' when all of it becomes stock", () => {
    expect(theyGet({stockBps: MAX_BPS, asset: SPYX.address})).toBe(
      `They get 100% of each payment in ${SPYX.name} (${SPYX.symbol}).`,
    );
  });

  it("says all USDT plainly, with no share to print, however the choice holds 'no stock'", () => {
    // A stored choice names the zero address; the pay form's view names null.
    for (const c of [
      {stockBps: 0, asset: ZERO_ADDRESS},
      {stockBps: 0, asset: null},
      // A share with no stock named buys nothing, as lib/payment.ts resolveSplit reads it.
      {stockBps: 2_500, asset: null},
    ]) {
      expect(splitWords(c).share).toBeNull();
      expect(theyGet(c)).toBe("They get all of each payment in USD₮0, no stock.");
      expect(choiceLine(c)).toBe("All of each payment in USD₮0, no stock.");
    }
  });

  it("keeps a fractional share exact", () => {
    expect(splitWords({stockBps: 2_550, asset: SPYX.address}).share).toBe("25.5%");
    expect(splitWords({stockBps: 1, asset: SPYX.address}).share).toBe("0.01%");
  });

  it("says so when a choice names a stock no longer listed, rather than hiding it", () => {
    const gone = "0x1111111111111111111111111111111111111111";
    expect(theyGet({stockBps: 2_500, asset: gone})).toBe(
      "They get 25% of each payment in a stock Warrant no longer pays in (0x111111…1111), the rest in USD₮0.",
    );
  });

  it("reads an address in any case", () => {
    expect(theyGet({stockBps: 2_500, asset: getAddress(SPYX.address)})).toBe(
      theyGet({stockBps: 2_500, asset: SPYX.address}),
    );
  });

  it("says who has not chosen, in the page's own words", () => {
    expect(theyGet(null)).toBe(NOT_CHOSEN);
    expect(NOT_CHOSEN).toBe("They haven't chosen yet — you pick for this payment.");
  });

  // Two lists that drift: /me and the signature section say a choice with lib/choice.ts,
  // the pay link with this file. Same share, same stock, for every stock Warrant lists.
  it("agrees with lib/choice.ts on the share and the stock, for every listed stock", () => {
    for (const a of ASSETS) {
      for (const stockBps of [1, 1_000, 2_500, 3_333, 9_999, MAX_BPS]) {
        const theirs = choiceParts({stockBps, asset: a.address});
        const ours = splitWords({stockBps, asset: a.address});
        expect(ours.share).toBe(theirs.share);
        expect(ours.rest).toContain(`${a.name} (${a.symbol})`);
        expect(theirs.rest).toContain(`${a.name} (${a.symbol})`);
        expect(ours.rest.includes("the rest")).toBe(theirs.rest.includes("the rest"));
      }
    }
  });
});

describe("the wallet a /pay link asks to pay", () => {
  it("is nobody when the link names nobody", () => {
    expect(readTo(undefined)).toEqual({kind: "none"});
    expect(readTo("")).toEqual({kind: "none"});
    expect(readTo("  ")).toEqual({kind: "none"});
    expect(readTo([])).toEqual({kind: "none"});
  });

  it("fixes a whole address, lowercase or checksummed, printed checksummed", () => {
    expect(readTo(LOWER)).toEqual({kind: "fixed", address: CHECKSUMMED});
    expect(readTo(CHECKSUMMED)).toEqual({kind: "fixed", address: CHECKSUMMED});
    expect(readTo(` @${LOWER} `)).toEqual({kind: "fixed", address: CHECKSUMMED});
  });

  it("refuses a mixed-case address whose checksum fails, and says what it may have meant", () => {
    const wrong = miscased(CHECKSUMMED);
    expect(wrong.toLowerCase()).toBe(LOWER);
    expect(wrong).not.toBe(CHECKSUMMED);
    const r = readTo(wrong);
    expect(r.kind).toBe("refused");
    if (r.kind === "refused") {
      expect(r.why).toContain("checksum");
      expect(r.why).toContain(CHECKSUMMED);
    }
  });

  it("refuses what is not an address, and a link naming two", () => {
    expect(readTo("0x1234").kind).toBe("refused");
    expect(readTo("alice.eth").kind).toBe("refused");
    expect(readTo([LOWER, LOWER]).kind).toBe("refused");
  });
});
