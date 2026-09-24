/**
 * THE CERTIFICATE'S ARITHMETIC AGAINST THE ESCROW'S OWN, ON A FORK OF X LAYER.
 *
 * lib/vesting.ts is the second implementation of GrantEscrow's schedule; the certificate
 * ticks on it. This opens a real grant on the DEPLOYED escrow (its own bytecode, its own
 * pool) and compares the contract's `vestedSharesAt`, `vestedUnitsAt`, `releasableUnits`
 * and `heldUnits` with lib/vesting at about twenty moments: before the start, before, at and
 * after the cliff, midway, at and after the end, after a release, and after a cancel —
 * including what a cancel returns, predicted before it is sent.
 *
 * No aggregator call, so no API key: on the fork only, the OKX router's code is replaced by
 * a twelve-instruction stand-in that hands the escrow units of the asset it holds, which the
 * issuer's owner mints to it (impersonated, on the fork). If that mint is refused, a plain
 * ERC-20 from the Foundry build stands in for the stock; the arithmetic under test is the
 * same either way, and the output says which ran.
 *
 *   anvil --fork-url https://rpc.xlayer.tech --port 8547 --silent &
 *   FORK_URL=http://127.0.0.1:8547 npx tsx scripts/prove-vesting-fork.ts
 */
import {readFileSync} from "node:fs";
import {encodeAbiParameters, erc20Abi, parseAbi, parseEventLogs, type Address, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {STABLE} from "../lib/chain";
import {defaultAsset, ISSUER} from "../lib/assets";
import {forkClient, fundToken, FORK_PAYER_KEY} from "../lib/fork";
import {grantEscrowAbi} from "../lib/payroll-abi";
import {reasonHash} from "../lib/reason";
import {
  releasableUnits,
  revokePreview,
  vestedShares,
  vestedUnitsAt,
  heldUnits,
  type PoolState,
  type VestingTerms,
} from "../lib/vesting";

const FORK = process.env.FORK_URL ?? "http://127.0.0.1:8545";
const ESCROW = (process.env.NEXT_PUBLIC_GRANT_ESCROW_ADDRESS ?? "0xb238d76499616377abd4908e46f29c7ce50908d1") as Address;
const KEEPER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const ALICE = "0x00000000000000000000000000000000000a11ce" as Address;

/**
 * THE STAND-IN ROUTER: transfer(calldata[32:64]) of the token at calldata[0:32] to the caller,
 * reverting if the transfer does. PUSH4 a9059cbb, SHL 224, MSTORE 0; CALLER, MSTORE 4;
 * CALLDATALOAD 32, MSTORE 36; CALL(gas, CALLDATALOAD 0, 0, 0, 68, 0, 32); JUMPI ok; REVERT.
 */
const STAND_IN: Hex = "0x63a9059cbb60e01b60005233600452602035602452602060006044600060006000355af1602b57600080fd5b00";

const CLIFF = 900; // 15 minutes
const TERM = 7200; // 2 hours
const USD = 3_000_000n; // $3 of USD₮0
const UNITS = 3_900_000_000_000_000n; // 0.0039 of the stock
const TIP_BPS = 50;

type Row = {moment: string; what: string; chain: bigint; ours: bigint};
const rows: Row[] = [];
const check = (moment: string, what: string, chain: bigint, ours: bigint) => rows.push({moment, what, chain, ours});

async function main() {
  const client = forkClient(FORK);
  try {
    if ((await client.getChainId()) !== 196) throw new Error("not X Layer");
  } catch {
    console.error(`No X Layer fork on ${FORK}. Start one:\n\n    anvil --fork-url https://rpc.xlayer.tech --port 8547 --silent &\n`);
    process.exit(1);
  }

  const payer = privateKeyToAccount(FORK_PAYER_KEY);
  const keeper = privateKeyToAccount(KEEPER_KEY);
  await client.setBalance({address: payer.address, value: 10n ** 18n});
  await client.setBalance({address: keeper.address, value: 10n ** 18n});

  const router = (await client.readContract({address: ESCROW, abi: parseAbi(["function router() view returns (address)"]), functionName: "router"})) as Address;
  await client.setCode({address: router, bytecode: STAND_IN});

  // The stock: the real default xStock, minted to the stand-in by its issuer's owner.
  let asset = defaultAsset().address as Address;
  let which = `${defaultAsset().symbol}, minted by the issuer's owner on the fork`;
  try {
    await client.impersonateAccount({address: ISSUER.owner as Address});
    await client.setBalance({address: ISSUER.owner as Address, value: 10n ** 18n});
    const h = await client.writeContract({
      address: asset,
      abi: parseAbi(["function mint(address,uint256)"]),
      functionName: "mint",
      args: [router, UNITS * 10n],
      account: ISSUER.owner as Address,
      chain: null,
    });
    const r = await client.waitForTransactionReceipt({hash: h});
    await client.stopImpersonatingAccount({address: ISSUER.owner as Address});
    if (r.status !== "success") throw new Error("mint reverted");
    const bal = await client.readContract({address: asset, abi: erc20Abi, functionName: "balanceOf", args: [router]});
    if (bal < UNITS) throw new Error("mint did not land");
  } catch (err) {
    const artifact = JSON.parse(readFileSync("contracts/out/MockERC20.sol/MockERC20.json", "utf8")) as {
      abi: unknown[];
      bytecode: {object: Hex};
    };
    const deploy = await client.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode.object,
      account: payer,
      chain: null,
      args: ["Stand-in stock", "STOCK", 18],
    });
    asset = (await client.waitForTransactionReceipt({hash: deploy})).contractAddress!;
    await client.writeContract({
      address: asset,
      abi: parseAbi(["function mint(address,uint256)"]),
      functionName: "mint",
      args: [router, UNITS * 10n],
      account: payer,
      chain: null,
    });
    which = `a plain ERC-20 (the issuer's mint was refused: ${err instanceof Error ? err.message.split("\n")[0] : String(err)})`;
  }

  const funded = await fundToken(client, STABLE.address, payer.address, USD * 10n);
  if (!funded.ok) throw new Error(funded.why);
  await client.writeContract({address: STABLE.address, abi: erc20Abi, functionName: "approve", args: [ESCROW, USD], account: payer, chain: null});

  const openHash = await client.writeContract({
    address: ESCROW,
    abi: grantEscrowAbi,
    functionName: "open",
    account: payer,
    chain: null,
    args: [
      {
        beneficiary: ALICE,
        asset,
        stableAmount: USD,
        minOut: UNITS,
        start: 0n,
        cliff: BigInt(CLIFF),
        duration: BigInt(TERM),
        tipBps: TIP_BPS,
        reasonHash: reasonHash("Vesting parity proof"),
        routerCalldata: encodeAbiParameters([{type: "address"}, {type: "uint256"}], [asset, UNITS]),
      },
    ],
  });
  const opened = await client.waitForTransactionReceipt({hash: openHash});
  const ev = parseEventLogs({abi: grantEscrowAbi, logs: opened.logs, eventName: "GrantOpened"})[0];
  if (!ev) throw new Error("the grant did not open");
  const id = ev.args.id;

  /** The grant's terms and its pool, read at one block. */
  const read = async (blockNumber: bigint): Promise<{t: VestingTerms; pool: PoolState; at: number}> => {
    const [g, poolShares, escrowBalance, block] = await Promise.all([
      client.readContract({address: ESCROW, abi: grantEscrowAbi, functionName: "grant", args: [id], blockNumber}),
      client.readContract({address: ESCROW, abi: grantEscrowAbi, functionName: "poolShares", args: [asset], blockNumber}),
      client.readContract({address: asset, abi: erc20Abi, functionName: "balanceOf", args: [ESCROW], blockNumber}),
      client.getBlock({blockNumber}),
    ]);
    return {
      t: {
        shares: g.shares,
        sharesReleased: g.sharesReleased,
        start: Number(g.start),
        cliffSeconds: Number(g.cliff),
        durationSeconds: Number(g.duration),
        revoked: g.revoked,
        frozenVestedShares: g.frozenVestedShares,
      },
      pool: {poolShares, escrowBalance},
      at: Number(block.timestamp),
    };
  };

  /** Compare every view at the current block, and vestedUnitsAt at the given moments. */
  const compareAt = async (moment: string, extra: Array<[string, number]> = []) => {
    const blockNumber = await client.getBlockNumber();
    const {t, pool, at} = await read(blockNumber);
    const view = (fn: "releasableUnits" | "heldUnits") =>
      client.readContract({address: ESCROW, abi: grantEscrowAbi, functionName: fn, args: [id], blockNumber});
    check(moment, "releasableUnits", await view("releasableUnits"), releasableUnits(t, pool, at));
    check(moment, "heldUnits", await view("heldUnits"), heldUnits(t, pool));
    for (const [label, when] of [["now", at] as [string, number], ...extra]) {
      const [s, u] = await Promise.all([
        client.readContract({address: ESCROW, abi: grantEscrowAbi, functionName: "vestedSharesAt", args: [id, BigInt(when)], blockNumber}),
        client.readContract({address: ESCROW, abi: grantEscrowAbi, functionName: "vestedUnitsAt", args: [id, BigInt(when)], blockNumber}),
      ]);
      check(moment, `vestedSharesAt(${label})`, s, vestedShares(t, when));
      check(moment, `vestedUnitsAt(${label})`, u, vestedUnitsAt(t, pool, when));
    }
    return {t, pool, at};
  };

  const jumpTo = async (timestamp: number) => {
    await client.setNextBlockTimestamp({timestamp: BigInt(timestamp)});
    await client.mine({blocks: 1});
  };

  const first = await read(opened.blockNumber);
  const start = first.t.start;
  const cliff = start + CLIFF;
  const end = start + TERM;

  await compareAt("at opening", [
    ["before the start", start - 60],
    ["a second before the cliff", cliff - 1],
    ["at the cliff", cliff],
    ["midway", start + TERM / 2],
    ["a second before the end", end - 1],
    ["at the end", end],
    ["a year after the end", end + 365 * 86_400],
  ]);

  await jumpTo(cliff - 1);
  await compareAt("a second before the cliff");

  await jumpTo(cliff);
  await compareAt("at the cliff");

  await jumpTo(cliff + 777);
  await compareAt("after the cliff");

  // A stranger releases what is due; the figures after it must still agree.
  const vestHash = await client.writeContract({address: ESCROW, abi: grantEscrowAbi, functionName: "vest", args: [id], account: keeper, chain: null});
  await client.waitForTransactionReceipt({hash: vestHash});
  await compareAt("after a release", [["midway", start + TERM / 2]]);

  await jumpTo(start + TERM / 2);
  await compareAt("midway");

  // A cancel, predicted before it is sent, at the second it will land.
  const landAt = start + TERM / 2 + 120;
  const before = await read(await client.getBlockNumber());
  const predicted = revokePreview(before.t, before.pool, landAt);
  await client.setNextBlockTimestamp({timestamp: BigInt(landAt)});
  const revokeHash = await client.writeContract({address: ESCROW, abi: grantEscrowAbi, functionName: "revoke", args: [id], account: payer, chain: null});
  const revoked = await client.waitForTransactionReceipt({hash: revokeHash});
  const rev = parseEventLogs({abi: grantEscrowAbi, logs: revoked.logs, eventName: "GrantRevoked"})[0];
  if (!rev) throw new Error("the cancel emitted no GrantRevoked");
  check("the cancel", "returnedUnits (event vs preview)", rev.args.returnedUnits, predicted.returnedUnits);

  await compareAt("after the cancel", [["at the end", end]]);
  await jumpTo(end + 600);
  await compareAt("after the end, cancelled", [["a year on", end + 365 * 86_400]]);

  // THE VERDICT
  const bad = rows.filter((r) => r.chain !== r.ours);
  console.log(`\nVESTING PARITY: lib/vesting.ts against GrantEscrow ${ESCROW} on a fork of X Layer`);
  console.log(`Grant ${id} of ${which}; cliff ${CLIFF}s, term ${TERM}s, release fee ${TIP_BPS / 100}%.`);
  console.log("-".repeat(96));
  for (const r of rows) {
    console.log(`  ${r.chain === r.ours ? "ok  " : "FAIL"} ${r.moment.padEnd(28)} ${r.what.padEnd(40)} ${r.chain}${r.chain === r.ours ? "" : ` vs ours ${r.ours}`}`);
  }
  console.log("-".repeat(96));
  console.log(`${rows.length - bad.length} of ${rows.length} agree exactly.`);
  if (bad.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`\nFell over: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
