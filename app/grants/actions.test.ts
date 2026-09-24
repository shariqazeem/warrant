/**
 * BUILDING A GRANT, WITH THE AGGREGATOR AND THE CHAIN STOOD IN.
 *
 * The part worth holding here is whose decision a grant's stock is. A person who signed a
 * choice has said which stock they want: a grant in it follows their choice, a grant in any
 * other stock is the company's decision — and either way the terms carry exactly the stock
 * the form showed. And the route kept for a certificate is taken on trust from nobody.
 */
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {encodeAbiParameters, encodeEventTopics, getAddress, keccak256, toHex, zeroHash, type AbiEvent} from "viem";
import {grantEscrowAbi} from "../../lib/payroll-abi";

const {okx, person, rpc} = vi.hoisted(() => ({
  okx: {routerOf: vi.fn(), swap: vi.fn()},
  person: {choiceFor: vi.fn()},
  rpc: {getTransactionReceipt: vi.fn()},
}));

vi.mock("../../lib/okx", () => okx);
vi.mock("../../lib/person", () => person);
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {...actual, createPublicClient: () => rpc};
});

const ESCROW = "0xb238d76499616377abd4908e46f29c7ce50908d1";
const ROUTER = "0x7c5bEE2a8091C3ef39072f64F18Fac913060AEaF";
const STABLE = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";
const SPYX = "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48";
const NVDAX = "0xc845b2894dbddd03858fd2d643b4ef725fe0849d";
const PERSON = "0x7c1E5a2B9d04F3aC61e8B2d7F0c9A4E13b5D9aB2".toLowerCase();
const PAYER = "0x3fa9000000000000000000000000000000041c0a";
const USDG = "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8";
const TX = `0x${"12".repeat(32)}` as const;

let actions: typeof import("./actions");
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "warrant-grant-actions-"));
  process.env.WARRANT_DB_PATH = join(dir, "test.db");
  process.env.NEXT_PUBLIC_GRANT_ESCROW_ADDRESS = ESCROW;
  actions = await import("./actions");
});

afterAll(() => rmSync(dir, {recursive: true, force: true}));

/** An aggregator answer for $500 of `to`, shaped as V6 returns it. */
function answer(to: string, symbol: string, overrides: {minReceiveAmount?: string} = {}) {
  const tok = (tokenContractAddress: string, tokenSymbol: string, decimal: string) => ({
    tokenContractAddress,
    tokenSymbol,
    decimal,
  });
  return {
    ok: true as const,
    value: [
      {
        routerResult: {
          chainIndex: "196",
          fromTokenAmount: "500000000",
          toTokenAmount: "651600000000000000",
          fromToken: tok(STABLE, "USDT", "6"),
          toToken: tok(to, symbol, "18"),
          priceImpactPercent: "-0.05",
          dexRouterList: [
            {dexProtocol: {dexName: "OkieSwap V3", percent: "100"}, fromToken: tok(STABLE, "USDT", "6"), toToken: tok(USDG, "USDG", "6")},
            {dexProtocol: {dexName: "Uniswap V3", percent: "100"}, fromToken: tok(USDG, "USDG", "6"), toToken: tok("0x0000000000000000000000000000000000000abc", `w${symbol}`, "18")},
            {dexProtocol: {dexName: "xStocks wrap V2", percent: "100"}, fromToken: tok("0x0000000000000000000000000000000000000abc", `w${symbol}`, "18"), toToken: tok(to, symbol, "18")},
          ],
        },
        tx: {
          from: ESCROW,
          to: ROUTER,
          data: "0xdeadbeef",
          value: "0",
          minReceiveAmount: overrides.minReceiveAmount ?? "645084000000000000",
        },
      },
    ],
  };
}

const request = (over: Partial<import("./actions").GrantRequest> = {}) => ({
  beneficiary: PERSON,
  asset: SPYX,
  usd: 500,
  cliffSeconds: 181 * 86_400,
  durationSeconds: 731 * 86_400,
  tipBps: 50,
  ...over,
});

const chose = (asset: string, stockBps = 10_000) => ({
  person: PERSON,
  stockBps,
  asset,
  eligible: true,
  issuedAt: 1_790_000_000,
  signature: "0x",
  savedAt: 1_790_000_000,
});

