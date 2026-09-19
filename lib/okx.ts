/**
 * THE ROUTE. Every swap Warrant makes is calldata this file fetched from the OKX DEX
 * aggregator and handed, unopened, to the transaction the payer signs.
 *
 * Two rules live here and nowhere else.
 *
 * 1. THIS FILE IS SERVER ONLY. The four credentials sign the request, and a signed
 *    request is a bearer token. Nothing here may be imported into a client component.
 * 2. NOTHING HERE DECIDES ANYTHING. The payer chose the asset, the amount and the
 *    reason. This asks the aggregator for a price and a path, and returns what it said.
 *    If the aggregator holds, we hold, with its sentence on it.
 */
import {createHmac} from "node:crypto";
import {held, ok, type Outcome} from "./outcome";

const BASE = process.env.OKX_API_BASE ?? "https://web3.okx.com";
const CHAIN_ID = "196";

/** The aggregator's own rate limits bite before anything else does. One call at a time,
 *  with a floor between them, is the discipline that keeps a probe from being throttled
 *  into meaningless holds. */
const MIN_GAP_MS = Number(process.env.OKX_MIN_GAP_MS ?? 220);
let gate: Promise<void> = Promise.resolve();
let lastCall = 0;

function pace<T>(fn: () => Promise<T>): Promise<T> {
  const run = gate.then(async () => {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  gate = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export type Credentials = {key: string; secret: string; passphrase: string};

/** Reads the four credentials, and says plainly which one is missing. */
export function credentials(): Outcome<Credentials> {
  const key = process.env.OKX_API_KEY?.trim();
  const secret = process.env.OKX_API_SECRET?.trim();
  const passphrase = process.env.OKX_API_PASSPHRASE?.trim();

  const missing = [
    ["OKX_API_KEY", key],
    ["OKX_API_SECRET", secret],
    ["OKX_API_PASSPHRASE", passphrase],
  ]
    .filter(([, v]) => !v)
    .map(([n]) => n);

  if (missing.length > 0) {
    return held(
      `The OKX DEX aggregator refuses every request without credentials. ` +
        `Missing from .env.local: ${missing.join(", ")}.`,
    );
  }
  return ok({key: key!, secret: secret!, passphrase: passphrase!});
}

/**
 * OK-ACCESS-SIGN is base64(hmac-sha256(secret, timestamp + method + path + body)), where
 * `path` carries the query string exactly as it is sent. Build the URL once and sign the
 * same string you request, or the signature is for a URL nobody asked for.
 */
export function sign(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body = "",
): string {
  return createHmac("sha256", secret)
    .update(timestamp + method.toUpperCase() + path + body)
    .digest("base64");
}

function headers(c: Credentials, method: string, path: string, body = ""): Record<string, string> {
  const timestamp = new Date().toISOString();
  return {
    "OK-ACCESS-KEY": c.key,
    "OK-ACCESS-SIGN": sign(c.secret, timestamp, method, path, body),
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": c.passphrase,
    "Content-Type": "application/json",
  };
}

type Envelope<T> = {code: string; msg: string; data: T};

/** One GET, signed, paced, and returned as an Outcome carrying the aggregator's own words. */
async function get<T>(path: string, query: Record<string, string>): Promise<Outcome<T>> {
  const creds = credentials();
  if (!creds.ok) return creds;

  const qs = new URLSearchParams(query).toString();
  const full = qs ? `${path}?${qs}` : path;

  return pace(async () => {
    let res: Response;
    try {
      res = await fetch(`${BASE}${full}`, {
        method: "GET",
        headers: headers(creds.value, "GET", full),
      });
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      return held<T>(`Could not reach the OKX aggregator (${why}).`);
    }

    const text = await res.text();
    let body: Envelope<T>;
    try {
      body = JSON.parse(text) as Envelope<T>;
    } catch {
      return held<T>(`The aggregator answered ${res.status} with something that is not JSON.`);
    }

    if (body.code !== "0") {
      return held<T>(`The aggregator refused: ${body.msg || "no reason given"} (code ${body.code}).`);
    }
    if (!body.data) return held<T>("The aggregator answered with no data.");
    return ok(body.data);
  });
}

// --- the shapes the aggregator returns, narrowed to what Warrant reads -----------------

export type TokenInfo = {
  tokenContractAddress: string;
  tokenSymbol: string;
  tokenName?: string;
  decimals: string;
  tokenUnitPrice?: string;
};

export type QuoteRouterResult = {
  fromTokenAmount: string;
  toTokenAmount: string;
  estimateGasFee?: string;
  priceImpactPercentage?: string;
  fromToken: {tokenContractAddress: string; tokenSymbol: string; decimals: string; tokenUnitPrice?: string};
  toToken: {tokenContractAddress: string; tokenSymbol: string; decimals: string; tokenUnitPrice?: string};
  dexRouterList?: Array<{router: string; routerPercent: string}>;
  quoteCompareList?: Array<{dexName: string; amountOut: string}>;
};

export type SwapResult = {
  routerResult: QuoteRouterResult;
  tx: {
    from: string;
    to: string;
    data: string;
    value: string;
    gas?: string;
    gasPrice?: string;
    maxPriorityFeePerGas?: string;
    minReceiveAmount?: string;
    slippage?: string;
  };
};

export type ApproveResult = {
  data: string;
  dexContractAddress: string;
  gasLimit?: string;
  gasPrice?: string;
};

// --- the calls ---------------------------------------------------------------------------

/** Every token the aggregator will quote on X Layer. The starting list for finding depth. */
export function allTokens(): Promise<Outcome<TokenInfo[]>> {
  return get<TokenInfo[]>("/api/v5/dex/aggregator/all-tokens", {chainId: CHAIN_ID});
}

/** The liquidity sources the aggregator routes through on this chain. */
export function liquiditySources(): Promise<Outcome<Array<{id: string; name: string}>>> {
  return get("/api/v5/dex/aggregator/get-liquidity", {chainId: CHAIN_ID});
}

/**
 * A price and a path. `amount` is in the from-token's smallest unit — USDT is 6 decimals
 * on X Layer, so one dollar is "1000000". Getting this wrong is the easiest way to read a
 * number that means nothing.
 */
export async function quote(args: {
  from: string;
  to: string;
  amount: string;
}): Promise<Outcome<QuoteRouterResult>> {
  const res = await get<QuoteRouterResult[]>("/api/v5/dex/aggregator/quote", {
    chainId: CHAIN_ID,
    amount: args.amount,
    fromTokenAddress: args.from,
    toTokenAddress: args.to,
  });
  if (!res.ok) return res;
  const first = res.value[0];
  if (!first) return held("The aggregator returned no route for this pair.");
  return ok(first);
}

/**
 * The calldata itself, plus the router address to send it to.
 *
 * `swapReceiverAddress` is the reason this product works: the asset can be delivered to the
 * person being paid rather than to whoever signed. `userWalletAddress` is the contract that
 * holds the stablecoin at the moment of the swap — Payroll, not the payer.
 */
export function swap(args: {
  from: string;
  to: string;
  amount: string;
  slippage: string;
  userWalletAddress: string;
  receiver: string;
}): Promise<Outcome<SwapResult[]>> {
  return get<SwapResult[]>("/api/v5/dex/aggregator/swap", {
    chainId: CHAIN_ID,
    amount: args.amount,
    fromTokenAddress: args.from,
    toTokenAddress: args.to,
    slippage: args.slippage,
    userWalletAddress: args.userWalletAddress,
    swapReceiverAddress: args.receiver,
  });
}

/**
 * The address that actually pulls the token. On OKX this is a separate approval proxy, not
 * the router, and approving the wrong one of the two is a silent failure that looks like a
 * broken route. Payroll stores it as `routerSpender` at deploy time.
 */
export function approveTransaction(args: {
  token: string;
  amount: string;
}): Promise<Outcome<ApproveResult[]>> {
  return get<ApproveResult[]>("/api/v5/dex/aggregator/approve-transaction", {
    chainId: CHAIN_ID,
    tokenContractAddress: args.token,
    approveAmount: args.amount,
  });
}
