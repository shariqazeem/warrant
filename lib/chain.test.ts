/**
 * THE FALLBACK TRANSPORT, AGAINST REAL HTTP.
 *
 * Two local servers play the primary and the fallback endpoint, so viem's own `fallback` and
 * `http` transports run exactly as they do against X Layer: the retries, the move to the
 * second endpoint, and the shape of the error that reaches `attempt()` and `isThrottle`.
 * Every refusal carries `Retry-After: 0`, which viem honours, so viem's own backoff costs no
 * time here while the number of tries is still counted. The pair's backoff after "over rate
 * limit" is real (250, 500, 1000 ms), so the tests that exhaust it take under two seconds.
 */
import {createServer, type Server} from "node:http";
import type {AddressInfo} from "node:net";
import {BaseError, ContractFunctionRevertedError, createPublicClient, encodeErrorResult} from "viem";
import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {rpcEndpoints, transport, xLayer} from "./chain";
import {attempt, isThrottle} from "./outcome";
import {grantEscrowAbi} from "./payroll-abi";

type Reply = {status: number; body: (id: unknown) => unknown; text?: string};

const answer = (result: unknown): Reply => ({status: 200, body: (id) => ({jsonrpc: "2.0", id, result})});
// What rpc.xlayer.tech says when it throttles: HTTP 429 and JSON-RPC -32016.
const throttled: Reply = {
  status: 429,
  body: (id) => ({jsonrpc: "2.0", id, error: {code: -32016, message: "over rate limit"}}),
};
// The same refusal some endpoints send with HTTP 200.
const throttledIn200: Reply = {...throttled, status: 200};
// A refusal with no JSON-RPC body at all, which viem retries by itself.
const bare429: Reply = {status: 429, body: () => null, text: "Too Many Requests"};
// What both endpoints said for grant(999999) on the live escrow, 24 Sep 2026.
const noSuchGrant: Reply = {
  status: 200,
  body: (id) => ({
    jsonrpc: "2.0",
    id,
    error: {
      code: 3,
      message: "execution reverted",
      data: encodeErrorResult({abi: grantEscrowAbi, errorName: "NoSuchGrant"}),
    },
  }),
};

function endpoint() {
  const state = {reply: answer("0x"), hits: 0, url: "", server: null as Server | null};
  state.server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      state.hits += 1;
      const id = (JSON.parse(raw) as {id?: unknown}).id;
      const {status, body, text} = state.reply;
      res.writeHead(status, {"content-type": text ? "text/plain" : "application/json", "retry-after": "0"});
      res.end(text ?? JSON.stringify(body(id)));
    });
  });
  return state;
}

const primary = endpoint();
const second = endpoint();
const ESCROW = "0x5a5af2d85e46b56e8f6de73d273eea9e868c71dc";

beforeAll(async () => {
  for (const e of [primary, second]) {
    await new Promise<void>((r) => e.server!.listen(0, "127.0.0.1", r));
    e.url = `http://127.0.0.1:${(e.server!.address() as AddressInfo).port}`;
  }
  process.env.NEXT_PUBLIC_XLAYER_RPC = primary.url;
  process.env.XLAYER_RPC_FALLBACK = second.url;
});

afterAll(async () => {
  for (const e of [primary, second]) await new Promise((r) => e.server!.close(r));
});

beforeEach(() => {
  primary.hits = 0;
  second.hits = 0;
});

const count = () =>
  createPublicClient({chain: xLayer, transport: transport()}).readContract({
    address: ESCROW,
    abi: grantEscrowAbi,
    functionName: "grantCount",
  });

const SEVEN = `0x${"0".repeat(63)}7`;

describe("rpcEndpoints", () => {
  it("reads the environment when asked, and falls back to the public endpoints when it is blank", () => {
    const saved = {p: process.env.NEXT_PUBLIC_XLAYER_RPC, f: process.env.XLAYER_RPC_FALLBACK};
    process.env.NEXT_PUBLIC_XLAYER_RPC = "  ";
    delete process.env.XLAYER_RPC_FALLBACK;
    expect(rpcEndpoints()).toEqual({primary: "https://rpc.xlayer.tech", fallback: "https://xlayerrpc.okx.com"});
    process.env.NEXT_PUBLIC_XLAYER_RPC = saved.p;
    process.env.XLAYER_RPC_FALLBACK = saved.f;
    expect(rpcEndpoints()).toEqual({primary: primary.url, fallback: second.url});
  });
});

describe("transport", () => {
  it("asks the primary, and only the primary, when it answers", async () => {
    primary.reply = answer(SEVEN);
    second.reply = answer(`0x${"0".repeat(64)}`);
    expect(await count()).toBe(7n);
    expect([primary.hits, second.hits]).toEqual([1, 0]);
  });

  it("moves to the fallback at once when the primary says over rate limit", async () => {
    primary.reply = throttled;
    second.reply = answer(SEVEN);
    expect(await count()).toBe(7n);
    expect([primary.hits, second.hits]).toEqual([1, 1]);
  });

  it("retries a bare HTTP 429 three times with backoff before moving on", async () => {
    primary.reply = bare429;
    second.reply = answer(SEVEN);
    expect(await count()).toBe(7n);
    expect([primary.hits, second.hits]).toEqual([4, 1]);
  });

  it("backs off and asks the pair again when both refuse, and one of them relents", async () => {
    primary.reply = throttled;
    second.reply = throttled;
    setTimeout(() => (second.reply = answer(SEVEN)), 100);
    expect(await count()).toBe(7n);
    expect(primary.hits).toBe(2);
    expect(second.hits).toBe(2);
  });

  it("gives up after four tries at each endpoint, not thirty-two", async () => {
    primary.reply = throttled;
    second.reply = throttled;
    await expect(count()).rejects.toThrow();
    expect([primary.hits, second.hits]).toEqual([4, 4]);

    primary.hits = second.hits = 0;
    primary.reply = bare429;
    second.reply = bare429;
    await expect(count()).rejects.toThrow();
    expect([primary.hits, second.hits]).toEqual([4, 4]);
  });

  it("does not ask the fallback to repeat a revert: the contract has answered", async () => {
    primary.reply = noSuchGrant;
    second.reply = answer(SEVEN);
    const err = await count().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BaseError);
    const reverted = (err as BaseError).walk((e) => e instanceof ContractFunctionRevertedError);
    expect(reverted).toBeInstanceOf(ContractFunctionRevertedError);
    expect((reverted as ContractFunctionRevertedError).data?.errorName).toBe("NoSuchGrant");
    expect([primary.hits, second.hits]).toEqual([1, 0]);
  });
});

describe("isThrottle through the fallback transport", () => {
  it("knows X Layer's refusal from both endpoints as a throttle, and attempt() says so", async () => {
    primary.reply = throttled;
    second.reply = throttled;
    const err = await count().catch((e: unknown) => e);
    expect(isThrottle(err)).toBe(true);

    const r = await attempt("the number of grants", async () => {
      throw err;
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toContain("refusing reads right now");
  });

  it("knows the -32016 refusal sent with HTTP 200, and a bare HTTP 429", async () => {
    primary.reply = throttledIn200;
    second.reply = throttledIn200;
    expect(isThrottle(await count().catch((e: unknown) => e))).toBe(true);

    primary.reply = bare429;
    second.reply = bare429;
    expect(isThrottle(await count().catch((e: unknown) => e))).toBe(true);
  });

  it("does not call a revert a throttle", async () => {
    primary.reply = noSuchGrant;
    const err = await count().catch((e: unknown) => e);
    expect(isThrottle(err)).toBe(false);
  });
});
