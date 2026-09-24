/**
 * X Layer, and the two addresses everything on this rail is denominated in.
 *
 * Every constant below was read from the chain on 19 September 2026, not copied from a
 * blog post. `npm run preflight` reads them again and refuses to agree quietly.
 */
import {defineChain, fallback, http, type Transport} from "viem";
import {defaultAsset} from "./assets";

export const xLayer = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: {name: "OKB", symbol: "OKB", decimals: 18},
  rpcUrls: {default: {http: [process.env.NEXT_PUBLIC_XLAYER_RPC ?? "https://rpc.xlayer.tech"]}},
  blockExplorers: {default: {name: "OKLink", url: "https://www.oklink.com/x-layer"}},
});

/**
 * USDT on X Layer: the USD₮0 token. SIX decimals, not eighteen. One dollar is 1_000_000n.
 *
 * X Layer has two USDTs, and both call themselves USDT in a wallet. USD₮0 (Tether's current
 * token, 106.6M on X Layer on 23 Sep 2026) is the one OKX Wallet's swap hands out; the older
 * bridged USDT (3.3M) is what the first deployment used, and a payer holding USD₮0 saw "$0".
 * The contracts were redeployed on USD₮0 the same day. Shown to people as "USDT".
 */
export const STABLE = {
  address: (process.env.NEXT_PUBLIC_STABLE ??
    "0x779Ded0c9e1022225f8E0630b35a9b54bE713736") as `0x${string}`,
  symbol: "USDT",
  decimals: 6,
} as const;

/** The other USDT on X Layer. Warrant does not pay with it; a wallet holding it is told so. */
export const OTHER_STABLE = {
  address: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d" as `0x${string}`,
  label: "the older USDT",
  decimals: 6,
} as const;

/**
 * The asset a payment defaults to. xStocks are EIGHTEEN decimals, unlike the stablecoin's
 * six. The list of what Warrant will pay in lives in lib/assets.ts and nowhere else; this
 * re-exports the default so older call sites keep working.
 */
export const DEFAULT_ASSET = defaultAsset();

export const EXPLORER_TX = (hash: string) => `https://www.oklink.com/x-layer/tx/${hash}`;
export const EXPLORER_ADDRESS = (a: string) => `https://www.oklink.com/x-layer/address/${a}`;

/**
 * THE PUBLIC RPC CAPS eth_getLogs AT 100 BLOCKS. Measured on 23 September 2026 against
 * rpc.xlayer.tech: a 2,000-block range is refused with "block range greater than 100 max".
 * It used to accept more, and the indexer was built against a fork that has no limit at
 * all, which is how the wider window survived until the live check found it.
 *
 * The indexer pages in windows of exactly this size. A paid endpoint with a higher cap can
 * raise it through XLAYER_LOG_WINDOW; the default must be what the public endpoint allows.
 */
export const LOG_WINDOW = BigInt(process.env.XLAYER_LOG_WINDOW ?? 100);

/**
 * THE TWO ENDPOINTS, in the order they are asked. Read when a client is made, not when this
 * module loads, so a script that loads its env file after its imports still gets its own.
 *
 * Both answered eth_chainId 0xc4 (196), open CORS, and the same 100-block eth_getLogs cap,
 * checked on 24 September 2026. XLAYER_RPC_FALLBACK is server-only on purpose: a browser
 * bundle cannot see it, so the wallet falls back to OKX's public endpoint, never to a
 * private URL that would be printed into the page.
 */
export function rpcEndpoints(): {primary: string; fallback: string} {
  return {
    primary: process.env.NEXT_PUBLIC_XLAYER_RPC?.trim() || "https://rpc.xlayer.tech",
    fallback: process.env.XLAYER_RPC_FALLBACK?.trim() || "https://xlayerrpc.okx.com",
  };
}

/**
 * EVERY CLIENT'S TRANSPORT. The primary, then the fallback, each retried with backoff
 * (250, 500, 1000 ms, or what a Retry-After header asks for) on a timeout, a 5xx or a bare
 * HTTP 429.
 *
 * X LAYER'S THROTTLE IS NOT ONE OF THOSE. It answers HTTP 429 WITH a JSON-RPC body, code
 * -32016 "over rate limit", and viem (2.56) reads the body, drops the status, and does not
 * retry that code. So the fallback moves to the second endpoint at once, which is the
 * fastest cure; and when both have refused, `patient` backs off and asks the pair again,
 * three times. At most eight requests for one read, whatever the failure.
 *
 * The fallback itself does not retry (`retryCount: 0`). Its default is three, and retries
 * multiply: four rounds of four tries on two endpoints is thirty-two requests for one read,
 * which is how a throttled endpoint gets throttled harder.
 *
 * A revert is not retried and not re-asked of the second endpoint (viem throws it straight
 * through), so "this grant does not exist" still reads as the contract's answer. Errors pass
 * through unwrapped, so `isThrottle` recognises a refusal from either endpoint.
 */
export function transport() {
  const {primary, fallback: second} = rpcEndpoints();
  const each = {retryCount: 3, retryDelay: 250} as const;
  return patient(fallback([http(primary, each), http(second, each)], {rank: false, retryCount: 0}));
}

/** The one refusal viem does not retry on its own: JSON-RPC -32016, "over rate limit". */
function overRateLimit(err: unknown): boolean {
  for (let e = err, depth = 0; typeof e === "object" && e !== null && depth < 5; depth++) {
    if ((e as {code?: unknown}).code === -32016) return true;
    e = (e as {cause?: unknown}).cause;
  }
  return false;
}

/** Ask again after 250, 500 and 1000 ms when every endpoint said "over rate limit". */
function patient<T extends Transport>(inner: T): T {
  return ((options: Parameters<T>[0]) => {
    const made = inner(options);
    const request = (async (args: unknown, opts: unknown) => {
      for (let tries = 0; ; tries++) {
        try {
          return await (made.request as (a: unknown, o: unknown) => Promise<unknown>)(args, opts);
        } catch (err) {
          if (tries >= 3 || !overRateLimit(err)) throw err;
          await new Promise((r) => setTimeout(r, 250 * 2 ** tries));
        }
      }
    }) as typeof made.request;
    return {...made, request};
  }) as T;
}
