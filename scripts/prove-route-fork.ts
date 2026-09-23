/**
 * PROVE THE ROUTE ON A FORK, THROUGH PAYROLL, FOR NOTHING.
 *
 * This is `docs/plan.md` step 1 and step 2 run together against real mainnet state: the
 * real USDT, the real xStock, the real OKX router and real calldata from the aggregator —
 * but on a local fork, so a failure costs a rerun instead of money.
 *
 * It proves the thing the unit tests cannot, because they use a mock router: that the
 * calldata OKX builds actually settles when it is called from inside Payroll rather than
 * from an EOA, and that the asset lands in the RECIPIENT'S own wallet.
 *
 *   anvil --fork-url https://rpc.xlayer.tech --silent &
 *   npm run prove-fork
 */
import {readFileSync} from "node:fs";
import {erc20Abi, formatUnits, parseEventLogs, type Address, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {loadEnv} from "../lib/env";
import {STABLE, DEFAULT_ASSET} from "../lib/chain";
import {checkClock, forkClient, fundToken, FORK_PAYER_KEY} from "../lib/fork";
import {approveTransaction, supportedChain, swap} from "../lib/okx";
import {payrollAbi} from "../lib/payroll-abi";
import {isOk} from "../lib/outcome";

/** A key only these proofs use (lib/fork.ts says why it is not Anvil's account #0). */
const PAYER_KEY = FORK_PAYER_KEY;
const RECIPIENT = "0x00000000000000000000000000000000000ca511" as Address;

/** bytes32, left-aligned ASCII, the way a run id is written everywhere else. */
const RUN_ID = `0x${Buffer.from("fork-proof").toString("hex").padEnd(64, "0")}` as Hex;

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

const line = () => console.log("-".repeat(78));

async function main() {
  loadEnv();

  const usd = Number(arg("usd", "5"));
  const asset = arg("asset", DEFAULT_ASSET.address) as Address;
  const amount = BigInt(Math.round(usd * 10 ** STABLE.decimals));

  const client = forkClient();
  const payer = privateKeyToAccount(PAYER_KEY);

  let chainId: number;
  try {
    chainId = await client.getChainId();
  } catch {
    console.error(`No fork answering on 127.0.0.1:8545. Start one:\n`);
    console.error(`    anvil --fork-url https://rpc.xlayer.tech --silent &\n`);
    process.exit(1);
  }
  if (chainId !== 196) {
    console.error(`That fork is chain ${chainId}, not X Layer. Fork the right chain.`);
    process.exit(1);
  }

  // --- the two addresses Payroll is deployed against ---------------------------------
  const clock = await checkClock(client);
  if (!isOk(clock)) {
    console.error(`\nHELD. ${clock.why}`);
    process.exit(1);
  }

  const chain = await supportedChain();
  if (!isOk(chain)) {
    console.error(`HELD. ${chain.why}`);
    process.exit(1);
  }
  const spender = chain.value.dexTokenApproveAddress as Address;

  const approval = await approveTransaction({token: STABLE.address, amount: amount.toString()});
  if (!isOk(approval)) {
    console.error(`HELD. ${approval.why}`);
    process.exit(1);
  }
  if (approval.value[0]?.dexContractAddress?.toLowerCase() !== spender.toLowerCase()) {
    console.error(`The two readings of the spender disagree. Stop and find out why.`);
    process.exit(1);
  }

  // --- fund the payer on the fork ------------------------------------------------------
  await client.setBalance({address: payer.address, value: 10n ** 18n});
  const slot = await fundToken(client, STABLE.address, payer.address, amount * 10n);
  if (!isOk(slot)) {
    console.error(`HELD. ${slot.why}`);
    process.exit(1);
  }

  const funded = await client.readContract({
    address: STABLE.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [payer.address],
  });

  console.log(`\nON THE FORK`);
  line();
  console.log(`Payer      ${payer.address}`);
  console.log(`USDT       ${formatUnits(funded, STABLE.decimals)}  (written to slot ${slot.value})`);
  console.log(`Recipient  ${RECIPIENT}`);

  // --- deploy Payroll against the real router ------------------------------------------
  const artifact = JSON.parse(
    readFileSync("contracts/out/Payroll.sol/Payroll.json", "utf8"),
  ) as {bytecode: {object: Hex}};

  // The router address is only knowable from a built swap, and Payroll needs it at
  // construction. So: one throwaway route to learn the target, deploy against it, then the
  // real route bound to the deployed address.
  const scout = await swap({
    from: STABLE.address,
    to: asset,
    amount: amount.toString(),
    slippagePercent: arg("slippage", "1"),
    userWalletAddress: payer.address,
    receiver: RECIPIENT,
  });
  if (!isOk(scout)) {
    console.error(`\nHELD. ${scout.why}`);
    process.exit(1);
  }
  const router = scout.value[0]!.tx.to as Address;

  const deployHash = await client.deployContract({
    abi: payrollAbi,
    bytecode: artifact.bytecode.object,
    account: payer,
    chain: null,
    args: [STABLE.address, router, spender],
  });
  const payroll = (await client.waitForTransactionReceipt({hash: deployHash})).contractAddress!;

  // The calldata is bound to whoever holds the stablecoin at swap time, which is Payroll.
  const route = await swap({
    from: STABLE.address,
    to: asset,
    amount: amount.toString(),
    slippagePercent: arg("slippage", "1"),
    userWalletAddress: payroll,
    receiver: RECIPIENT,
  });
  if (!isOk(route)) {
    console.error(`\nHELD. ${route.why}`);
    process.exit(1);
  }
  const {routerResult: r, tx} = route.value[0]!;
  const minOut = BigInt(tx.minReceiveAmount ?? "0");

  const [assetSymbol, assetDecimals] = await Promise.all([
    client.readContract({address: asset, abi: erc20Abi, functionName: "symbol"}),
    client.readContract({address: asset, abi: erc20Abi, functionName: "decimals"}),
  ]);

  console.log(`Payroll    ${payroll}`);
  console.log(`Router     ${router}`);
  console.log(`Spender    ${spender}`);
  line();
  console.log(`\nTHE ROUTE`);
  line();
  console.log(`Pay        ${usd} USDT`);
  console.log(`Expect     ${formatUnits(BigInt(r.toTokenAmount), assetDecimals)} ${assetSymbol}`);
  console.log(`At least   ${formatUnits(minOut, assetDecimals)} ${assetSymbol}`);
  console.log(`Impact     ${r.priceImpactPercent ?? "not reported"}%`);
  console.log(
    `Through    ${(r.dexRouterList ?? []).map((h) => h.dexProtocol?.dexName).filter(Boolean).join(" -> ")}`,
  );
  line();

  // --- pay ------------------------------------------------------------------------------
  const before = await client.readContract({
    address: asset,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [RECIPIENT],
  });

  const approveHash = await client.writeContract({
    address: STABLE.address,
    abi: erc20Abi,
    functionName: "approve",
    args: [payroll, amount],
    account: payer,
    chain: null,
  });
  await client.waitForTransactionReceipt({hash: approveHash});

  const reason = "Fork proof, one line";
  const {reasonHash} = await import("../lib/reason");

  console.log(`\nCalling payOne through Payroll...`);
  const payHash = await client.writeContract({
    address: payroll,
    abi: payrollAbi,
    functionName: "payOne",
    account: payer,
    chain: null,
    args: [
      {
        recipient: RECIPIENT,
        stableAmount: amount,
        cashAmount: 0n,
        minOut,
        reasonHash: reasonHash(reason),
        routerCalldata: tx.data as Hex,
      },
      asset,
      RUN_ID,
    ],
  });
  const receipt = await client.waitForTransactionReceipt({hash: payHash});

  const after = await client.readContract({
    address: asset,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [RECIPIENT],
  });
  const delivered = after - before;

  const events = parseEventLogs({abi: payrollAbi, logs: receipt.logs, eventName: "Paid"});

  console.log(`\nTHE RESULT`);
  line();
  console.log(`Status     ${receipt.status}`);
  console.log(`Gas used   ${receipt.gasUsed}`);
  console.log(`Delivered  ${formatUnits(delivered, assetDecimals)} ${assetSymbol}`);
  console.log(`Floor      ${formatUnits(minOut, assetDecimals)} ${assetSymbol}`);
  console.log(`Paid event ${events.length === 1 ? "emitted" : `${events.length} of them`}`);
  if (events[0]) {
    const a = events[0].args as Record<string, unknown>;
    console.log(`  recipient  ${a.recipient}`);
    console.log(`  assetAmount ${a.assetAmount}`);
    console.log(`  reasonHash  ${a.reasonHash}`);
  }

  const contractHeld = await client.readContract({
    address: asset,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [payroll],
  });
  console.log(`Contract holds afterwards  ${formatUnits(contractHeld, assetDecimals)} ${assetSymbol}`);
  line();

  const good =
    receipt.status === "success" && delivered >= minOut && delivered > 0n && contractHeld === 0n;

  if (!good) {
    console.error(`\nTHE ROUTE DID NOT SETTLE THROUGH PAYROLL. Do not go to mainnet yet.`);
    process.exit(1);
  }

  console.log(`\nTHE ROUTE SETTLES THROUGH PAYROLL, on real state, with real calldata.`);
  console.log(`${formatUnits(delivered, assetDecimals)} ${assetSymbol} reached the recipient's`);
  console.log(`own wallet, above the floor, and the contract kept nothing.`);
  console.log(`\nMainnet is now the second time this path has run, not the first.`);
}

main().catch((err) => {
  console.error(`\nFell over: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
