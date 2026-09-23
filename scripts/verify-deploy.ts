/**
 * WHAT THE DEPLOYED CONTRACTS ACTUALLY POINT AT.
 *
 * The stablecoin, the router and the approval proxy are immutable. If any of the three is
 * wrong it cannot be fixed, only redeployed, and the failure would not show up until the
 * first payment. So they are read back off the chain and compared with what this repo
 * believes, rather than trusted because a deploy script printed them.
 */
import {createPublicClient, http} from "viem";
import {loadEnv} from "../lib/env";
import {STABLE, xLayer} from "../lib/chain";
import {grantEscrowAbi, payrollAbi} from "../lib/payroll-abi";

async function main() {
  loadEnv();
  const rpc = createPublicClient({chain: xLayer, transport: http()});

  const expected = {
    // Read now, after loadEnv: STABLE was built when this module loaded, before .env.local was.
    stable: (process.env.NEXT_PUBLIC_STABLE ?? STABLE.address).toLowerCase(),
    router: (process.env.OKX_ROUTER ?? "").toLowerCase(),
    spender: (process.env.OKX_ROUTER_SPENDER ?? "").toLowerCase(),
  };

  const targets = [
    ["Payroll", process.env.NEXT_PUBLIC_PAYROLL_ADDRESS, payrollAbi],
    ["GrantEscrow", process.env.NEXT_PUBLIC_GRANT_ESCROW_ADDRESS, grantEscrowAbi],
  ] as const;

  console.log(`\nDEPLOYED ON X LAYER, read back from the chain\n${"=".repeat(74)}`);
  let bad = 0;

  for (const [name, address, abi] of targets) {
    if (!address) {
      console.log(`\n${name}: not deployed`);
      bad++;
      continue;
    }

    const code = await rpc.getBytecode({address: address as `0x${string}`});
    const [stable, router, spender] = await Promise.all([
      rpc.readContract({address: address as `0x${string}`, abi, functionName: "stable"}),
      rpc.readContract({address: address as `0x${string}`, abi, functionName: "router"}),
      rpc.readContract({address: address as `0x${string}`, abi, functionName: "routerSpender"}),
    ]);

    const check = (label: string, got: string, want: string) => {
      const ok = got.toLowerCase() === want;
      if (!ok) bad++;
      console.log(`  ${ok ? "ok  " : "WRONG"} ${label.padEnd(9)} ${got}`);
    };

    console.log(`\n${name}  ${address}`);
    console.log(`  ok   code      ${code ? (code.length - 2) / 2 : 0} bytes`);
    check("stable", stable as string, expected.stable);
    check("router", router as string, expected.router);
    check("spender", spender as string, expected.spender);
  }

  console.log(`\n${"=".repeat(74)}`);
  console.log(
    bad === 0
      ? "Both contracts point at exactly what they were meant to. These are immutable.\n"
      : `${bad} thing(s) wrong. These are IMMUTABLE — redeploy rather than work around it.\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
