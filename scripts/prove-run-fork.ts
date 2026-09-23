/**
 * THE DEMO, PROVED, FOR NOTHING.
 *
 * A file of people becomes lines, one permit is signed off chain, and ONE transaction pays
 * all of them — against a fork of X Layer with the real USDT, the real OKX router, real
 * calldata and real state.
 *
 * This is the piece the Foundry tests cannot reach. They prove the permit logic against a
 * mock token; this proves that a permit signed with the domain lib/permit.ts DERIVES is
 * accepted by the actual USDT contract deployed on X Layer. A wrong domain produces a
 * signature a wallet signs happily and the token rejects, so nothing short of this proves it.
 *
 *   anvil --fork-url https://rpc.xlayer.tech --silent &
 *   npm run prove-run
 */
import {readFileSync} from "node:fs";
import {erc20Abi, formatUnits, parseEventLogs, type Address, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {loadEnv} from "../lib/env";
import {STABLE} from "../lib/chain";
import {defaultAsset} from "../lib/assets";
import {checkClock, forkClient, fundToken, FORK_PAYER_KEY} from "../lib/fork";
import {approveTransaction, supportedChain, swap} from "../lib/okx";
import {PERMIT_TYPES, deadlineIn, permitAbi, resolveDomain} from "../lib/permit";
import {payrollAbi} from "../lib/payroll-abi";
import {reasonHash} from "../lib/reason";
import {runIdFromName} from "../lib/run-id";
import {isOk} from "../lib/outcome";

const PAYER_KEY = FORK_PAYER_KEY;
const FORK = "http://127.0.0.1:8545";

/** Eight lines, the shape of the demo. Addresses are arbitrary and hold nothing. */
const RUN = [
  {to: "0x00000000000000000000000000000000000ca511", usd: 3, cash: 0, why: "Reviewed the vesting maths"},
  {to: "0x00000000000000000000000000000000000ca512", usd: 3, cash: 0, why: "Wrote the CSV parser"},
  {to: "0x00000000000000000000000000000000000ca513", usd: 3, cash: 0, why: "Found the throttle bug"},
  {to: "0x00000000000000000000000000000000000ca514", usd: 5, cash: 2, why: "Design review, week 38"},
  {to: "0x00000000000000000000000000000000000ca515", usd: 3, cash: 0, why: "Shipped the indexer"},
];

const line = () => console.log("-".repeat(78));

/** Reuse an already-deployed Payroll instead of deploying another. Lets a second run land
 *  on the same contract, which is what testing the indexer's catch-up needs. */
const reuse = process.argv.find((a) => a.startsWith("--payroll="))?.slice(10) as Address | undefined;

async function main() {
  loadEnv();
  const client = forkClient(FORK);
  const payer = privateKeyToAccount(PAYER_KEY);
  const asset = defaultAsset();

  try {
    const id = await client.getChainId();
    if (id !== 196) throw new Error(`fork is chain ${id}`);
  } catch (err) {
    console.error(`No X Layer fork on ${FORK}. Start one:\n`);
    console.error(`    anvil --fork-url https://rpc.xlayer.tech --silent &\n`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const total = BigInt(RUN.reduce((s, r) => s + Math.round(r.usd * 1e6), 0));

  // --- the two addresses --------------------------------------------------------------
  const clock = await checkClock(client);
  if (!isOk(clock)) return fail(clock.why);

  const chain = await supportedChain();
  if (!isOk(chain)) return fail(chain.why);
  const spender = chain.value.dexTokenApproveAddress as Address;

  const approval = await approveTransaction({token: STABLE.address, amount: total.toString()});
  if (!isOk(approval)) return fail(approval.why);
  if (approval.value[0]?.dexContractAddress?.toLowerCase() !== spender.toLowerCase()) {
    return fail("The two readings of the spender disagree.");
  }

  // --- fund, and learn the router -----------------------------------------------------
  await client.setBalance({address: payer.address, value: 10n ** 18n});
  const slot = await fundToken(client, STABLE.address, payer.address, total * 4n);
  if (!isOk(slot)) return fail(slot.why);

  const scout = await swap({
    from: STABLE.address,
    to: asset.address,
    amount: "1000000",
    slippagePercent: "1",
    userWalletAddress: payer.address,
    receiver: payer.address,
  });
  if (!isOk(scout)) return fail(scout.why);
  const router = scout.value[0]!.tx.to as Address;

  // --- deploy -------------------------------------------------------------------------
  const artifact = JSON.parse(
    readFileSync("contracts/out/Payroll.sol/Payroll.json", "utf8"),
  ) as {bytecode: {object: Hex}};

  let payroll: Address;
  if (reuse) {
    payroll = reuse;
  } else {
    const deployHash = await client.deployContract({
      abi: payrollAbi,
      bytecode: artifact.bytecode.object,
      account: payer,
      chain: null,
      args: [STABLE.address, router, spender],
    });
    payroll = (await client.waitForTransactionReceipt({hash: deployHash})).contractAddress!;
  }

  console.log(`\nTHE RUN`);
  line();
  console.log(`Payer      ${payer.address}`);
  console.log(`Payroll    ${payroll}`);
  console.log(`Asset      ${asset.symbol}  ${asset.address}`);
  console.log(`Lines      ${RUN.length}, totalling ${formatUnits(total, 6)} USDT`);
  line();

  // --- build a route per line, bound to Payroll, delivered to each person --------------
  console.log(`\nBuilding ${RUN.length} routes...`);
  const lines = [];
  for (const r of RUN) {
    const stableAmount = BigInt(Math.round(r.usd * 1e6));
    const cashAmount = BigInt(Math.round(r.cash * 1e6));
    const swapAmount = stableAmount - cashAmount;

    const route = await swap({
      from: STABLE.address,
      to: asset.address,
      amount: swapAmount.toString(),
      slippagePercent: "1",
      userWalletAddress: payroll,
      receiver: r.to,
    });
    if (!isOk(route)) return fail(`${r.to}: ${route.why}`);

    const minOut = BigInt(route.value[0]!.tx.minReceiveAmount ?? "0");
    if (minOut === 0n) return fail(`${r.to}: the aggregator stated no minimum.`);

    lines.push({
      recipient: r.to as Address,
      stableAmount,
      cashAmount,
      minOut,
      reasonHash: reasonHash(r.why),
      routerCalldata: route.value[0]!.tx.data as Hex,
    });
    process.stdout.write(".");
  }
  console.log(` done`);

  // --- the one signature ---------------------------------------------------------------
  const domain = await resolveDomain(FORK);
  if (!isOk(domain)) return fail(domain.why);

  const nonce = await client.readContract({
    address: STABLE.address,
    abi: permitAbi,
    functionName: "nonces",
    args: [payer.address],
  });
  // The fork's clock, not this machine's: another proof may have moved it years.
  const deadline = await deadlineIn(30, FORK);

  console.log(`\nSigning one permit, off chain, for no gas.`);
  console.log(`  domain   ${JSON.stringify(domain.value.name)} v${domain.value.version}`);
  console.log(`  nonce    ${nonce}`);
  console.log(`  value    ${formatUnits(total, 6)} USDT`);

  const signature = await payer.signTypedData({
    domain: domain.value.domain,
    types: PERMIT_TYPES,
    primaryType: "Permit",
    message: {owner: payer.address, spender: payroll, value: total, nonce, deadline},
  });

  const r = `0x${signature.slice(2, 66)}` as Hex;
  const s = `0x${signature.slice(66, 130)}` as Hex;
  let v = parseInt(signature.slice(130, 132), 16);
  if (v < 27) v += 27;

  const allowanceBefore = await client.readContract({
    address: STABLE.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [payer.address, payroll],
  });
  if (!reuse && allowanceBefore !== 0n) {
    return fail("The payer already had an allowance; this proves nothing.");
  }

  const before = await Promise.all(
    RUN.map((x) =>
      client.readContract({
        address: asset.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [x.to as Address],
      }),
    ),
  );

  // --- one transaction ------------------------------------------------------------------
  const runId = runIdFromName(reuse ? `run-${Date.now().toString(36).slice(-6)}` : "run-fork-proof");
  console.log(`\nOne transaction: payManyWithPermit, runId "run-fork-proof"...`);

  const hash = await client.writeContract({
    address: payroll,
    abi: payrollAbi,
    functionName: "payManyWithPermit",
    account: payer,
    chain: null,
    args: [lines, asset.address, runId, {value: total, deadline, v, r, s}],
  });
  const receipt = await client.waitForTransactionReceipt({hash});

  const after = await Promise.all(
    RUN.map((x) =>
      client.readContract({
        address: asset.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [x.to as Address],
      }),
    ),
  );

  const paid = parseEventLogs({abi: payrollAbi, logs: receipt.logs, eventName: "Paid"});

  console.log(`\nTHE RESULT`);
  line();
  console.log(`Status       ${receipt.status}`);
  console.log(`Transactions 1`);
  console.log(`Gas used     ${receipt.gasUsed}  (${(Number(receipt.gasUsed) / RUN.length).toFixed(0)} a line)`);
  console.log(`Paid events  ${paid.length}`);
  line();

  let allGood = receipt.status === "success" && paid.length === RUN.length;
  const runIds = new Set<string>();

  for (const [i, r0] of RUN.entries()) {
    const delivered = after[i]! - before[i]!;
    const ok = delivered >= lines[i]!.minOut && delivered > 0n;
    const ev = paid[i]?.args as Record<string, unknown> | undefined;
    if (ev) runIds.add(String(ev.runId));
    if (!ok) allGood = false;
    console.log(
      `  ${ok ? "ok  " : "FAIL"} ${r0.to.slice(0, 10)}…  ` +
        `$${r0.usd}${r0.cash ? ` ($${r0.cash} cash)` : ""}  ->  ` +
        `${formatUnits(delivered, asset.decimals)} ${asset.symbol}   "${r0.why}"`,
    );
  }

  const held = await client.readContract({
    address: asset.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [payroll],
  });

  console.log();
  console.log(`  run ids across every receipt: ${runIds.size} (${[...runIds][0]?.slice(0, 22)}…)`);
  console.log(`  contract holds afterwards:    ${formatUnits(held, asset.decimals)} ${asset.symbol}`);
  line();

  if (!allGood || runIds.size !== 1 || held !== 0n) {
    console.error(`\nTHE RUN DID NOT SETTLE CLEANLY.`);
    process.exit(1);
  }

  console.log(`\n${RUN.length} PEOPLE PAID IN ONE TRANSACTION, ONE SIGNATURE, ONE RUN ID.`);
  console.log(`A permit signed with the derived domain was accepted by the real USDT.`);
  console.log(`Every asset landed in its recipient's own wallet. The contract kept nothing.`);
}

function fail(why: string): never {
  console.error(`\nHELD. ${why}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`\nFell over: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
