/**
 * STEP 1 OF THE PLAN: PROVE THE ROUTE.
 *
 * One script, no UI. Fetch swap calldata from the OKX aggregator for a small amount of
 * USDT into a live xStock, send it from an EOA on X Layer mainnet, and confirm the asset
 * arrives. If this does not work, `docs/plan.md` says stop and say so, and it means it.
 *
 * SPENDS REAL MONEY. It therefore does nothing by default: without `--send` it prints the
 * whole plan, every address and every figure, and exits. Read that output before you add
 * the flag. Nothing here is recoverable once broadcast.
 *
 *   npm run prove-route                      the plan, no transaction
 *   npm run prove-route -- --usd=1           a different size
 *   npm run prove-route -- --asset=0x...     a different xStock
 *   npm run prove-route -- --send            broadcast, for real, on mainnet
 */
import {createPublicClient, createWalletClient, erc20Abi, formatUnits, http, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {loadEnv} from "../lib/env";
import {xLayer, STABLE, DEFAULT_ASSET, EXPLORER_TX} from "../lib/chain";
import {approveTransaction, credentials, swap} from "../lib/okx";
import {isOk} from "../lib/outcome";

const arg = (name: string, fallback?: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

const line = () => console.log("-".repeat(78));

async function main() {
  const env = loadEnv();
  console.log(env.found ? `Read ${env.path}` : `No .env.local at ${env.path}`);

  // --- what we need before we can even ask ------------------------------------------
  const creds = credentials();
  if (!isOk(creds)) {
    console.error(`\nHELD. ${creds.why}`);
    process.exit(1);
  }

  const pk = process.env.PAYER_PRIVATE_KEY?.trim();
  if (!pk) {
    console.error(`\nHELD. PAYER_PRIVATE_KEY is missing from .env.local. The route cannot be`);
    console.error(`proved without a funded X Layer wallet: OKB for gas, USDT to pay with.`);
    process.exit(1);
  }

  const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex);
  const usd = Number(arg("usd", "1"));
  const asset = (arg("asset", DEFAULT_ASSET.address) ?? DEFAULT_ASSET.address) as `0x${string}`;
  // PERCENT: "1" is one percent. V6 renamed this and changed its units.
  const slippagePercent = arg("slippage", "1")!;
  const amount = BigInt(Math.round(usd * 10 ** STABLE.decimals));

  const rpc = createPublicClient({chain: xLayer, transport: http()});
  const wallet = createWalletClient({account, chain: xLayer, transport: http()});

  // --- where we are standing ----------------------------------------------------------
  const [chainId, gas, stableBal, assetBalBefore, assetSymbol, assetDecimals] = await Promise.all([
    rpc.getChainId(),
    rpc.getBalance({address: account.address}),
    rpc.readContract({address: STABLE.address, abi: erc20Abi, functionName: "balanceOf", args: [account.address]}),
    rpc.readContract({address: asset, abi: erc20Abi, functionName: "balanceOf", args: [account.address]}),
    rpc.readContract({address: asset, abi: erc20Abi, functionName: "symbol"}),
    rpc.readContract({address: asset, abi: erc20Abi, functionName: "decimals"}),
  ]);

  line();
  console.log(`Wallet     ${account.address}`);
  console.log(`Chain      ${chainId} ${chainId === 196 ? "(X Layer)" : "— NOT X LAYER. Stop."}`);
  console.log(`OKB        ${formatUnits(gas, 18)}`);
  console.log(`USDT       ${formatUnits(stableBal, STABLE.decimals)}`);
  console.log(`${assetSymbol.padEnd(10)} ${formatUnits(assetBalBefore, assetDecimals)}  (before)`);
  line();

  if (chainId !== 196) process.exit(1);
  if (gas === 0n) {
    console.error(`\nHELD. No OKB. Nothing can be sent without gas.`);
    process.exit(1);
  }
  if (stableBal < amount) {
    console.error(`\nHELD. The wallet holds ${formatUnits(stableBal, STABLE.decimals)} USDT and`);
    console.error(`this run needs ${usd}. Fund it, or pass a smaller --usd.`);
    process.exit(1);
  }

  // --- the spender. Approving the router instead of this is a silent failure. ---------
  const approval = await approveTransaction({token: STABLE.address, amount: amount.toString()});
  if (!isOk(approval)) {
    console.error(`\nHELD. ${approval.why}`);
    process.exit(1);
  }
  const spender = approval.value[0]?.dexContractAddress as `0x${string}` | undefined;
  if (!spender) {
    console.error(`\nHELD. The aggregator did not name an approval contract.`);
    process.exit(1);
  }

  const allowance = await rpc.readContract({
    address: STABLE.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, spender],
  });

  // --- the route ------------------------------------------------------------------------
  const route = await swap({
    from: STABLE.address,
    to: asset,
    amount: amount.toString(),
    slippagePercent,
    userWalletAddress: account.address,
    receiver: account.address,
  });
  if (!isOk(route)) {
    console.error(`\nHELD. ${route.why}`);
    console.error(`\nThat is the aggregator's own sentence. If it says there is no route,`);
    console.error(`this asset is not payable on X Layer today.`);
    process.exit(1);
  }

  const first = route.value[0];
  if (!first) {
    console.error(`\nHELD. The aggregator returned an empty route list.`);
    process.exit(1);
  }

  const {routerResult: r, tx} = first;
  const expected = BigInt(r.toTokenAmount);
  const minReceive = tx.minReceiveAmount ? BigInt(tx.minReceiveAmount) : undefined;

  console.log(`\nTHE ROUTE`);
  line();
  console.log(`Pay        ${usd} USDT  (${amount} units, 6 decimals)`);
  console.log(`Receive    ${formatUnits(expected, assetDecimals)} ${assetSymbol}  (${expected} units)`);
  if (minReceive !== undefined) {
    console.log(`At least   ${formatUnits(minReceive, assetDecimals)} ${assetSymbol}  at ${slippagePercent}% slippage`);
  }
  if (r.priceImpactPercent) console.log(`Impact     ${r.priceImpactPercent}%`);
  const hops = (r.dexRouterList ?? [])
    .map((h) => h.dexProtocol?.dexName)
    .filter(Boolean);
  console.log(`Through    ${hops.join(" -> ") || "not reported"}`);
  console.log(`Router     ${tx.to}`);
  console.log(`Spender    ${spender}`);
  console.log(`Allowance  ${formatUnits(allowance, STABLE.decimals)} USDT to that spender`);
  console.log(`Calldata   ${tx.data.length} chars, starting ${tx.data.slice(0, 10)}`);
  line();

  if (!flag("send")) {
    console.log(`\nDRY RUN. Nothing was sent.`);
    console.log(`\nThis is a real payment on X Layer mainnet and it cannot be undone.`);
    console.log(`When the plan above reads correctly, run it again with --send:\n`);
    console.log(`    npm run prove-route -- --usd=${usd} --send\n`);
    return;
  }

  // --- from here it is real ---------------------------------------------------------------
  if (allowance < amount) {
    console.log(`\nApproving ${usd} USDT to ${spender}...`);
    const approveHash = await wallet.writeContract({
      address: STABLE.address,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, amount],
    });
    console.log(`  ${approveHash}`);
    const ar = await rpc.waitForTransactionReceipt({hash: approveHash});
    if (ar.status !== "success") {
      console.error(`\nThe approval reverted. Stop.`);
      process.exit(1);
    }
    console.log(`  approved in block ${ar.blockNumber}`);
  }

  console.log(`\nSending the swap...`);
  const hash = await wallet.sendTransaction({
    to: tx.to as `0x${string}`,
    data: tx.data as Hex,
    value: BigInt(tx.value || "0"),
    ...(tx.gas ? {gas: (BigInt(tx.gas) * 13n) / 10n} : {}),
  });
  console.log(`  ${hash}`);

  const receipt = await rpc.waitForTransactionReceipt({hash});
  const assetBalAfter = await rpc.readContract({
    address: asset,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const delivered = assetBalAfter - assetBalBefore;

  console.log(`\nTHE RESULT`);
  line();
  console.log(`Status     ${receipt.status}`);
  console.log(`Block      ${receipt.blockNumber}`);
  console.log(`Gas used   ${receipt.gasUsed}`);
  console.log(`Delivered  ${formatUnits(delivered, assetDecimals)} ${assetSymbol}  (${delivered} units)`);
  console.log(`Expected   ${formatUnits(expected, assetDecimals)} ${assetSymbol}`);
  console.log(`Hash       ${hash}`);
  console.log(`Anchored   ${EXPLORER_TX(hash)}`);
  line();

  if (receipt.status !== "success") {
    console.error(`\nThe transaction reverted. The route did not settle.`);
    process.exit(1);
  }
  if (delivered <= 0n) {
    console.error(`\nThe transaction succeeded and the asset did not arrive. That is worse`);
    console.error(`than a revert: check whether the route delivered to a different address.`);
    process.exit(1);
  }
  if (minReceive !== undefined && delivered < minReceive) {
    console.error(`\nDelivered less than the route's own minimum. Do not build on this.`);
    process.exit(1);
  }

  console.log(`\nTHE ROUTE IS PROVED. ${formatUnits(delivered, assetDecimals)} ${assetSymbol} arrived.`);
  console.log(`Plan step 2, Payroll.sol, is already written and tested. Deploy it next.`);
}

main().catch((err) => {
  console.error(`\nFell over: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
