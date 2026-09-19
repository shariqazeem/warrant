/**
 * WHAT IS MISSING, AND WHAT A DEPLOY COSTS, READ FROM THE CHAIN.
 *
 * Every line below is either read live or reported as absent. Nothing is assumed from a
 * document, including this repository's own documents — the addresses in `docs/brief.md`
 * are checked here against what the chain actually answers.
 */
import {createPublicClient, erc20Abi, formatEther, formatUnits, http} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {readFileSync, existsSync} from "node:fs";
import {loadEnv} from "../lib/env";
import {xLayer, STABLE, DEFAULT_ASSET} from "../lib/chain";
import {credentials} from "../lib/okx";

const tick = (b: boolean) => (b ? "ok  " : "MISS");

async function main() {
  const env = loadEnv();
  console.log(`\nWARRANT PREFLIGHT   ${new Date().toISOString()}`);
  console.log("=".repeat(78));

  console.log(`\nENVIRONMENT`);
  console.log(`  ${tick(env.found)} .env.local            ${env.found ? env.path : "not present"}`);
  const creds = credentials();
  console.log(`  ${tick(creds.ok)} OKX credentials       ${creds.ok ? "all three present" : creds.why}`);
  const payer = process.env.PAYER_PRIVATE_KEY?.trim();
  const keeper = process.env.KEEPER_PRIVATE_KEY?.trim();
  console.log(`  ${tick(!!payer)} PAYER_PRIVATE_KEY     ${payer ? "present" : "absent; nothing can be paid"}`);
  console.log(`  ${tick(!!keeper)} KEEPER_PRIVATE_KEY    ${keeper ? "present" : "absent; grants will not vest"}`);

  console.log(`\nCHAIN`);
  const rpc = createPublicClient({chain: xLayer, transport: http()});
  let chainId = 0;
  try {
    chainId = await rpc.getChainId();
    const block = await rpc.getBlockNumber();
    const gasPrice = await rpc.getGasPrice();
    console.log(`  ${tick(chainId === 196)} chain id              ${chainId} ${chainId === 196 ? "" : "(expected 196)"}`);
    console.log(`  ok   head block           ${block}`);
    console.log(`  ok   gas price            ${formatUnits(gasPrice, 9)} gwei`);

    console.log(`\nASSETS, read from the chain rather than from docs/brief.md`);
    for (const t of [STABLE, DEFAULT_ASSET]) {
      const [symbol, decimals] = await Promise.all([
        rpc.readContract({address: t.address, abi: erc20Abi, functionName: "symbol"}),
        rpc.readContract({address: t.address, abi: erc20Abi, functionName: "decimals"}),
      ]);
      const agrees = symbol === t.symbol && decimals === t.decimals;
      console.log(
        `  ${tick(agrees)} ${t.address}  chain says ${symbol}/${decimals}, ` +
          `lib/chain.ts says ${t.symbol}/${t.decimals}`,
      );
    }

    if (payer) {
      const account = privateKeyToAccount((payer.startsWith("0x") ? payer : `0x${payer}`) as `0x${string}`);
      const [okb, usdt] = await Promise.all([
        rpc.getBalance({address: account.address}),
        rpc.readContract({address: STABLE.address, abi: erc20Abi, functionName: "balanceOf", args: [account.address]}),
      ]);
      console.log(`\nPAYER  ${account.address}`);
      console.log(`  ${tick(okb > 0n)} OKB for gas           ${formatEther(okb)}`);
      console.log(`  ${tick(usdt > 0n)} USDT to pay with      ${formatUnits(usdt, STABLE.decimals)}`);

      const artifact = "contracts/out/Payroll.sol/Payroll.json";
      if (existsSync(artifact)) {
        const {bytecode} = JSON.parse(readFileSync(artifact, "utf8")) as {bytecode: {object: string}};
        // 21000 base, plus 16 gas per non-zero byte and 4 per zero byte, plus 200/byte to store.
        const bytes = Buffer.from(bytecode.object.replace(/^0x/, ""), "hex");
        let calldataGas = 21_000;
        for (const b of bytes) calldataGas += b === 0 ? 4 : 16;
        const estimate = BigInt(calldataGas + bytes.length * 200);
        const cost = estimate * gasPrice;
        console.log(`\nDEPLOY, Payroll.sol`);
        console.log(`  ok   bytecode            ${bytes.length} bytes`);
        console.log(`  ok   gas, approx         ${estimate}`);
        console.log(`  ${tick(okb > cost)} cost, approx          ${formatEther(cost)} OKB`);
      } else {
        console.log(`\nDEPLOY  no artifact yet. Run: cd contracts && forge build`);
      }
    }
  } catch (err) {
    console.log(`  MISS chain                 ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log(`\nCONTRACTS`);
  for (const k of ["NEXT_PUBLIC_PAYROLL_ADDRESS", "NEXT_PUBLIC_GRANT_ESCROW_ADDRESS"]) {
    const v = process.env[k]?.trim();
    console.log(`  ${tick(!!v)} ${k.padEnd(34)}${v || "not deployed"}`);
  }

  console.log(`\n${"=".repeat(78)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
