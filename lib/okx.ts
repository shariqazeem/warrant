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
 *
 * V6, NOT V5. V5 answers code 50050 "being deprecated" to a correctly signed request, so
 * every path here is /api/v6. Four things renamed on the way across and each one is a
 * silent wrong answer rather than an error if it is missed:
 *
 *     chainId               ->  chainIndex            (V5 shape returns code 51000)
 *     slippage              ->  slippagePercent       ("1" means one percent, not "0.01")
 *     priceImpactPercentage ->  priceImpactPercent
 *     decimals              ->  decimal               INSIDE a quote's from/to token only;
 *                                                     all-tokens still says `decimals`
 */
import {createHmac} from "node:crypto";
import {held, ok, type Outcome} from "./outcome";

const BASE = process.env.OKX_API_BASE ?? "https://web3.okx.com";
const CHAIN_INDEX = "196";

/**
 * THE AGGREGATOR'S RATE LIMIT BITES BEFORE ANYTHING ELSE DOES, and it bites in the worst
 * possible way: code 50011 comes back looking exactly like an answer. A probe that treats
 * it as one measures its own throttling and reports it as liquidity.
 *
 * So: one call at a time, a floor of a second between them, and 50011 is RETRIED rather
 * than returned. A caller never sees a throttle as a result.
 */
const MIN_GAP_MS = Number(process.env.OKX_MIN_GAP_MS ?? 1100);
const THROTTLE_RETRIES = Number(process.env.OKX_THROTTLE_RETRIES ?? 4);

/**
 * A CALL THAT NEVER ANSWERS MUST NOT HOLD THE LINE. The queue is one process-wide line, so
 * a single request left hanging would stall every visitor's price behind it, with nothing
 * on screen but "Getting the price…". Each request has a deadline, and missing it is an
 * answer — a hold with a sentence, never a throw.
 */
const REQUEST_TIMEOUT_MS = Number(process.env.OKX_TIMEOUT_MS ?? 15_000);

/**
 * AND THE LINE HAS A LENGTH. At a call a second, the twentieth caller in line already waits
 * twenty seconds for a price. Past that a visitor is told at once, rather than left
 * watching a price that is not coming.
 */
const MAX_WAITING = Number(process.env.OKX_MAX_WAITING ?? 20);

export const BUSY = "Prices are busy right now — try again in a moment.";
export const TIMED_OUT =
  "OKX DEX took too long to answer, so there is no price yet. Try again in a moment.";

/** The aggregator's code for "too many requests". Transient, never an answer. */
const THROTTLED = "50011";

/**
 * One call at a time, at least `gapMs` apart, with at most `maxWaiting` calls in line
 * behind the one running. A call that would join a longer line holds with BUSY at once.
 * Exported so the queue's rules are tested rather than trusted.
 */
export function pacer(gapMs: number, maxWaiting: number) {
  let gate: Promise<void> = Promise.resolve();
  let lastCall = 0;
  /** Admitted and not yet finished: the one running plus everyone waiting behind it. */
  let pending = 0;

  return function pace<T>(fn: () => Promise<Outcome<T>>): Promise<Outcome<T>> {
    if (pending > maxWaiting) return Promise.resolve(held<T>(BUSY));
    pending++;
    const run = gate.then(async () => {
      const wait = lastCall + gapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastCall = Date.now();
      return fn();
    });
    const release = () => {
      pending--;
    };
    gate = run.then(release, release);
    return run;
  };
}

const pace = pacer(MIN_GAP_MS, MAX_WAITING);

/**
 * One request with a deadline, body included: a server can send its headers and then
 * stall. Missing the deadline, or failing to connect at all, holds with a sentence.
 */
