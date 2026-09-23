/**
 * Walk the contracts' logs into var/warrant.db.
 *
 *   npm run index                     one pass
 *   npm run index -- --watch          keep up with the head
 *   npm run index -- --reset          forget the cursors and read everything again
 */
import {loadEnv} from "../lib/env";
import {database} from "../lib/db";
import {indexOnce} from "../lib/indexer";

const flag = (n: string) => process.argv.includes(`--${n}`);
const arg = (n: string, d: string) =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;

const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);

async function pass() {
  const reports = await indexOnce();
  if (reports.length === 0) {
    console.log(`${stamp()}  Nothing is deployed, so there is nothing to index.`);
    return;
  }
  for (const r of reports) {
    console.log(
      `${stamp()}  ${r.contract}  blocks ${r.from}..${r.to}  ` +
        `${r.windows} windows${r.narrowings > 0 ? `, narrowed ${r.narrowings}x` : ""}  ` +
        `${r.rows} new rows${r.cold ? "   (cold start: found the deploy block)" : ""}`,
    );
  }
}

async function main() {
  loadEnv();

  if (flag("reset")) {
    database().prepare(`DELETE FROM cursor`).run();
    console.log(`Cursors cleared. The next pass reads from WARRANT_START_BLOCK.`);
  }

  if (!flag("watch")) return pass();

  // Watching: a refused first pass is the same as a refused later one — behind, not dead.
  // Letting it throw here made pm2 restart the process in a loop against a throttled
  // endpoint, which only made the throttling worse.
  try {
    await pass();
  } catch (err) {
    console.error(`${stamp()}  pass failed: ${err instanceof Error ? err.message : err}`);
  }

  const every = Math.max(5, Number(arg("every", "20")));
  console.log(`\nWatching, every ${every}s. The cursor only moves on a window that read cleanly.\n`);
  for (;;) {
    await new Promise((r) => setTimeout(r, every * 1000));
    try {
      await pass();
    } catch (err) {
      // Behind is recoverable; dead is not.
      console.error(`${stamp()}  pass failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
