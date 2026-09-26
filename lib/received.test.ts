import {describe, expect, it} from "vitest";
import {received} from "./received";

const SPYX = {assetDecimals: 18, assetSymbol: "SPYx"};

describe("what a payslip line delivered", () => {
  it("names the stock", () => {
    expect(received({...SPYX, assetAmount: 2_603_000_000_000_000n, cashAmount: 0n})).toEqual({main: "0.002603 SPYx", plus: null});
  });

  it("names the stock and the dollars when the person chose a split", () => {
    expect(received({...SPYX, assetAmount: 4_461_769_558_947_834n, assetSymbol: "NVDAx", cashAmount: 1_000_000n})).toEqual({
      main: "0.004461 NVDAx",
      plus: "+ $1 USD₮0",
    });
  });

  it("never prints a line paid all in dollars as zero of something", () => {
    // A company's page printed this line as "0.0000 USD₮0".
    expect(received({...SPYX, assetAmount: 0n, assetSymbol: "USD₮0", cashAmount: 2_000_000n})).toEqual({main: "$2 USD₮0", plus: null});
  });
});
