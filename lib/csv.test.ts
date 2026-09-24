/**
 * A ROW PARSED WRONGLY IS A PAYMENT TO THE WRONG PERSON.
 *
 * Nothing downstream can catch it: the contract pays what the line says, the receipt
 * records what the contract did, and both agree with the parse rather than with what the
 * payer meant. So this file is unusually paranoid about what the parser REFUSES.
 */
import {describe, expect, it} from "vitest";
import {
  COMMA_FOR_CENTS,
  MAX_RUN_LINES,
  RUN_TEMPLATE,
  parseMoney,
  parseRunFile,
  recipientFromCell,
  splitCsvLine,
} from "./csv";
import {payLinkPath} from "../components/link/pay-link";
import {ASSETS} from "./assets";
import {STABLE} from "./chain";

const ASSET = ASSETS[0]!.address;
const A = "0x1e4a5963abfd975d8c9021ce480b42188849d41d";
const B = "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48";

describe("splitting a line", () => {
  it("splits on commas and trims", () => {
    expect(splitCsvLine("a, b ,c")).toEqual(["a", "b", "c"]);
  });

  it("keeps a comma that is inside a quoted reason", () => {
    expect(splitCsvLine(`${A},25,"Design review, week 38"`)).toEqual([
      A,
      "25",
      "Design review, week 38",
    ]);
  });

  it("handles a doubled quote inside a quoted field", () => {
    expect(splitCsvLine(`${A},25,"She said ""ship it"""`)[2]).toBe('She said "ship it"');
  });

  it("keeps empty trailing cells rather than dropping them", () => {
    expect(splitCsvLine(`${A},25,reason,`)).toHaveLength(4);
  });
});

describe("money as a person types it", () => {
  it("takes the shapes people actually write", () => {
    for (const [text, value] of [
      ["25", 25],
      ["$25", 25],
      ["25.00", 25],
      ["1,250", 1250],
      ["$1,250.50", 1250.5],
      ["25 USDT", 25],
      ["  3 ", 3],
    ] as const) {
      const o = parseMoney(text);
      expect(o.ok, `${text} should parse`).toBe(true);
      expect(o.ok && o.value).toBe(value);
    }
  });

  it("REFUSES rather than coercing, because Number('') is zero", () => {
    for (const text of ["", "   ", "abc", "1.2.3", "-5", "1e3", "$", "two", "."]) {
      expect(parseMoney(text).ok, `${JSON.stringify(text)} must be refused`).toBe(false);
    }
  });

  it("takes a comma only between thousands", () => {
    for (const [text, value] of [
      ["1,250", 1250],
      ["1,250.50", 1250.5],
      ["12,345,678.90", 12_345_678.9],
      ["$1,000 USDT", 1000],
    ] as const) {
      const o = parseMoney(text);
      expect(o.ok && o.value, text).toBe(value);
    }
  });

  it("REFUSES a comma used for cents rather than reading 2,50 as 250", () => {
    for (const text of ["2,50", "0,5", "1,25", "12,5", "1.250,50", "1,2500", ",250", "1,,250", "250,", "1,25,000"]) {
      const o = parseMoney(text);
      expect(o.ok, `${text} must be refused`).toBe(false);
      expect(o.ok === false && o.why).toBe(COMMA_FOR_CENTS);
    }
    expect(COMMA_FOR_CENTS).toBe("Use a dot for cents, like 2.50");
  });

  it("takes an amount still being typed into a form", () => {
    expect(parseMoney("2.")).toEqual({ok: true, value: 2});
    expect(parseMoney(".5")).toEqual({ok: true, value: 0.5});
  });
});

