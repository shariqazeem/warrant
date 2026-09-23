/**
 * AM I READY TO SPEND REAL MONEY? Everything read from the chain, nothing assumed.
 *
 * This is the gate before mainnet. It answers one question with one word at the end, and
 * every line above it says what was checked and what the chain actually said — including
 * checking this repository's own documents against the chain rather than trusting them.
 */
import {createPublicClient, erc20Abi, formatEther, formatUnits, http} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {readFileSync, existsSync} from "node:fs";
import {loadEnv} from "../lib/env";
import {xLayer, STABLE} from "../lib/chain";
import {ASSETS, MEASURED_AT, defaultAsset} from "../lib/assets";
import {credentials, supportedChain, swap} from "../lib/okx";
import {resolveDomain} from "../lib/permit";
import {isOk} from "../lib/outcome";

type Line = {ok: boolean; blocking: boolean; label: string; detail: string};
const lines: Line[] = [];

const say = (ok: boolean, blocking: boolean, label: string, detail: string) => {
  lines.push({ok, blocking, label, detail});
  const mark = ok ? "ok  " : blocking ? "STOP" : "note";
  console.log(`  ${mark} ${label.padEnd(26)} ${detail}`);
};

const head = (t: string) => console.log(`\n${t}`);

async function main() {
  const env = loadEnv();
  console.log(`\nWARRANT PREFLIGHT   ${new Date().toISOString()}`);
  console.log("=".repeat(78));

  head("WHAT IS ON THIS MACHINE");
  say(env.found, true, ".env.local", env.found ? env.path : "not present");
  const creds = credentials();
  say(creds.ok, true, "OKX credentials", creds.ok ? "all three present" : creds.why);

  const payerKey = process.env.PAYER_PRIVATE_KEY?.trim();
  const keeperKey = process.env.KEEPER_PRIVATE_KEY?.trim();
  say(!!payerKey, true, "PAYER_PRIVATE_KEY", payerKey ? "present" : "absent; nothing can be deployed or paid");
  say(!!keeperKey, false, "KEEPER_PRIVATE_KEY", keeperKey ? "present" : "absent; grants still vest, just not automatically");

  head("THE CHAIN");
  const rpc = createPublicClient({chain: xLayer, transport: http()});
  let gasPrice = 0n;
  try {
    const [chainId, block, price] = await Promise.all([
      rpc.getChainId(),
      rpc.getBlockNumber(),
      rpc.getGasPrice(),
    ]);
    gasPrice = price;
    say(chainId === 196, true, "chain id", `${chainId}${chainId === 196 ? " (X Layer)" : " — NOT X LAYER"}`);
    say(true, false, "head block", block.toLocaleString());
    say(true, false, "gas price", `${formatUnits(price, 9)} gwei`);
  } catch (err) {
    say(false, true, "chain", err instanceof Error ? err.message : String(err));
  }

  head("THE ASSETS, read from the chain rather than from any document here");
  const chosen = defaultAsset();
  for (const t of [STABLE, ...ASSETS]) {
    try {
      const [symbol, decimals] = await Promise.all([
        rpc.readContract({address: t.address, abi: erc20Abi, functionName: "symbol"}),
        rpc.readContract({address: t.address, abi: erc20Abi, functionName: "decimals"}),
      ]);
      // The stablecoin is shown as "USDT" but names itself "USD₮0" on chain (Tether's current
      // token on X Layer); either of Tether's names is the right token, anything else is not.
      const names: readonly string[] = t === STABLE ? ["USDT", "USD₮0"] : [t.symbol];
      const agrees = names.includes(symbol) && decimals === t.decimals;
      say(
        agrees,
        true,
        t.symbol,
        `${t.address}  chain says ${symbol}/${decimals}${t.address === chosen.address ? "   <- default" : ""}`,
      );
    } catch {
      say(false, true, t.symbol, `${t.address} did not answer`);
    }
  }
  say(true, false, "depth measured", `${MEASURED_AT} — re-run \`npm run probe\` before submitting`);

  head("THE ROUTE");
  if (creds.ok) {
    const chain = await supportedChain();
    say(isOk(chain), true, "aggregator sees X Layer", isOk(chain) ? `spender ${chain.value.dexTokenApproveAddress}` : chain.why);

    const quote = await swap({
      from: STABLE.address,
      to: chosen.address,
      amount: "1000000",
      slippagePercent: "1",
      userWalletAddress: "0x0000000000000000000000000000000000000001",
      receiver: "0x0000000000000000000000000000000000000001",
    });
    if (isOk(quote) && quote.value[0]) {
      const r = quote.value[0].routerResult;
      const hops = (r.dexRouterList ?? []).map((h) => h.dexProtocol?.dexName).filter(Boolean);
      say(true, true, `$1 -> ${chosen.symbol}`, `${formatUnits(BigInt(r.toTokenAmount), chosen.decimals)}, via ${hops.join(" -> ")}`);
      say(true, false, "router", quote.value[0].tx.to);
    } else {
      say(false, true, `$1 -> ${chosen.symbol}`, isOk(quote) ? "no route returned" : quote.why);
    }

    const domain = await resolveDomain();
    say(isOk(domain), false, "permit", isOk(domain)
      ? `${JSON.stringify(domain.value.name)} v${domain.value.version} — a run is ONE transaction`
      : `${domain.why} Payments still work; they take two transactions.`);
  } else {
    say(false, true, "aggregator", "skipped, no credentials");
  }

  head("THE WALLET");
  if (payerKey) {
    const account = privateKeyToAccount((payerKey.startsWith("0x") ? payerKey : `0x${payerKey}`) as `0x${string}`);
    const [okb, usdt] = await Promise.all([
      rpc.getBalance({address: account.address}),
      rpc.readContract({address: STABLE.address, abi: erc20Abi, functionName: "balanceOf", args: [account.address]}),
    ]);
    console.log(`  --   address                  ${account.address}`);

    // What a full bring-up actually costs, priced at the gas price read above.
    const deployGas = 1_271_640n + 1_687_344n;
    const runGas = 20n * 511_653n;
    const need = (deployGas + runGas + 3n * 700_000n) * gasPrice;

    say(okb > need, true, "OKB for gas",
      `${formatEther(okb)} held, about ${formatEther(need)} needed for a full bring-up`);
    say(usdt > 0n, true, "USDT to pay with",
      `${formatUnits(usdt, STABLE.decimals)} held`);
  } else {
    say(false, true, "wallet", "skipped, no key");
  }

  head("THE CONTRACTS");
  for (const [k, what] of [
    ["NEXT_PUBLIC_PAYROLL_ADDRESS", "Payroll"],
    ["NEXT_PUBLIC_GRANT_ESCROW_ADDRESS", "GrantEscrow"],
  ] as const) {
    const v = process.env[k]?.trim();
    if (!v) {
      say(false, false, what, "not deployed yet — this is what `npm run deploy` fixes");
      continue;
    }
    try {
      const code = await rpc.getBytecode({address: v as `0x${string}`});
      const size = code ? (code.length - 2) / 2 : 0;
      say(size > 0, true, what, `${v}  ${size.toLocaleString()} bytes`);
    } catch {
      say(false, true, what, `${v} could not be read`);
    }
  }

  const artifacts = ["contracts/out/Payroll.sol/Payroll.json", "contracts/out/GrantEscrow.sol/GrantEscrow.json"];
  say(artifacts.every((a) => existsSync(a)), true, "built artifacts",
    artifacts.every((a) => existsSync(a))
      ? artifacts.map((a) => `${(JSON.parse(readFileSync(a, "utf8")).bytecode.object.length - 2) / 2} bytes`).join(", ")
      : "run: cd contracts && forge build");

  // --- the verdict ---------------------------------------------------------------------
  const blockers = lines.filter((l) => l.blocking && !l.ok);
  console.log(`\n${"=".repeat(78)}`);
  if (blockers.length === 0) {
    console.log(`READY. Nothing is blocking a mainnet deploy.\n`);
    console.log(`  npm run deploy        both contracts`);
    console.log(`  npm run prove-route -- --usd=1 --send   one real payment, from an EOA\n`);
  } else {
    console.log(`NOT READY. ${blockers.length} thing${blockers.length === 1 ? "" : "s"} blocking:\n`);
    for (const b of blockers) console.log(`  - ${b.label}: ${b.detail}`);
    console.log();
  }
  process.exit(blockers.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nPreflight fell over: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
