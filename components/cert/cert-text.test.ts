/**
 * What a certificate says in each state it can be in: a specimen, issued and pending,
 * vesting, sealed, cancelled, fully vested and closed. Every sentence is built from the data
 * alone, so each state's words are pinned here.
 */
import {describe, expect, it} from "vitest";
import {
  certificateLabel,
  certNumber,
  costText,
  lengthWords,
  purchaseLine,
  routeLine,
  scheduleLine,
  sealState,
  SEAL_WORDS,
  shortAddress,
  unitsText,
  whenLabel,
} from "./cert-text";
import type {CertificateData} from "./types";

const DAY = 86_400;
const START = Date.UTC(2026, 8, 24, 12, 0, 0) / 1000; // 24 Sep 2026, 12:00 UTC

const base: CertificateData = {
  id: 1,
  recipient: "0x7c1E5a2B9d04F3aC61e8B2d7F0c9A4E13b5D9aB2",
  grantor: "0x3fA9000000000000000000000000000000041c0a",
  asset: {symbol: "SPYx", name: "S&P 500 xStock", address: "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48", decimals: 18},
  units: 1_303_249_999_999_999_999n,
  stableCost: 1_000_000_000n,
  unitPriceUsd: "767.34",
  route: ["USD₮0", "USDG", "wSPYx", "SPYx"],
  start: START,
  cliffSeconds: 182 * DAY,
  durationSeconds: 730 * DAY,
  tipBps: 50,
  sealed: false,
  revoked: false,
  closed: false,
  tx: null,
};

describe("the number, the recipient and the units", () => {
  it("is the grant id in six digits, and 000000 on a specimen", () => {
    expect(certNumber(1)).toBe("000001");
    expect(certNumber(42)).toBe("000042");
    expect(certNumber(7, true)).toBe("000000");
  });

  it("shortens as the design does, first four and last four", () => {
    expect(shortAddress("0x7c1E5a2B9d04F3aC61e8B2d7F0c9A4E13b5D9aB2")).toBe("0x7c1E…9aB2");
  });

  it("shows units at four places, rounded down, and a dash while unknown", () => {
    expect(unitsText(base)).toBe("1.3032");
    expect(unitsText({...base, units: null})).toBe("—");
    expect(costText(999_999n)).toBe("$0.99");
  });
});

describe("line one: what was bought", () => {
  it("says the cost, the venue and the price when all are known", () => {
    expect(purchaseLine(base)).toBe("S&P 500 xStock, bought for $1,000.00 USDT through OKX DEX at $767.34 a unit.");
  });

  it("leaves out the price when there is none, or when asked to", () => {
    expect(purchaseLine({...base, unitPriceUsd: null})).toBe("S&P 500 xStock, bought for $1,000.00 USDT through OKX DEX.");
    expect(purchaseLine(base, {withPrice: false})).toBe("S&P 500 xStock, bought for $1,000.00 USDT through OKX DEX.");
  });

  it("on a specimen with no quote yet, says when it will be bought", () => {
    expect(purchaseLine({...base, units: null})).toBe("S&P 500 xStock, bought through OKX DEX when it is issued.");
  });

  it("while the opening is being recorded, claims no cost", () => {
    expect(purchaseLine({...base, stableCost: null})).toBe("S&P 500 xStock, bought through OKX DEX.");
  });

  it("prints the route only when there is one", () => {
    expect(routeLine(base.route)).toBe("USD₮0 → USDG → wSPYx → SPYx");
    expect(routeLine([])).toBeNull();
    expect(routeLine(["SPYx"])).toBeNull();
  });
});

describe("line two: the schedule, in every state", () => {
  it("names the length and the cliff", () => {
    expect(scheduleLine(base)).toBe("Vests every second over 2 years. Nothing unlocks before the cliff on 25 Mar 2027.");
  });

  it("says when there is no cliff", () => {
    expect(scheduleLine({...base, cliffSeconds: 0})).toBe("Vests every second over 2 years, with no cliff.");
  });

  it("tells a short grant in hours and clock times", () => {
    expect(scheduleLine({...base, cliffSeconds: 0, durationSeconds: 7200})).toBe("Vests every second over 2 hours, with no cliff.");
    expect(scheduleLine({...base, cliffSeconds: 1800, durationSeconds: 7200})).toBe(
      "Vests every second over 2 hours. Nothing unlocks before the cliff on 12:30 UTC.",
    );
    expect(whenLabel(START, 7200)).toBe("12:00 UTC");
    expect(whenLabel(START, 730 * DAY)).toBe("24 Sep 2026");
  });

  it("says what a cancel did, and what closing means", () => {
    expect(scheduleLine({...base, revoked: true})).toBe("Cancelled by the grantor. What had vested stays theirs; the rest went back.");
    expect(scheduleLine({...base, closed: true})).toBe("Fully vested and released. Every unit it held is in their wallet.");
    expect(scheduleLine({...base, revoked: true, closed: true})).toMatch(/^Cancelled by the grantor, and everything that had vested/);
  });

  it("says lengths as a person would", () => {
    expect(lengthWords(4 * 365 * DAY + DAY)).toBe("4 years");
    expect(lengthWords(182 * DAY)).toBe("6 months");
    expect(lengthWords(45 * DAY)).toBe("45 days");
    expect(lengthWords(90 * 60)).toBe("90 minutes");
    expect(lengthWords(3600)).toBe("1 hour");
  });
});

describe("the seal", () => {
  const now = START + DAY;

  it("is pressed only when the escrow says sealed", () => {
    expect(sealState({...base, sealed: true}, {now})).toBe("sealed");
    expect(sealState({...base, sealed: true}, {now, sealPending: true})).toBe("sealed");
  });

  it("is an outline otherwise, saying what is still possible", () => {
    expect(sealState(base, {now})).toBe("revocable");
    expect(sealState(base, {now, sealPending: true})).toBe("pending");
    expect(sealState({...base, revoked: true}, {now})).toBe("cancelled");
    expect(sealState({...base, closed: true}, {now})).toBe("closed");
    expect(sealState(base, {now: START + 731 * DAY})).toBe("vested");
    expect(SEAL_WORDS.revocable).toMatchObject({a: "Revocable", b: "until sealed"});
    expect(SEAL_WORDS.pending).toMatchObject({a: "To be sealed", b: "after issuing"});
  });
});

describe("the certificate's accessible name", () => {
  it("reads the whole certificate in one sentence, and marks a specimen", () => {
    expect(certificateLabel({...base, sealed: true}, false)).toBe(
      "Certificate of grant No. 000001: 0x7c1E5a2B9d04F3aC61e8B2d7F0c9A4E13b5D9aB2 is granted 1.3032 SPYx. " +
        "Vests every second over 2 years. Nothing unlocks before the cliff on 25 Mar 2027. Sealed and irrevocable.",
    );
    expect(certificateLabel({...base, recipient: null}, true)).toMatch(/^Specimen certificate No\. 000000: their wallet address/);
  });
});
