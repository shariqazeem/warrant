/**
 * WHICH xSTOCKS ON X LAYER CAN ACTUALLY BE PAID IN.
 *
 * `docs/plan.md` step 0 says establish this before anything else, and it is the one
 * question the brief left unverified. This asks the aggregator itself, twice:
 *
 *   1. every token it will quote on chain 196;
 *   2. for each xStock among them, a ladder of real quotes from one dollar upward.
 *
 * DEPTH HERE MEANS ONE THING ONLY: the largest payment the aggregator would still route
 * without the price moving more than the threshold. It is not pool TVL and it is not a
 * market cap. It is measured, it is labelled, and the raw quotes are written to disk so
 * any figure on a page can be traced back to the answer that produced it.
 *
 * AND A DEPTH CUT SHORT BY THROTTLING IS NOT A DEPTH. The first run of this probe reported
 * "$100" for every asset on the chain, which was not liquidity — it was the rate limit,
 * landing on the $1,000 rung every time and being recorded as if the aggregator had said
 * no. A rung that was never actually quoted is now marked as such and reported as a FLOOR,
 * "at least $100", never as a measurement.
 */
import {mkdirSync, writeFileSync} from "node:fs";
import {loadEnv} from "../lib/env";
import {allTokens, quote, liquiditySources, credentials, type TokenInfo} from "../lib/okx";
import {STABLE} from "../lib/chain";
import {isOk} from "../lib/outcome";

/** Dollars, smallest first. A pair that will not quote a single dollar has no route at all. */
const LADDER = [1, 10, 100, 1_000, 10_000];

/** Above this, the payment is moving the price rather than taking it. */
const MAX_IMPACT_PCT = Number(process.env.PROBE_MAX_IMPACT ?? 1.0);

type Rung = {
  usd: number;
  ok: boolean;
  out?: string;
  unitPrice?: number;
  impactPct?: number;
  why?: string;
  /** True when this rung was never actually quoted because the aggregator was throttling. */
  throttled?: boolean;
};

/** The sentence lib/okx.ts holds with once it has exhausted its retries. */
const isThrottle = (why: string) => /rate-limiting this run/i.test(why);

type Depth = {
  symbol: string;
  name?: string;
  address: string;
  decimals: number;
  rungs: Rung[];
  /** The largest rung that quoted within the impact threshold. Zero means no usable route. */
  depthUsd: number;
  /** True when the ladder ran out of quotes rather than out of liquidity, so the real
   *  depth is AT LEAST depthUsd and this run does not know what it is. */
  depthIsFloor: boolean;
  /** Price per whole unit at the smallest rung that quoted. */
  referencePrice?: number;
};

const usdt = (dollars: number) => String(BigInt(Math.round(dollars * 1e6)));

function isXStock(t: TokenInfo): boolean {
  const name = (t.tokenName ?? "").toLowerCase();
  if (name.includes("xstock")) return true;
  // Fallback for a listing with no name: wNVDAx, wTSLAx, NVDAx.
  return /^w?[A-Z0-9.]{1,7}x$/.test(t.tokenSymbol);
}

async function ladder(token: TokenInfo): Promise<Depth> {
  const decimals = Number(token.decimals);
  const rungs: Rung[] = [];
  let depthUsd = 0;
  let depthIsFloor = false;
  let referencePrice: number | undefined;

  for (const usd of LADDER) {
    const q = await quote({from: STABLE.address, to: token.tokenContractAddress, amount: usdt(usd)});

    if (!isOk(q)) {
      const throttled = isThrottle(q.why);
      rungs.push({usd, ok: false, why: q.why, throttled});
      // A refusal ends the ladder either way, but only a real one ends it as an ANSWER.
      if (throttled) depthIsFloor = true;
      break;
    }

    const out = BigInt(q.value.toTokenAmount);
    if (out === 0n) {
      rungs.push({usd, ok: false, why: "The aggregator quoted zero out."});
      break;
    }

    const whole = Number(out) / 10 ** decimals;
    const unitPrice = usd / whole;
    referencePrice ??= unitPrice;

    // The aggregator reports impact when it can. When it does not, derive it from how far
    // this rung's unit price has drifted from the smallest rung that quoted.
    const reported = q.value.priceImpactPercent;
    const impactPct =
      reported !== undefined && reported !== "" && !Number.isNaN(Number(reported))
        ? Math.abs(Number(reported))
        : ((unitPrice - referencePrice) / referencePrice) * 100;

    rungs.push({usd, ok: true, out: out.toString(), unitPrice, impactPct});

    if (impactPct <= MAX_IMPACT_PCT) depthUsd = usd;
    else break;
  }

  return {
    symbol: token.tokenSymbol,
    name: token.tokenName,
    address: token.tokenContractAddress,
    decimals,
    rungs,
    depthUsd,
    depthIsFloor,
    referencePrice,
  };
}

