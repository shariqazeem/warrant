/**
 * CERTIFICATES IN EVERY STATE, ON A LOCAL FORK OF X LAYER, TO LOOK AT BEFORE MAINNET.
 *
 * Opens three grants on the DEPLOYED escrow (its own bytecode and pool) with a fork-only
 * payer, so the certificate page, the vesting rule and the seal can be checked against real
 * contract state without spending anything:
 *   1. sealed and mid-schedule, with one release by a keeper already made;
 *   2. revocable and still before its cliff (accruing);
 *   3. cancelled after part of it vested.
 * Nothing here touches mainnet. As in scripts/prove-vesting-fork.ts, the OKX router's code is
 * replaced ON THE FORK by a stand-in that hands the escrow units the issuer's owner minted to
 * it, so no aggregator call and no API key are needed. The amounts are fork amounts: they
 * exist only on this machine and must never be shown as real.
 *
 *   anvil --fork-url https://rpc.xlayer.tech --port 8547 --silent &
 *   FORK_URL=http://127.0.0.1:8547 npx tsx scripts/fork-scenes.ts
 */
import {encodeAbiParameters, erc20Abi, parseAbi, parseEventLogs, type Address, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {STABLE} from "../lib/chain";
import {ASSETS, ISSUER} from "../lib/assets";
import {forkClient, fundToken, FORK_PAYER_KEY} from "../lib/fork";
import {grantEscrowAbi} from "../lib/payroll-abi";
import {rememberReason} from "../lib/db";

const FORK = process.env.FORK_URL ?? "http://127.0.0.1:8547";
const ESCROW = (process.env.NEXT_PUBLIC_GRANT_ESCROW_ADDRESS ?? "0xb238d76499616377abd4908e46f29c7ce50908d1") as Address;
/** Anvil's well-known test key #1, used only on the fork, as the keeper that releases. */
const KEEPER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
/** A recipient that exists only on the fork. */
const RECIPIENT = "0x7c1E5a2B9d04F3aC61e8B2d7F0c9A4E13b5D9aB2" as Address;
const STAND_IN: Hex = "0x63a9059cbb60e01b60005233600452602035602452602060006044600060006000355af1602b57600080fd5b00";
const DAY = 86_400;

async function main() {
  const client = forkClient(FORK);
  if ((await client.getChainId()) !== 196) throw new Error(`No X Layer fork on ${FORK}`);
  const payer = privateKeyToAccount(FORK_PAYER_KEY);
  const keeper = privateKeyToAccount(KEEPER_KEY);
  await client.setBalance({address: payer.address, value: 10n ** 18n});
  await client.setBalance({address: keeper.address, value: 10n ** 18n});

  const router = (await client.readContract({
    address: ESCROW,
    abi: parseAbi(["function router() view returns (address)"]),
    functionName: "router",
  })) as Address;
  await client.setCode({address: router, bytecode: STAND_IN});

  const spyx = ASSETS.find((a) => a.symbol === "SPYx")!;
  const nvdax = ASSETS.find((a) => a.symbol === "NVDAx")!;
  await client.impersonateAccount({address: ISSUER.owner as Address});
  await client.setBalance({address: ISSUER.owner as Address, value: 10n ** 18n});
  for (const asset of [spyx, nvdax]) {
    const h = await client.writeContract({
      address: asset.address as Address,
      abi: parseAbi(["function mint(address,uint256)"]),
      functionName: "mint",
      args: [router, 10n ** 20n],
      account: ISSUER.owner as Address,
      chain: null,
    });
    await client.waitForTransactionReceipt({hash: h});
  }
  await client.stopImpersonatingAccount({address: ISSUER.owner as Address});

  const funded = await fundToken(client, STABLE.address, payer.address, 10_000_000_000n);
  if (!funded.ok) throw new Error(funded.why);

  const now = Number((await client.getBlock()).timestamp);
  type Scene = {label: string; asset: typeof spyx; usd: bigint; units: bigint; start: number; cliff: number; duration: number; note: string};
  const scenes: Scene[] = [
    {label: "sealed, mid-schedule", asset: spyx, usd: 1_000_000_000n, units: 1_302_900_000_000_000_000n, start: now - 400 * DAY, cliff: 182 * DAY, duration: 730 * DAY, note: "Founding engineer, two-year grant"},
    {label: "revocable, before the cliff", asset: nvdax, usd: 500_000_000n, units: 2_218_900_000_000_000_000n, start: now, cliff: 3600, duration: 7200, note: "Launch bonus"},
    {label: "cancelled", asset: spyx, usd: 300_000_000n, units: 390_800_000_000_000_000n, start: now - 120 * DAY, cliff: 30 * DAY, duration: 365 * DAY, note: "Contractor retention"},
  ];

  const ids: number[] = [];
  for (const s of scenes) {
    const hash = rememberReason(s.note);
    await client.writeContract({address: STABLE.address, abi: erc20Abi, functionName: "approve", args: [ESCROW, s.usd], account: payer, chain: null});
    const tx = await client.writeContract({
      address: ESCROW,
      abi: grantEscrowAbi,
      functionName: "open",
      account: payer,
      chain: null,
      args: [{
        beneficiary: RECIPIENT,
        asset: s.asset.address as Address,
        stableAmount: s.usd,
        minOut: s.units,
        start: BigInt(s.start),
        cliff: BigInt(s.cliff),
        duration: BigInt(s.duration),
        tipBps: 50,
        reasonHash: hash,
        routerCalldata: encodeAbiParameters([{type: "address"}, {type: "uint256"}], [s.asset.address as Address, s.units]),
      }],
    });
    const receipt = await client.waitForTransactionReceipt({hash: tx});
    const ev = parseEventLogs({abi: grantEscrowAbi, logs: receipt.logs, eventName: "GrantOpened"})[0];
    if (!ev) throw new Error(`${s.label}: did not open`);
    ids.push(Number(ev.args.id));
    console.log(`grant ${ev.args.id} (${s.label}) opened in ${tx}`);
  }

  // Scene 1: sealed, then a keeper releases what is due.
  const seal = await client.writeContract({address: ESCROW, abi: grantEscrowAbi, functionName: "seal", args: [BigInt(ids[0]!)], account: payer, chain: null});
  await client.waitForTransactionReceipt({hash: seal});
  const vest = await client.writeContract({address: ESCROW, abi: grantEscrowAbi, functionName: "vest", args: [BigInt(ids[0]!)], account: keeper, chain: null});
  await client.waitForTransactionReceipt({hash: vest});
  console.log(`grant ${ids[0]} sealed in ${seal}, released by the keeper in ${vest}`);

  // Scene 3: cancelled after part of it vested.
  const revoke = await client.writeContract({address: ESCROW, abi: grantEscrowAbi, functionName: "revoke", args: [BigInt(ids[2]!)], account: payer, chain: null});
  await client.waitForTransactionReceipt({hash: revoke});
  console.log(`grant ${ids[2]} cancelled in ${revoke}`);

  console.log(`\nfork block ${await client.getBlockNumber()}; open /g/${ids.join(", /g/")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
