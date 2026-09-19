/**
 * WHAT THE ISSUER OF EACH xSTOCK CAN ACTUALLY DO, read from the chain.
 *
 * CLAUDE.md requires the issuer's powers to be disclosed on every asset row. A disclosure
 * is a claim about a third party, so it is held to the same rule as any other figure on a
 * Warrant surface: it must be something the chain can confirm. This is how it is confirmed,
 * and it should be re-run before submission — an upgradeable contract can change.
 *
 *   npm run check-issuer
 */
import {createPublicClient, http, keccak256, toHex, type Address} from "viem";
import {loadEnv} from "../lib/env";
import {xLayer} from "../lib/chain";
import {ASSETS} from "../lib/assets";

/** EIP-1967: keccak256("eip1967.proxy.implementation") - 1 */
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;

/** Powers worth knowing about, and what each one would mean for someone being paid. */
const POWERS: Array<{sig: string; means: string}> = [
  {sig: "mint(address,uint256)", means: "create new units"},
  {sig: "burn(address,uint256)", means: "destroy units held by any address, including yours"},
  {sig: "pause()", means: "halt all transfers"},
  {sig: "blacklist(address)", means: "block an address from transacting"},
  {sig: "addToBlockedList(address)", means: "block an address from transacting"},
  {sig: "freeze(address)", means: "freeze an address's balance"},
  {sig: "forceTransfer(address,address,uint256)", means: "move units out of your wallet"},
  {sig: "seize(address,uint256)", means: "seize units from your wallet"},
  {sig: "setMultiplier(uint256)", means: "rebase every balance"},
  {sig: "rebase(uint256)", means: "rebase every balance"},
  {sig: "transferOwnership(address)", means: "hand these powers to another address"},
];

const selector = (sig: string) => keccak256(toHex(sig)).slice(0, 10);

async function main() {
  loadEnv();
  const rpc = createPublicClient({chain: xLayer, transport: http()});

  console.log(`\nISSUER POWERS, read from X Layer   ${new Date().toISOString()}`);
  console.log("=".repeat(78));

  for (const a of ASSETS) {
    const [proxyCode, slot] = await Promise.all([
      rpc.getBytecode({address: a.address}),
      rpc.getStorageAt({address: a.address, slot: IMPL_SLOT}),
    ]);

    const impl = slot && slot !== `0x${"0".repeat(64)}`
      ? (`0x${slot.slice(-40)}` as Address)
      : undefined;

    console.log(`\n${a.symbol}  ${a.address}`);
    console.log(`  proxy           ${proxyCode ? (proxyCode.length - 2) / 2 : 0} bytes`);

    if (!impl) {
      console.log(`  not a proxy     the code at that address is the code that runs`);
      continue;
    }

    const implCode = await rpc.getBytecode({address: impl});
    console.log(`  implementation  ${impl}  (${implCode ? (implCode.length - 2) / 2 : 0} bytes)`);
    console.log(`  UPGRADEABLE     the owner can replace the code above at any time`);

    let owner: string | undefined;
    try {
      owner = await rpc.readContract({
        address: a.address,
        abi: [{name: "owner", type: "function", stateMutability: "view", inputs: [], outputs: [{type: "address"}]}],
        functionName: "owner",
      });
    } catch {
      owner = undefined;
    }
    console.log(`  owner           ${owner ?? "does not expose owner()"}`);

    const found = POWERS.filter((p) => implCode?.includes(selector(p.sig).slice(2)));
    console.log(`  can:`);
    for (const p of found) console.log(`    - ${p.means}   (${p.sig})`);
    if (found.length === 0) console.log(`    - none of the powers probed for`);

    const absent = POWERS.filter((p) => !found.includes(p));
    console.log(`  no sign of:     ${absent.map((p) => p.sig.split("(")[0]).join(", ")}`);
  }

  console.log(`\n${"=".repeat(78)}`);
  console.log(`Absence of a selector is weak evidence: a power can hide behind a proxy or a`);
  console.log(`generic call. Presence is strong evidence. Re-run this before submission.\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