describe("a file becoming lines", () => {
  it("parses the template it hands out", () => {
    const f = parseRunFile(RUN_TEMPLATE, ASSET);
    expect(f.headerDropped).toBe(true);
    expect(f.good).toHaveLength(2);
    expect(f.bad).toHaveLength(0);
    expect(f.total).toBe(65_000_000n); // $25 + $40
  });

  it("carries the split through", () => {
    const f = parseRunFile(`${B},40,Shipped the indexer,10`, ASSET);
    const v = f.good[0]!.verdict;
    expect(v.ok && v.value.cash).toBe(10_000_000n);
    expect(v.ok && v.value.swapAmount).toBe(30_000_000n);
  });

  it("holds a bad row IN PLACE, with the rule it broke, and keeps the good ones", () => {
    const f = parseRunFile(
      [
        `${A},25,Design review`,
        `0xnope,30,Bad address`,
        `${B},notanumber,Bad amount`,
        `${A},15,`,
        `${B},20,Shipped it`,
      ].join("\n"),
      ASSET,
    );

    expect(f.good.map((r) => r.lineNumber)).toEqual([1, 5]);
    expect(f.bad.map((r) => r.lineNumber)).toEqual([2, 3, 4]);
    expect(f.total).toBe(45_000_000n); // only the good rows

    const byLine = (n: number) => f.bad.find((r) => r.lineNumber === n)!;
    expect(byLine(2).verdict.ok === false && byLine(2).verdict).toMatchObject({ok: false});
    expect((byLine(3).verdict as {why: string}).why).toMatch(/not an amount/);
    expect((byLine(4).verdict as {why: string}).why).toMatch(/carries a reason/);
  });

  it("holds a row with a comma for cents in place, rather than paying a hundred times it", () => {
    const f = parseRunFile(`${A},"2,50",Design review\n${B},"1,250.50",Shipped it`, ASSET);
    expect(f.bad.map((r) => r.lineNumber)).toEqual([1]);
    expect((f.bad[0]!.verdict as {why: string}).why).toBe(COMMA_FOR_CENTS);
    expect(f.good.map((r) => r.lineNumber)).toEqual([2]);
    expect(f.total).toBe(1_250_500_000n); // $1,250.50, and not a cent of the refused row
  });

  it("numbers rows the way a spreadsheet does, counting the header", () => {
    const f = parseRunFile(`address,amount,reason\n${A},25,Design review`, ASSET);
    expect(f.good[0]!.lineNumber).toBe(2);
  });

  it("does not mistake an address for a header", () => {
    const f = parseRunFile(`${A},25,Design review`, ASSET);
    expect(f.headerDropped).toBe(false);
    expect(f.good).toHaveLength(1);
  });

  it("ignores blank lines and a trailing newline", () => {
    const f = parseRunFile(`${A},25,One\n\n\n${B},30,Two\n`, ASSET);
    expect(f.rows).toHaveLength(2);
    expect(f.total).toBe(55_000_000n);
  });

  it("handles CRLF, which is what a spreadsheet on Windows exports", () => {
    const f = parseRunFile(`${A},25,One\r\n${B},30,Two\r\n`, ASSET);
    expect(f.good).toHaveLength(2);
    expect(f.bad).toHaveLength(0);
  });

  it("sums exactly, with no float in the middle", () => {
    const f = parseRunFile(
      [`${A},0.1,a`, `${B},0.2,b`, `${A},0.3,c`].join("\n"),
      ASSET,
    );
    expect(f.total).toBe(600_000n);
  });

  it("refuses a row paying the stablecoin with itself", () => {
    const f = parseRunFile(`${A},25,Design review`, STABLE.address);
    expect(f.bad).toHaveLength(1);
    expect((f.bad[0]!.verdict as {why: string}).why).toMatch(/cannot also be what it buys/);
  });

  it("reports an empty file as empty rather than as a run of nothing", () => {
    const f = parseRunFile("", ASSET);
    expect(f.rows).toHaveLength(0);
    expect(f.total).toBe(0n);
    expect(f.tooMany).toBeNull();
  });
});

