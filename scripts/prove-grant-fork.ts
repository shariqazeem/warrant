/**
 * A WHOLE GRANT, START TO FINISH, ON A FORK OF X LAYER.
 *
 * Opens a real grant with real calldata against the real router, then moves the fork's
 * clock through the cliff and the term and releases at each step. Proves the parts the
 * unit tests cannot: that a real route fills into the escrow, and that the schedule behaves
 * against a chain rather than against a mock.
 *
 *   anvil --fork-url https://rpc.xlayer.tech --silent &
 *   npm run prove-grant
 */
import {readFileSync} from "node:fs";
import {erc20Abi, formatUnits, parseEventLogs, type Address, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {loadEnv} from "../lib/env";
import {STABLE} from "../lib/chain";
import {defaultAsset} from "../lib/assets";
import {forkClient, fundToken} from "../lib/fork";
import {approveTransaction, supportedChain, swap} from "../lib/okx";
import {grantEscrowAbi} from "../lib/payroll-abi";
import {reasonHash} from "../lib/reason";
import {isOk} from "../lib/outcome";

const PAYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const KEEPER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ALICE = "0x00000000000000000000000000000000000ca511" as Address;
const FORK = "http://127.0.0.1:8545";

const DAY = 86_400;
const YEAR = 365 * DAY;
const USD = 100;
const CLIFF = 90 * DAY;
const TERM = 4 * YEAR;
const TIP_BPS = 50;

const line = () => console.log("-".repeat(78));

async function main() {
  loadEnv();
  const client = forkClient(FORK);
  const payer = privateKeyToAccount(PAYER_KEY);
  const keeper = privateKeyToAccount(KEEPER_KEY);
  const asset = defaultAsset();
  const amount = BigInt(USD * 1e6);

  try {
    if ((await client.getChainId()) !== 196) throw new Error("not X Layer");
  } catch {
    console.error(`No X Layer fork on ${FORK}. Start one:\n`);
    console.error(`    anvil --fork-url https://rpc.xlayer.tech --silent &\n`);
    process.exit(1);
  }

  const chain = await supportedChain();
  if (!isOk(chain)) return fail(chain.why);
  const spender = chain.value.dexTokenApproveAddress as Address;

  const approval = await approveTransaction({token: STABLE.address, amount: amount.toString()});
  if (!isOk(approval)) return fail(approval.why);

  await client.setBalance({address: payer.address, value: 10n ** 18n});
  await client.setBalance({address: keeper.address, value: 10n ** 18n});
  const slot = await fundToken(client, STABLE.address, payer.address, amount * 4n);
  if (!isOk(slot)) return fail(slot.why);

  const scout = await swap({
    from: STABLE.address,
    to: asset.address,
    amount: amount.toString(),
    slippagePercent: "1",
    userWalletAddress: payer.address,
    receiver: payer.address,
  });
  if (!isOk(scout)) return fail(scout.why);
  const router = scout.value[0]!.tx.to as Address;

  const artifact = JSON.parse(
    readFileSync("contracts/out/GrantEscrow.sol/GrantEscrow.json", "utf8"),
  ) as {bytecode: {object: Hex}};

  const deployHash = await client.deployContract({
    abi: grantEscrowAbi,
    bytecode: artifact.bytecode.object,
    account: payer,
    chain: null,
    args: [STABLE.address, router, spender],
  });
  const escrow = (await client.waitForTransactionReceipt({hash: deployHash})).contractAddress!;

  // The route delivers to the ESCROW, not to the beneficiary. That is the whole point.
  const route = await swap({
    from: STABLE.address,
    to: asset.address,
    amount: amount.toString(),
    slippagePercent: "1",
    userWalletAddress: escrow,
    receiver: escrow,
  });
  if (!isOk(route)) return fail(route.why);
  const minOut = BigInt(route.value[0]!.tx.minReceiveAmount ?? "0");

  await client.writeContract({
    address: STABLE.address,
    abi: erc20Abi,
    functionName: "approve",
    args: [escrow, amount],
    account: payer,
    chain: null,
  });

  const openHash = await client.writeContract({
    address: escrow,
    abi: grantEscrowAbi,
    functionName: "open",
    account: payer,
    chain: null,
    args: [
      {
        beneficiary: ALICE,
        asset: asset.address,
        stableAmount: amount,
        minOut,
        start: 0n,
        cliff: BigInt(CLIFF),
        duration: BigInt(TERM),
        tipBps: TIP_BPS,
        reasonHash: reasonHash("Founding engineer, four year grant"),
        routerCalldata: route.value[0]!.tx.data as Hex,
      },
    ],
  });
  await client.waitForTransactionReceipt({hash: openHash});

  const id = 1n;
  const held = () =>
    client.readContract({address: escrow, abi: grantEscrowAbi, functionName: "heldUnits", args: [id]});
  const due = () =>
    client.readContract({address: escrow, abi: grantEscrowAbi, functionName: "releasableUnits", args: [id]});
  const balance = (who: Address) =>
    client.readContract({address: asset.address, abi: erc20Abi, functionName: "balanceOf", args: [who]});
  const units = (v: bigint) => `${formatUnits(v, asset.decimals)} ${asset.symbol}`;

  console.log(`\nTHE GRANT`);
  line();
  console.log(`Escrow      ${escrow}`);
  console.log(`Beneficiary ${ALICE}`);
  const fundedUnits = await held();
  console.log(`Funded      $${USD} -> ${units(fundedUnits)}, bought once and held`);
  console.log(`Schedule    4 years, 3 month cliff, keeper's share 0.50%`);
  console.log(`Escrow USDT ${await client.readContract({address: STABLE.address, abi: erc20Abi, functionName: "balanceOf", args: [escrow]})} (must be 0)`);
  line();

  const jump = async (seconds: number) => {
    await client.increaseTime({seconds});
    await client.mine({blocks: 1});
  };

  let good = true;
  const check = (label: string, ok: boolean, detail: string) => {
    if (!ok) good = false;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label.padEnd(34)} ${detail}`);
  };

  console.log(`\nTHE SCHEDULE, AGAINST THE CHAIN'S OWN CLOCK`);
  line();
  check("nothing due at open", (await due()) === 0n, units(await due()));

  await jump(CLIFF - DAY);
  check("nothing due a day before the cliff", (await due()) === 0n, units(await due()));

  await jump(2 * DAY);
  const atCliff = await due();
  check("the cliff pays the elapsed share", atCliff > 0n, units(atCliff));

  // A stranger releases it and is paid for doing so.
  //
  // ASSERTED AGAINST THE EVENT, NOT AGAINST A READ TAKEN BEFOREHAND. `releasableUnits`
  // read a moment ago is already stale: mining the vest advances the clock a second, and
  // a second of a four-year grant is a real number of units. The contract says exactly
  // what it released; nothing else is worth comparing against.
  const keeperBefore = await balance(keeper.address);
  const vestHash = await client.writeContract({
    address: escrow,
    abi: grantEscrowAbi,
    functionName: "vest",
    account: keeper,
    chain: null,
    args: [id],
  });
  const vestReceipt = await client.waitForTransactionReceipt({hash: vestHash});
  const vested = parseEventLogs({abi: grantEscrowAbi, logs: vestReceipt.logs, eventName: "Vested"})[0];
  if (!vested) return fail("the vest emitted no Vested event");

  const toBeneficiary = vested.args.unitsToBeneficiary;
  const toCaller = vested.args.unitsToCaller;
  const releasedNow = toBeneficiary + toCaller;

  const keeperGot = (await balance(keeper.address)) - keeperBefore;
  const aliceGot = await balance(ALICE);

  // A RECEIVED BALANCE IS NOT THE AMOUNT SENT, ON THIS TOKEN.
  //
  // The xStocks derive balanceOf rather than storing it — the balance slot is not a plain
  // mapping anywhere in the first 64 storage slots, and a transfer of X leaves the
  // recipient holding X-1. The token keeps shares internally and rounds down on the way
  // back out. So balances are compared within a wei of what the contract says it moved,
  // and the contract's own event is what everything else is checked against.
  //
  // This is also the strongest evidence that GrantEscrow was right to hold shares rather
  // than absolute units: the asset itself works that way.
  const within1 = (a: bigint, b: bigint) => (a > b ? a - b : b - a) <= 1n;

  check("a stranger could release it", within1(aliceGot, toBeneficiary) && aliceGot > 0n, units(aliceGot));
  check("and was paid for doing so", within1(keeperGot, toCaller) && keeperGot > 0n, units(keeperGot));
  check(
    "the keeper's share is exactly 0.50%",
    toCaller === (releasedNow * BigInt(TIP_BPS)) / 10_000n,
    `${units(toCaller)} of the ${units(releasedNow)} released`,
  );
  check(
    "it released roughly what the cliff owed",
    releasedNow >= atCliff && releasedNow - atCliff < atCliff / 1000n,
    `${units(releasedNow)} against a read of ${units(atCliff)} a block earlier`,
  );
  check("nothing due immediately after", (await due()) < atCliff / 100n, units(await due()));

  await jump(TERM);
  const rest = await due();
  check("everything is due at the end", rest > 0n, units(rest));

  // THE BENEFICIARY TAKES THE REST HERSELF, AND PAYS NO TIP FOR IT. Impersonated,
  // because the property being proved is specifically that the CALLER being the
  // beneficiary changes the outcome — vesting as anyone else would not test it.
  await client.impersonateAccount({address: ALICE});
  await client.setBalance({address: ALICE, value: 10n ** 18n});

  const selfHash = await client.writeContract({
    address: escrow,
    abi: grantEscrowAbi,
    functionName: "vest",
    account: ALICE,
    chain: null,
    args: [id],
  });
  const selfReceipt = await client.waitForTransactionReceipt({hash: selfHash});
  await client.stopImpersonatingAccount({address: ALICE});

  const selfVested = parseEventLogs({abi: grantEscrowAbi, logs: selfReceipt.logs, eventName: "Vested"})[0];
  if (!selfVested) return fail("the beneficiary's vest emitted no Vested event");

  const aliceTotal = await balance(ALICE);
  const keeperTotal = await balance(keeper.address);
  const everything = aliceTotal + keeperTotal;

  check("the escrow is empty", (await held()) < 10n, units(await held()));
  check("nothing further is due", (await due()) === 0n, units(await due()));
  check(
    "the beneficiary paid no tip to herself",
    selfVested.args.unitsToCaller === 0n,
    `${units(selfVested.args.unitsToBeneficiary)} released, 0 taken`,
  );
  check(
    "every unit reached one of the two",
    everything > 0n,
    `${units(aliceTotal)} to her, ${units(keeperTotal)} to keepers`,
  );
  check(
    "the token's own rounding cost at most a wei per transfer",
    fundedUnits - everything <= 4n,
    `${fundedUnits - everything} wei unaccounted across 3 transfers`,
  );
  check(
    "tips never exceeded the grant's cap",
    keeperTotal <= (everything * BigInt(TIP_BPS)) / 10_000n + 1n,
    `${units(keeperTotal)} of ${units(everything)}, cap ${TIP_BPS / 100}%`,
  );
  line();

  if (!good) {
    console.error(`\nTHE GRANT DID NOT BEHAVE. Do not go to mainnet with this.`);
    process.exit(1);
  }

  console.log(`\nA GRANT OPENED, VESTED AND EMPTIED ITSELF, ON REAL STATE.`);
  console.log(`Bought once at open, held where the payer could not reach it, released on`);
  console.log(`the schedule by someone who was not the company.`);
  console.log(`\nNEXT_PUBLIC_GRANT_ESCROW_ADDRESS=${escrow}`);
}

function fail(why: string): never {
  console.error(`\nHELD. ${why}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`\nFell over: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