export async function fetchText(
  url: string,
  init: RequestInit,
  ms = REQUEST_TIMEOUT_MS,
): Promise<Outcome<{status: number; text: string}>> {
  const signal = AbortSignal.timeout(ms);
  try {
    const res = await fetch(url, {...init, signal});
    const text = await res.text();
    return ok({status: res.status, text});
  } catch (err) {
    if (signal.aborted) return held(TIMED_OUT);
    const why = err instanceof Error ? err.message : String(err);
    return held(`Could not reach the OKX aggregator (${why}).`);
  }
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

/** One GET, signed and paced. A throttle comes back as the bare code for `get` to retry. */
async function getOnce<T>(path: string, query: Record<string, string>): Promise<Outcome<T>> {
  const creds = credentials();
  if (!creds.ok) return creds;

  const qs = new URLSearchParams(query).toString();
  const full = qs ? `${path}?${qs}` : path;

  return pace<T>(async () => {
    // Signed here, at the moment of sending, not when the call joined the line: OKX
    // refuses a timestamp that has gone stale while it waited.
    const res = await fetchText(`${BASE}${full}`, {
      method: "GET",
      headers: headers(creds.value, "GET", full),
    });
    if (!res.ok) return held<T>(res.why);

    let body: Envelope<T>;
    try {
      body = JSON.parse(res.value.text) as Envelope<T>;
    } catch {
      return held<T>(`The aggregator answered ${res.value.status} with something that is not JSON.`);
    }

    if (body.code === THROTTLED) return {ok: false, why: THROTTLED} as const;

    if (body.code !== "0") {
      return held<T>(`The aggregator refused: ${body.msg || "no reason given"} (code ${body.code}).`);
    }
    if (!body.data) return held<T>("The aggregator answered with no data.");
    return ok(body.data);
  });
}

/**
 * One GET, retried through throttling with a widening gap. A throttle that survives every
 * attempt HOLDS saying so in as many words, which is honest and, crucially, is not a
 * sentence any caller can mistake for "no route exists".
 */
async function get<T>(path: string, query: Record<string, string>): Promise<Outcome<T>> {
  for (let attemptNo = 0; ; attemptNo++) {
    const res = await getOnce<T>(path, query);
    if (res.ok || res.why !== THROTTLED) return res;

    if (attemptNo >= THROTTLE_RETRIES) {
      return held<T>(
        "The aggregator is rate-limiting this run, so this pair was never actually " +
          "quoted. This is not an answer about liquidity.",
      );
    }
    await new Promise((r) => setTimeout(r, MIN_GAP_MS * (attemptNo + 2)));
  }
}

// --- the shapes V6 returns, narrowed to what Warrant reads ------------------------------

/** An entry from `all-tokens`. Note `decimals`, plural, unlike a quote's token. */
export type TokenInfo = {
  tokenContractAddress: string;
  tokenSymbol: string;
  tokenName?: string;
  decimals: string;
  tokenLogoUrl?: string;
};

/** A token as it appears INSIDE a quote. Note `decimal`, singular. */
export type QuoteToken = {
  tokenContractAddress: string;
  tokenSymbol: string;
  /** Singular here. Plural on TokenInfo. This is not a typo and it has cost time before. */
  decimal: string;
  tokenUnitPrice?: string;
  isHoneyPot?: boolean;
  taxRate?: string;
};

export type QuoteRouterResult = {
  chainIndex: string;
  fromTokenAmount: string;
  toTokenAmount: string;
  fromToken: QuoteToken;
  toToken: QuoteToken;
  estimateGasFee?: string;
  /** Negative means the price moved against the payer. Read it with Math.abs. */
  priceImpactPercent?: string;
  tradeFee?: string;
  quoteId?: string;
  /** The hops, as contract addresses joined by "--". */
  router?: string;
  dexRouterList?: Array<{
    dexProtocol?: {dexName: string; percent: string};
    fromToken?: QuoteToken;
    toToken?: QuoteToken;
  }>;
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
    /** What the aggregator itself guarantees at the requested slippage. Warrant's `minOut`
     *  is derived from this, so the contract enforces the aggregator's own promise. */
    minReceiveAmount?: string;
    slippagePercent?: string;
  };
};

export type ApproveResult = {
  data: string;
  /** The approval proxy — NOT the router. Approving the router instead is a silent
   *  failure that reads as a broken route. */
  dexContractAddress: string;
  gasLimit?: string;
  gasPrice?: string;
};

export type SupportedChain = {
  chainId: number;
  chainIndex: number;
  chainName: string;
  /** The same address as `ApproveResult.dexContractAddress`; this is the one Payroll
   *  stores as `routerSpender` at deploy time. */
  dexTokenApproveAddress: string;
};

// --- the calls ---------------------------------------------------------------------------

/** Every token the aggregator will quote on X Layer. The starting list for finding depth. */
export function allTokens(): Promise<Outcome<TokenInfo[]>> {
  return get<TokenInfo[]>("/api/v6/dex/aggregator/all-tokens", {chainIndex: CHAIN_INDEX});
}

/** The liquidity sources the aggregator routes through on this chain. */
export function liquiditySources(): Promise<Outcome<Array<{id: string; name: string}>>> {
  return get("/api/v6/dex/aggregator/get-liquidity", {chainIndex: CHAIN_INDEX});
}

/**
 * X Layer as the aggregator sees it, and — the reason this call exists — the approval
 * proxy address that Payroll must be deployed against.
 */
export async function supportedChain(): Promise<Outcome<SupportedChain>> {
  const res = await get<SupportedChain[]>("/api/v6/dex/aggregator/supported/chain", {
    chainIndex: CHAIN_INDEX,
  });
  if (!res.ok) return res;
  const first = res.value[0];
  if (!first) return held("The aggregator does not list X Layer as a supported chain.");
  return ok(first);
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
  const res = await get<QuoteRouterResult[]>("/api/v6/dex/aggregator/quote", {
    chainIndex: CHAIN_INDEX,
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
  /** PERCENT, so "1" is one percent. V5 took a fraction here and V6 does not. */
  slippagePercent: string;
  userWalletAddress: string;
  receiver: string;
}): Promise<Outcome<SwapResult[]>> {
  return get<SwapResult[]>("/api/v6/dex/aggregator/swap", {
    chainIndex: CHAIN_INDEX,
    amount: args.amount,
    fromTokenAddress: args.from,
    toTokenAddress: args.to,
    slippagePercent: args.slippagePercent,
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
  return get<ApproveResult[]>("/api/v6/dex/aggregator/approve-transaction", {
    chainIndex: CHAIN_INDEX,
    tokenContractAddress: args.token,
    approveAmount: args.amount,
  });
}