beforeEach(() => {
  okx.routerOf.mockReset().mockResolvedValue({ok: true, value: ROUTER});
  okx.swap.mockReset().mockImplementation(async (a: {to: string}) =>
    answer(a.to, a.to.toLowerCase() === NVDAX ? "NVDAx" : "SPYx"),
  );
  person.choiceFor.mockReset().mockReturnValue(null);
  rpc.getTransactionReceipt.mockReset();
});

describe("buildGrant", () => {
  it("prices a grant before anyone is named, and builds no terms for it", async () => {
    const out = await actions.buildGrant(request({beneficiary: ""}));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.terms).toBeNull();
    expect(out.value.minUnits).toBe("645084000000000000");
    expect(out.value.expectedUnits).toBe("651600000000000000");
    expect(out.value.route).toEqual(["USD₮0", "USDG", "wSPYx", "SPYx"]);
    expect(out.value.hops).toEqual(["OkieSwap V3", "Uniswap V3", "xStocks wrap V2"]);
    expect(out.value.decidedBy).toBe("company");
    expect(out.value.choice).toBeNull();
    expect(person.choiceFor).not.toHaveBeenCalled();
  });

  it("buys into the escrow, never into the person's wallet", async () => {
    await actions.buildGrant(request());
    expect(okx.swap).toHaveBeenCalledWith(
      expect.objectContaining({userWalletAddress: ESCROW, receiver: ESCROW, amount: "500000000", to: SPYX}),
    );
  });

  it("builds the contract's terms, with the aggregator's own floor as the minimum", async () => {
    const out = await actions.buildGrant(request());
    expect(out.ok && out.value.terms).toEqual({
      beneficiary: getAddress(PERSON),
      asset: SPYX,
      stableAmount: "500000000",
      minOut: "645084000000000000",
      start: "0",
      cliff: String(181 * 86_400),
      duration: String(731 * 86_400),
      tipBps: 50,
      reasonHash: zeroHash,
      routerCalldata: "0xdeadbeef",
    });
  });

  it("follows their choice when the grant is in the stock they chose", async () => {
    person.choiceFor.mockReturnValue(chose(NVDAX));
    const out = await actions.buildGrant(request({asset: NVDAX}));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.decidedBy).toBe("their-choice");
    expect(out.value.choice).toMatchObject({asset: NVDAX, symbol: "NVDAx"});
    expect(out.value.terms?.asset).toBe(NVDAX);
  });

  it("says it is the company's decision when it grants another stock, and keeps that stock", async () => {
    person.choiceFor.mockReturnValue(chose(NVDAX));
    const out = await actions.buildGrant(request({asset: SPYX}));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.decidedBy).toBe("company");
    expect(out.value.choice).toMatchObject({asset: NVDAX, symbol: "NVDAx"});
    // The form sent SPYx and showed SPYx; the terms are SPYx. Nothing is swapped behind it.
    expect(out.value.terms?.asset).toBe(SPYX);
    expect(okx.swap).toHaveBeenCalledWith(expect.objectContaining({to: SPYX}));
  });

  it("reads a choice to be paid in dollars as no stock chosen", async () => {
    person.choiceFor.mockReturnValue(chose("0x0000000000000000000000000000000000000000", 0));
    const out = await actions.buildGrant(request());
    expect(out.ok && out.value.choice).toMatchObject({asset: null, symbol: null});
    expect(out.ok && out.value.decidedBy).toBe("company");
  });

  it("carries a future start, and a note's hash", async () => {
    const start = Math.floor(Date.now() / 1000) + 3_600;
    const out = await actions.buildGrant(request({start, reason: "  Founding engineer  "}));
    expect(out.ok && out.value.terms?.start).toBe(String(start));
    expect(out.ok && out.value.terms?.reasonHash).toBe(keccak256(toHex("Founding engineer")));
  });

  it("refuses terms the contract would refuse, before asking for a price", async () => {
    const now = Math.floor(Date.now() / 1000);
    const refusals = [
      request({beneficiary: "0x1234"}),
      request({beneficiary: ESCROW}),
      request({usd: 0}),
      request({asset: STABLE}),
      request({asset: "0x0000000000000000000000000000000000000001"}),
      request({durationSeconds: 0, cliffSeconds: 0}),
      request({durationSeconds: 3651 * 86_400, cliffSeconds: 0}),
      request({durationSeconds: 60, cliffSeconds: 61}),
      request({tipBps: 201}),
      request({start: now - 60}),
      request({reason: "x".repeat(501)}),
    ];
    for (const r of refusals) {
      const out = await actions.buildGrant(r);
      expect(out.ok, JSON.stringify(r)).toBe(false);
    }
    expect(okx.swap).not.toHaveBeenCalled();
  });

  it("refuses a route with no floor", async () => {
    okx.swap.mockResolvedValue(answer(SPYX, "SPYx", {minReceiveAmount: "0"}));
    const out = await actions.buildGrant(request());
    expect(out.ok).toBe(false);
  });

  it("passes on the aggregator's refusal in its own words", async () => {
    okx.swap.mockResolvedValue({ok: false, why: "Prices are busy right now — try again in a moment."});
    const out = await actions.buildGrant(request());
    expect(out).toEqual({ok: false, why: "Prices are busy right now — try again in a moment."});
  });
});