async function main() {
  const env = loadEnv();
  console.log(env.found ? `Read ${env.path}` : `No .env.local at ${env.path}`);

  const creds = credentials();
  if (!isOk(creds)) {
    console.error(`\nHELD. ${creds.why}`);
    console.error(`\nNothing routes until those exist. Create them in the OKX developer`);
    console.error(`portal, then run this again.`);
    process.exit(1);
  }

  console.log(`\nAsking the OKX aggregator what it can quote on X Layer, chain 196.\n`);

  const sources = await liquiditySources();
  if (isOk(sources)) {
    console.log(`Liquidity sources on this chain: ${sources.value.length}`);
    console.log(sources.value.map((s) => s.name).join(", "));
  } else {
    console.log(`Liquidity sources held: ${sources.why}`);
  }

  const tokens = await allTokens();
  if (!isOk(tokens)) {
    console.error(`\nHELD. ${tokens.why}`);
    process.exit(1);
  }

  const all = tokens.value;
  const candidates = all.filter(isXStock);
  console.log(`\n${all.length} tokens quotable. ${candidates.length} of them look like xStocks.`);

  if (candidates.length === 0) {
    console.error(`\nNo xStock is quotable on chain 196 right now. That is the answer, and`);
    console.error(`it is the one that decides the asset. Do not build around it.`);
    process.exit(1);
  }

  // One cheap dollar-sized quote each, to find the ones with any route at all, before
  // spending a full ladder on tokens that have none.
  console.log(`\nProbing a one-dollar route for each, to find the ones with any route...`);
  const live: TokenInfo[] = [];
  let neverAsked = 0;
  for (const t of candidates) {
    const q = await quote({from: STABLE.address, to: t.tokenContractAddress, amount: usdt(1)});
    if (isOk(q)) {
      const routed = BigInt(q.value.toTokenAmount) > 0n;
      process.stdout.write(routed ? "." : "x");
      if (routed) live.push(t);
    } else if (isThrottle(q.why)) {
      // Not a verdict on this token. Ladder it anyway rather than record a false negative.
      process.stdout.write("?");
      neverAsked++;
      live.push(t);
    } else {
      process.stdout.write("x");
    }
  }
  console.log(`\n\n${live.length} of ${candidates.length} to ladder.`);
  if (neverAsked > 0) {
    console.log(`${neverAsked} were never actually quoted at a dollar; they are laddered anyway.`);
  }

  if (live.length === 0) {
    console.error(`\nNone of them route. Stop here and say so.`);
    process.exit(1);
  }

  console.log(`\nLaddering ${LADDER.map((d) => `$${d.toLocaleString()}`).join(", ")} on each.\n`);
  const depths: Depth[] = [];
  for (const t of live) {
    const d = await ladder(t);
    depths.push(d);
    const price = d.referencePrice ? `$${d.referencePrice.toFixed(2)}/unit` : "no price";
    const depth = `${d.depthIsFloor ? ">=" : "  "}$${String(d.depthUsd).padStart(6)}`;
    console.log(`  ${d.symbol.padEnd(10)} ${depth}   ${price.padEnd(18)} ${d.address}`);
  }

  depths.sort((a, b) => b.depthUsd - a.depthUsd || (a.symbol < b.symbol ? -1 : 1));
  const top = depths.filter((d) => d.depthUsd > 0).slice(0, 3);

  console.log(`\n${"=".repeat(78)}`);
  console.log(`THE THREE DEEPEST, measured as the largest quote within ${MAX_IMPACT_PCT}% impact`);
  console.log(`${"=".repeat(78)}`);
  if (top.length === 0) {
    console.log(`None. Every xStock moved more than ${MAX_IMPACT_PCT}% on a one-dollar quote.`);
  }
  for (const [i, d] of top.entries()) {
    console.log(`\n${i + 1}. ${d.symbol}${d.name ? `  — ${d.name}` : ""}`);
    console.log(`   address   ${d.address}`);
    console.log(`   decimals  ${d.decimals}`);
    console.log(
      d.depthIsFloor
        ? `   depth     AT LEAST $${d.depthUsd.toLocaleString()} — the ladder ran out of ` +
            `quotes, not out of liquidity`
        : `   depth     $${d.depthUsd.toLocaleString()} at or under ${MAX_IMPACT_PCT}% impact`,
    );
    if (d.referencePrice) console.log(`   price     $${d.referencePrice.toFixed(4)} per unit, from the $1 quote`);
    for (const r of d.rungs) {
      const line = r.ok
        ? `$${String(r.usd).padStart(6)}  ->  ${r.out} units, impact ${r.impactPct!.toFixed(3)}%`
        : `$${String(r.usd).padStart(6)}  ->  ${r.throttled ? "NEVER QUOTED: " : "held: "}${r.why}`;
      console.log(`     ${line}`);
    }
  }

  mkdirSync("var", {recursive: true});
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `var/probe-${stamp}.json`;
  writeFileSync(
    path,
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        chainId: 196,
        stable: STABLE,
        maxImpactPct: MAX_IMPACT_PCT,
        ladderUsd: LADDER,
        quotableTokens: all.length,
        xStockCandidates: candidates.length,
        routedAtOneDollar: live.length,
        depths,
      },
      null,
      2,
    ),
  );
  console.log(`\nEvery quote behind those figures: ${path}`);
}

main().catch((err) => {
  console.error(`\nThe probe fell over: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