describe("the size of one run", () => {
  const people = (n: number) => Array.from({length: n}, (_, i) => `${A},1,Line ${i + 1}`).join("\n");

  it("is capped where the RPC still lets a wallet estimate the gas", () => {
    // 413,063 gas a line, measured; rpc.xlayer.tech refuses eth_call above 50M gas.
    expect(MAX_RUN_LINES).toBe(100);
    expect(MAX_RUN_LINES * 413_063).toBeLessThan(50_000_000);
    expect(Math.floor(50_000_000 / 413_063)).toBe(121);
  });

  it("takes a file of exactly the limit", () => {
    const f = parseRunFile(people(MAX_RUN_LINES), ASSET);
    expect(f.good).toHaveLength(MAX_RUN_LINES);
    expect(f.tooMany).toBeNull();
  });

  it("refuses one person more, in words, and says how to split it", () => {
    const f = parseRunFile(people(MAX_RUN_LINES + 1), ASSET);
    expect(f.tooMany).toBe(
      "One run can pay at most 100 people, and this file has 101. Split it into 2 files of 100 or fewer.",
    );
    expect(parseRunFile(people(250), ASSET).tooMany).toMatch(/has 250\. Split it into 3 files/);
  });

  it("counts only the people it would pay, not the lines that need fixing", () => {
    const f = parseRunFile(`${people(MAX_RUN_LINES)}\n0xnope,1,Bad address`, ASSET);
    expect(f.bad).toHaveLength(1);
    expect(f.tooMany).toBeNull();
  });
});

describe("a pay link in place of an address", () => {
  // What /me hands a person, checksummed, and the domain they will paste it from.
  const LINK = `https://warrant.world${payLinkPath(A)}`;

  it("reads the link /me hands out as the wallet in it", () => {
    expect(recipientFromCell(LINK).toLowerCase()).toBe(A);
    const f = parseRunFile(`${LINK},5,Found the confusing button`, ASSET);
    expect(f.bad).toHaveLength(0);
    expect(f.good[0]!.recipient.toLowerCase()).toBe(A);
    expect(f.total).toBe(5_000_000n);
  });

  it("takes it without the scheme, with a trailing slash, or as @0x…", () => {
    for (const cell of [`warrant.world/@${A}`, `https://warrant.world/@${A}/`, `@${A}`, `  @${B}  `]) {
      expect([A, B]).toContain(recipientFromCell(cell).toLowerCase());
    }
  });

  it("leaves a plain address exactly as it was", () => {
    expect(recipientFromCell(A)).toBe(A);
    expect(recipientFromCell(` ${B} `)).toBe(B);
  });

  it("REFUSES anything else rather than hunting for an address inside it", () => {
    for (const cell of [
      `https://warrant.world/receipt/${A}`, // a receipt is not a person
      `https://warrant.world/@${A}/@${B}`, // two wallets: whose?
      `pay me at warrant.world/@${A}`, // a sentence, not a link
      `https://warrant.world/@${A.slice(0, 41)}`, // one character short
      `mailto:x@${A}`,
    ]) {
      const f = parseRunFile(`${cell},5,note`, ASSET);
      expect(f.good, cell).toHaveLength(0);
      expect(f.bad[0]!.recipient, cell).toBe(cell);
    }
  });

  it("still holds a link whose address fails its checksum, with the reason", () => {
    // A checksummed address with one letter's case flipped: the shape of a mistyped character.
    const good = payLinkPath(A).slice(2); // drop "/@"
    const i = good.search(/[a-f]/i);
    const flipped = good.slice(0, i) + (good[i] === good[i]!.toUpperCase() ? good[i]!.toLowerCase() : good[i]!.toUpperCase()) + good.slice(i + 1);
    const f = parseRunFile(`https://warrant.world/@${flipped},5,note`, ASSET);
    expect(f.good).toHaveLength(0);
    const v = f.bad[0]!.verdict;
    expect(!v.ok && v.why).toMatch(/checksum/);
  });
});
