/**
 * THE KEEPER. Releases what is due on every open grant.
 *
 * It is deliberately thin. Because the escrow holds the asset rather than the stablecoin,
 * a vest is a transfer: there is no route to fetch, no price to post, no minimum to
 * negotiate. The keeper's whole job is to notice that time has passed.
 *
 * IT IS ALSO NOT REQUIRED. `vest` is permissionless, so a beneficiary can always release
 * their own grant — for no tip — and this process existing is a convenience, not a
 * dependency. A grant does not stop working when the keeper does.
 *
 *   npm run keeper                 what it would release, and what it would earn
 *   npm run keeper -- --send       release it, for real
 *   npm run keeper -- --send --watch --every=600   keep doing it
 */
import {createPublicClient, createWalletClient, formatUnits, http, type Address} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {loadEnv} from "../lib/env";
import {EXPLORER_TX, xLayer} from "../lib/chain";
import {escrowAddress, readGrants, type Grant} from "../lib/grants";
import {grantEscrowAbi} from "../lib/payroll-abi";
import {isOk} from "../lib/outcome";

const flag = (n: string) => process.argv.includes(`--${n}`);
const arg = (n: string, d: string) =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;

const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);

async function pass(send: boolean): Promise<void> {
  const escrow = escrowAddress();
  if (!isOk(escrow)) {
    console.error(`${stamp()}  HELD. ${escrow.why}`);
    return;
  }

  const grants = await readGrants(200);
  if (!isOk(grants)) {
    console.error(`${stamp()}  HELD. ${grants.why}`);
    return;
  }

  const due = grants.value.filter((g) => g.state === "open" && g.releasableUnits > 0n);

  if (due.length === 0) {
    console.log(`${stamp()}  ${grants.value.length} grants, nothing due.`);
    return;
  }

  const key = process.env.KEEPER_PRIVATE_KEY?.trim();
  const rpc = createPublicClient({chain: xLayer, transport: http()});

  console.log(`${stamp()}  ${due.length} of ${grants.value.length} grants have something due:`);
  for (const g of due) {
    const tip = (g.releasableUnits * BigInt(g.tipBps)) / 10_000n;
    console.log(
      `  grant ${String(g.id).padStart(3)}  ` +
        `${formatUnits(g.releasableUnits, g.assetDecimals)} ${g.assetSymbol} due  ` +
        `-> ${formatUnits(g.releasableUnits - tip, g.assetDecimals)} to ${g.beneficiary.slice(0, 10)}…, ` +
        `${formatUnits(tip, g.assetDecimals)} to whoever calls`,
    );
  }

  if (!send) {
    console.log(`\n  DRY RUN. Nothing was sent. Add --send to release it.\n`);
    return;
  }

  if (!key) {
    console.error(`\n  HELD. KEEPER_PRIVATE_KEY is missing from .env.local.\n`);
    return;
  }

  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);
  const wallet = createWalletClient({account, chain: xLayer, transport: http()});

  for (const g of due) {
    try {
      // Simulate first: a grant whose releasable rounds to nothing, or which was vested
      // by someone else a block ago, should cost no gas to discover.
      await rpc.simulateContract({
        address: escrow.value as Address,
        abi: grantEscrowAbi,
        functionName: "vest",
        args: [BigInt(g.id)],
        account: account.address,
      });
    } catch (err) {
      const why = err instanceof Error ? err.message.split("\n")[0] : String(err);
      console.log(`  grant ${g.id}: skipped, would revert (${why})`);
      continue;
    }

    const hash = await wallet.writeContract({
      address: escrow.value as Address,
      abi: grantEscrowAbi,
      functionName: "vest",
      args: [BigInt(g.id)],
    });
    const receipt = await rpc.waitForTransactionReceipt({hash});
    console.log(
      `  grant ${g.id}: ${receipt.status}  ${receipt.gasUsed} gas  ${EXPLORER_TX(hash)}`,
    );
  }
}

async function main() {
  loadEnv();
  const send = flag("send");
  const watch = flag("watch");
  // Seconds, as a plain number. "10m" used to become NaN, and Math.max(60, NaN) is NaN —
  // a timer of NaN fires at once, so the keeper spun in a loop spending gas.
  const raw = Number(arg("every", "600"));
  if (!Number.isFinite(raw)) {
    console.error(`--every takes seconds as a number, like --every=600 (got "${arg("every", "")}").`);
    process.exit(2);
  }
  const every = Math.max(60, raw);

  console.log(
    `\nWarrant keeper. ${send ? "Releasing" : "Dry run"}${watch ? `, every ${every}s` : ", once"}.`,
  );
  console.log(`A grant does not depend on this: anyone can release their own, for no tip.\n`);

  await pass(send);
  if (!watch) return;

  for (;;) {
    await new Promise((r) => setTimeout(r, every * 1000));
    try {
      await pass(send);
    } catch (err) {
      // A keeper that dies on one bad pass is worse than one that logs and carries on.
      console.error(`${stamp()}  pass failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