/** A receipt holding one GrantOpened from `address`, for grant `id` in `asset`. */
function receiptWith(id: bigint, asset: string, address = ESCROW) {
  const event = grantEscrowAbi.find((x) => x.type === "event" && x.name === "GrantOpened") as AbiEvent;
  const topics = encodeEventTopics({
    abi: [event],
    eventName: "GrantOpened",
    args: {id, payer: PAYER, beneficiary: PERSON},
  } as never);
  const data = encodeAbiParameters(
    event.inputs.filter((i) => !i.indexed),
    [asset, 651600000000000000n, 651600000000000000n, 500000000n, 1_790_000_000n, 0n, 7200n, 50, zeroHash],
  );
  return {
    status: "success",
    logs: [{address, topics, data, blockNumber: 1n, transactionHash: TX, logIndex: 0, blockHash: TX, transactionIndex: 0, removed: false}],
  };
}

describe("rememberRoute", () => {
  const ROUTE = ["USD₮0", "USDG", "wSPYx", "SPYx"];

  it("keeps the route of a transaction that opened a grant in this escrow, once", async () => {
    rpc.getTransactionReceipt.mockResolvedValue(receiptWith(1n, SPYX));
    expect(await actions.rememberRoute(TX, ROUTE)).toEqual({ok: true, value: {kept: true}});
    expect(await actions.rememberRoute(TX, ROUTE)).toEqual({ok: true, value: {kept: false}});
    const {routeFor} = await import("../../lib/db");
    expect(routeFor(TX)).toEqual(ROUTE);
  });

  it("refuses what is not a hash, or not a printable route, without reading the chain", async () => {
    expect((await actions.rememberRoute("0x12", ROUTE)).ok).toBe(false);
    expect((await actions.rememberRoute(TX, ["SPYx"])).ok).toBe(false);
    expect((await actions.rememberRoute(TX, ["USDT", "SPYx"])).ok).toBe(false);
    expect((await actions.rememberRoute(TX, ["USD₮0", "<b>", "SPYx"])).ok).toBe(false);
    expect(rpc.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it("refuses a transaction that opened no grant here", async () => {
    const other = `0x${"34".repeat(32)}`;
    rpc.getTransactionReceipt.mockResolvedValue(receiptWith(2n, SPYX, "0x0000000000000000000000000000000000000def"));
    expect((await actions.rememberRoute(other, ROUTE)).ok).toBe(false);
  });

  it("refuses a route that does not end in the stock the grant holds", async () => {
    const other = `0x${"56".repeat(32)}`;
    rpc.getTransactionReceipt.mockResolvedValue(receiptWith(3n, NVDAX));
    expect((await actions.rememberRoute(other, ROUTE)).ok).toBe(false);
  });

  it("says so when the chain has not shown the transaction yet", async () => {
    const other = `0x${"78".repeat(32)}`;
    rpc.getTransactionReceipt.mockRejectedValue(new Error("not found"));
    const out = await actions.rememberRoute(other, ROUTE);
    expect(out.ok).toBe(false);
    expect(rpc.getTransactionReceipt).toHaveBeenCalledTimes(3);
  }, 10_000);
});
