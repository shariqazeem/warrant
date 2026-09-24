/**
 * OKX CONNECT MUST BE ABLE TO SIGN WHAT /me AND A PERMIT ASK IT TO.
 *
 * Every choice signed at /me through OKX Wallet by QR failed with "An unknown RPC error
 * occurred", because the typed data went to OKX Connect as the JSON string viem sends and
 * OKX Connect takes only an object. These tests capture the request viem really makes, put
 * it through okxParams, and hold the result to OKX Connect's own rule, copied below from
 * @okxconnect/universal-provider 1.9.1.
 */
import {createWalletClient, custom, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {describe, expect, it} from "vitest";
import {choiceTypedData, ZERO_ADDRESS} from "../../lib/choice";
import {STABLE, xLayer} from "../../lib/chain";
import {PERMIT_TYPES} from "../../lib/permit";
import {okxParams} from "./okx-params";

const PERSON = privateKeyToAccount(`0x${"42".repeat(32)}`).address;
const TSLAX = "0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0";

/**
 * OKX Connect 1.9.1, adaptArray, eth_signTypedData_v4 — the checks a request must pass
 * before it reaches the phone, in its own order and words. After them it sends
 * JSON.stringify(params[1]) to the wallet.
 */
function okxConnectAccepts(params: unknown, sessionAddress: string): {ok: true; sent: string} | {ok: false; why: string} {
  const isRecord = (e: unknown) => typeof e === "object" && e !== null && !Array.isArray(e);
  if (!Array.isArray(params)) return {ok: false, why: "not an array"};
  if (params.length > 2) return {ok: false, why: "Request params only Support one data"};
  if (params.length === 0) return {ok: false, why: "Request params is nil"};
  if (params.length === 2) {
    const address = params[0];
    if (!address || typeof address !== "string") return {ok: false, why: "Request params address error , not string"};
    if (address.toLowerCase() !== sessionAddress.toLowerCase()) return {ok: false, why: "Request params address error, not equal"};
    if (!isRecord(params[1])) return {ok: false, why: "Request params message data error"};
  }
  try {
    return {ok: true, sent: JSON.stringify(params[1])};
  } catch {
    return {ok: false, why: "Request params call JSON.stringify() failed"};
  }
}

/** The eth_signTypedData_v4 request viem makes for these typed data, exactly as it makes it. */
async function viemRequest(typed: Parameters<ReturnType<typeof createWalletClient>["signTypedData"]>[0]) {
  let seen: {method: string; params: unknown} | null = null;
  const client = createWalletClient({
    chain: xLayer,
    transport: custom({
      async request({method, params}) {
        seen = {method, params};
        return `0x${"11".repeat(65)}` as Hex;
      },
    }),
  });
  await client.signTypedData(typed);
  return seen as unknown as {method: string; params: [string, string]};
}

describe("a choice signed at /me, through OKX Connect", () => {
  const typed = {
    account: PERSON,
    ...choiceTypedData({person: PERSON, stockBps: 5_000, asset: TSLAX, eligible: true, issuedAt: 1_790_191_091}),
  };

  it("was refused as viem sends it — the bug, kept on record", async () => {
    const req = await viemRequest(typed);
    expect(req.method).toBe("eth_signTypedData_v4");
    expect(typeof req.params[1]).toBe("string");
    expect(okxConnectAccepts(req.params, PERSON)).toEqual({ok: false, why: "Request params message data error"});
  });

  it("is accepted once adapted, and the phone receives exactly the typed data viem built", async () => {
    const req = await viemRequest(typed);
    const verdict = okxConnectAccepts(okxParams(req.method, req.params), PERSON);
    expect(verdict.ok).toBe(true);
    // Byte for byte: the wallet hashes what the server will verify, or the signature is refused.
    expect(verdict.ok && verdict.sent).toBe(req.params[1]);
  });

  it("works for a choice of all dollars too", async () => {
    const dollars = {
      account: PERSON,
      ...choiceTypedData({person: PERSON, stockBps: 0, asset: ZERO_ADDRESS, eligible: false, issuedAt: 1_790_191_091}),
    };
    const req = await viemRequest(dollars);
    const verdict = okxConnectAccepts(okxParams(req.method, req.params), PERSON);
    expect(verdict.ok && verdict.sent).toBe(req.params[1]);
  });
});

describe("a permit, through OKX Connect", () => {
  it("is accepted, bigints and all, so a payment is one signature again", async () => {
    const req = await viemRequest({
      account: PERSON,
      domain: {name: "USD₮0", version: "1", chainId: xLayer.id, verifyingContract: STABLE.address},
      types: PERMIT_TYPES,
      primaryType: "Permit",
      message: {
        owner: PERSON,
        spender: "0xd9d0000000000000000000000000000000000001",
        value: 2_000_000n,
        nonce: 0n,
        deadline: 1_790_200_000n,
      },
    });
    const verdict = okxConnectAccepts(okxParams(req.method, req.params), PERSON);
    expect(verdict.ok && verdict.sent).toBe(req.params[1]);
  });
});

describe("every other request", () => {
  it("passes through untouched", () => {
    const tx = [{from: PERSON, to: PERSON, data: "0x"}];
    expect(okxParams("eth_sendTransaction", tx)).toBe(tx);
    const already = [PERSON, {domain: {}, types: {}, primaryType: "X", message: {}}];
    expect(okxParams("eth_signTypedData_v4", already)).toBe(already);
    expect(okxParams("eth_signTypedData_v4", [PERSON, "not json"])).toEqual([PERSON, "not json"]);
  });
});
