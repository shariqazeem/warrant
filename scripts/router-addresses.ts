/**
 * THE TWO ADDRESSES PAYROLL IS DEPLOYED AGAINST, asked of the aggregator rather than
 * copied from anywhere.
 *
 * The spender is the approval proxy and the router is what actually gets called. They are
 * different contracts and approving the wrong one is a silent failure that reads as a
 * broken route, so both are read here, checked for code on chain, and printed in the exact
 * shape `.env.local` wants.
 */
import {createPublicClient, http} from "viem";
import {loadEnv} from "../lib/env";
import {xLayer, STABLE, DEFAULT_ASSET} from "../lib/chain";
import {supportedChain, swap} from "../lib/okx";
import {isOk} from "../lib/outcome";

const PROBE_WALLET = "0x0000000000000000000000000000000000000001";

async function main() {
  loadEnv();

  const chain = await supportedChain();
  if (!isOk(chain)) {
    console.error(`HELD. ${chain.why}`);
    process.exit(1);
  }
  const spender = chain.value.dexTokenApproveAddress as `0x${string}`;

  // The router is not published as a constant anywhere; it is whatever a built swap says
  // to call. So build one and read where it points.
  const route = await swap({
    from: STABLE.address,
    to: DEFAULT_ASSET.address,
    amount: "1000000",
    slippagePercent: "1",
    userWalletAddress: PROBE_WALLET,
    receiver: PROBE_WALLET,
  });
  if (!isOk(route)) {
    console.error(`HELD. ${route.why}`);
    process.exit(1);
  }
  const router = route.value[0]?.tx.to as `0x${string}` | undefined;
  if (!router) {
    console.error("HELD. The aggregator built a swap with no target address.");
    process.exit(1);
  }

  const rpc = createPublicClient({chain: xLayer, transport: http()});
  const [routerCode, spenderCode] = await Promise.all([
    rpc.getBytecode({address: router}),
    rpc.getBytecode({address: spender}),
  ]);

  const size = (c: `0x${string}` | undefined) => (c ? (c.length - 2) / 2 : 0);

  console.log(`\n${chain.value.chainName}, chain ${chain.value.chainId}\n`);
  console.log(`  router   ${router}   ${size(routerCode)} bytes of code`);
  console.log(`  spender  ${spender}   ${size(spenderCode)} bytes of code`);

  if (size(routerCode) === 0 || size(spenderCode) === 0) {
    console.error(`\nOne of them has no code. Do not deploy against it.`);
    process.exit(1);
  }
  if (router.toLowerCase() === spender.toLowerCase()) {
    console.error(`\nThey are the same address. One of the two readings is wrong.`);
    process.exit(1);
  }

  console.log(`\nPut these in .env.local:\n`);
  console.log(`OKX_ROUTER=${router}`);
  console.log(`OKX_ROUTER_SPENDER=${spender}\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
