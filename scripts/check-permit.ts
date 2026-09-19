/** Which (name, version) reproduces USDT's own DOMAIN_SEPARATOR on X Layer. */
import {loadEnv} from "../lib/env";
import {STABLE} from "../lib/chain";
import {resolveDomain} from "../lib/permit";

async function main() {
  loadEnv();
  const d = await resolveDomain();
  if (!d.ok) {
    console.log(`\nNO PERMIT. ${d.why}\n`);
    process.exit(1);
  }
  console.log(`\n${STABLE.symbol} at ${STABLE.address} supports EIP-2612.`);
  console.log(`  name     ${JSON.stringify(d.value.name)}`);
  console.log(`  version  ${JSON.stringify(d.value.version)}`);
  console.log(`  chainId  ${d.value.domain.chainId}`);
  console.log(`\nA run is one transaction: the payer signs a permit off chain, for no gas.\n`);
}

main();
