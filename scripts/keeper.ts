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
 *   npm run keeper                                  what it would release, and what it would earn
 *   npm run keeper -- --send                        release it, for real, once
 *   npm run keeper -- --send --watch --every=60     keep doing it; /health on 127.0.0.1:3101
 *   npm run keeper -- --once                        one pass and exit, whatever else is asked
 *
 * ENVIRONMENT, from KEEPER_ENV_FILE (default .env.keeper: mode 600, never in .env.local,
 * never deployed), then .env.local for anything it leaves unset. The shell wins over both.
 *   KEEPER_PRIVATE_KEY                 the keeper's own key; it should hold only gas money
 *   NEXT_PUBLIC_GRANT_ESCROW_ADDRESS   the escrow to release from
 *   NEXT_PUBLIC_XLAYER_RPC, XLAYER_RPC_FALLBACK   the two endpoints (lib/chain.ts)
 *   KEEPER_MIN_OKB                     below this balance it stops sending and says so
 *   KEEPER_HEALTH_PORT                 /health, bound to 127.0.0.1 only (default 3101)
 *   KEEPER_TELEGRAM_TOKEN, KEEPER_TELEGRAM_CHAT   alerts; skipped silently when unset
 *
 * After every pass it writes var/keeper.json (lib/keeper-status.ts), which the site reads to
 * say whether grants are being released automatically. Full steps: docs/keeper.md.
 */
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {dirname, resolve} from "node:path";
import {config as dotenv} from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  formatUnits,
  parseEther,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import {privateKeyToAccount, type PrivateKeyAccount} from "viem/accounts";
import {EXPLORER_TX, transport, xLayer} from "../lib/chain";
import {loadEnv} from "../lib/env";
import {escrowAddress, readGrantShelf, type Grant} from "../lib/grants";
import {
  EMPTY_KEEPER_FILE,
  KEEPER_FILE,
  alertDue,
  healthVerdict,
  parseKeeperFile,
  withRelease,
  type AlertKind,
  type KeeperFile,
  type KeeperRelease,
} from "../lib/keeper-status";
import {held, ok, shortReason, type Outcome} from "../lib/outcome";
import {grantEscrowAbi} from "../lib/payroll-abi";

/**
 * Below this the keeper stops sending. A release costs about 0.000003 OKB of gas on X Layer
 * (a vest is ~150k gas at 0.02 gwei, measured 24 Sep 2026), so 0.002 OKB is hundreds of
 * releases of margin while staying under a one-dollar float at any OKB price above $500.
 */
const DEFAULT_MIN_OKB = "0.002";
const DEFAULT_HEALTH_PORT = 3101;

const flag = (n: string) => process.argv.includes(`--${n}`);
const arg = (n: string, d: string) =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;

const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (line: string) => console.log(`${stamp()}  ${line}`);
const warn = (line: string) => console.error(`${stamp()}  ${line}`);
const nowS = () => Math.floor(Date.now() / 1000);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

type Settings = {
  send: boolean;
  watch: boolean;
  every: number;
  minWei: bigint;
  minOkb: string;
  port: number;
  envFile: string;
};

/** The keeper's file first, then .env.local for what it leaves unset. Nothing overrides the shell. */
function loadKeeperEnv(): {path: string; found: boolean} {
  const path = resolve(process.cwd(), process.env.KEEPER_ENV_FILE?.trim() || ".env.keeper");
  const found = existsSync(path);
  if (found) dotenv({path, quiet: true});
  loadEnv();
  return {path, found};
}

/** Read AFTER the env files are loaded. Never prints the key, whatever is wrong with it. */
function keeperAccount(): Outcome<PrivateKeyAccount | null> {
  const raw = process.env.KEEPER_PRIVATE_KEY?.trim();
  if (!raw) return ok(null);
  try {
    return ok(privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as Hex));
  } catch {
    return held("KEEPER_PRIVATE_KEY is set but is not a valid private key (32 bytes of hex).");
  }
}

function settings(envFile: string): Outcome<Settings> {
  // Seconds, as a plain number. "10m" used to become NaN, and Math.max(60, NaN) is NaN —
  // a timer of NaN fires at once, so the keeper spun in a loop spending gas.
  const raw = Number(arg("every", "600"));
  if (!Number.isFinite(raw)) {
    return held(`--every takes seconds as a number, like --every=600 (got "${arg("every", "")}").`);
  }
  const minOkb = process.env.KEEPER_MIN_OKB?.trim() || DEFAULT_MIN_OKB;
  let minWei: bigint;
  try {
    minWei = parseEther(minOkb);
  } catch {
    return held(`KEEPER_MIN_OKB is an amount of OKB, like 0.002 (got "${minOkb}").`);
  }
  const port = Number(process.env.KEEPER_HEALTH_PORT?.trim() || DEFAULT_HEALTH_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return held(`KEEPER_HEALTH_PORT is a port number (got "${process.env.KEEPER_HEALTH_PORT}").`);
  }
  const once = flag("once");
  return ok({
    send: flag("send"),
    watch: flag("watch") && !once,
    every: Math.max(60, raw),
    minWei,
    minOkb,
    port,
    envFile,
  });
}

// ── The status file ────────────────────────────────────────────────────────────────────

const statusPath = resolve(process.cwd(), KEEPER_FILE);

function loadStatus(): KeeperFile {
  try {
    return parseKeeperFile(readFileSync(statusPath, "utf8")) ?? {...EMPTY_KEEPER_FILE};
  } catch {
    return {...EMPTY_KEEPER_FILE};
  }
}

/** Written whole and renamed into place, so the site never reads half a file. */
function saveStatus(f: KeeperFile): void {
  try {
    mkdirSync(dirname(statusPath), {recursive: true});
    const tmp = `${statusPath}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(f, null, 2)}\n`);
    renameSync(tmp, statusPath);
  } catch (err) {
    warn(`Could not write ${KEEPER_FILE} (${shortReason(err)}).`);
  }
}

// ── Alerts ─────────────────────────────────────────────────────────────────────────────

/** One Telegram message. Unset vars mean no alerts, silently. The token is never logged. */
async function tell(text: string): Promise<boolean> {
  const token = process.env.KEEPER_TELEGRAM_TOKEN?.trim();
  const chat = process.env.KEEPER_TELEGRAM_CHAT?.trim();
  if (!token || !chat) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({chat_id: chat, text, disable_web_page_preview: true}),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) warn(`Telegram refused the alert (HTTP ${res.status}). Check KEEPER_TELEGRAM_TOKEN and _CHAT.`);
    else log("Alert sent to Telegram.");
    return true;
  } catch {
    warn("Telegram could not be reached; the alert was not sent.");
    return true;
  }
}

function alertText(kind: AlertKind, f: KeeperFile, s: Settings, failuresInARow: number): string {
  const balance = f.balanceWei === null ? "unknown" : `${formatEther(BigInt(f.balanceWei))} OKB`;
  if (kind === "failing") {
    return (
      `Warrant keeper: ${failuresInARow} passes in a row have failed, so no grant is being ` +
      `released automatically.\nLast error: ${f.lastError ?? "unknown"}\n` +
      `Balance: ${balance}. On the VM: pm2 logs warrant-keeper, or curl -s localhost:${s.port}/health`
    );
  }
  return (
    `Warrant keeper: its balance is ${balance}, below the ${s.minOkb} OKB minimum, so it has ` +
    `stopped sending. Send a little OKB on X Layer to ${f.address ?? "its address"}. ` +
    `Grants still vest; anyone can release their own.`
  );
}

// ── One pass ───────────────────────────────────────────────────────────────────────────

type PassFacts = {
  balanceWei: bigint | null;
  /** Could this pass have sent: --send, a key, and a balance at or above the minimum. */
  sending: boolean;
  released: KeeperRelease[];
  /** Why it did not finish cleanly; empty when it did. */
  problems: string[];
};

function describeDue(g: Grant): string {
  const tip = (g.releasableUnits * BigInt(g.tipBps)) / 10_000n;
  return (
    `  grant ${String(g.id).padStart(3)}  ` +
    `${formatUnits(g.releasableUnits, g.assetDecimals)} ${g.assetSymbol} due  ` +
    `-> ${formatUnits(g.releasableUnits - tip, g.assetDecimals)} to ${short(g.beneficiary)}, ` +
    `${formatUnits(tip, g.assetDecimals)} to whoever calls`
  );
}

async function releaseDue(s: Settings, account: PrivateKeyAccount | null): Promise<Outcome<PassFacts>> {
  const escrow = escrowAddress();
  if (!escrow.ok) return held(`${escrow.why} (NEXT_PUBLIC_GRANT_ESCROW_ADDRESS is not set.)`);

  const rpc = createPublicClient({chain: xLayer, transport: transport()});
  const facts: PassFacts = {balanceWei: null, sending: false, released: [], problems: []};

  if (account) {
    try {
      facts.balanceWei = await rpc.getBalance({address: account.address});
    } catch (err) {
      return held(`The keeper's balance could not be read (${shortReason(err)}).`);
    }
  }

  const shelf = await readGrantShelf(200);
  if (!shelf.ok) return held(shelf.why);
  const {grants, unread, count} = shelf.value;
  if (unread.length > 0) {
    log(`${unread.length} of ${shelf.value.asked} grants could not be read this pass; the next pass tries them again.`);
    if (grants.length === 0) return held(`None of the ${shelf.value.asked} grants could be read (${unread[0]!.why}).`);
  }

  const low = account !== null && facts.balanceWei !== null && facts.balanceWei < s.minWei;
  facts.sending = s.send && account !== null && !low;

  const due = grants.filter((g) => g.state === "open" && g.releasableUnits > 0n);
  if (due.length === 0) {
    log(`${count} grants, nothing due.`);
    if (low) log(`Balance ${formatEther(facts.balanceWei!)} OKB is below ${s.minOkb}; top up ${account!.address}.`);
    return ok(facts);
  }

  log(`${due.length} of ${count} grants have something due:`);
  for (const g of due) console.log(describeDue(g));

  if (!s.send) {
    console.log(`\n  DRY RUN. Nothing was sent. Add --send to release it.\n`);
    return ok(facts);
  }
  if (!account) {
    return held(`KEEPER_PRIVATE_KEY is missing (looked in ${s.envFile} and .env.local), so nothing was sent.`);
  }
  if (low) {
    log(
      `HELD. The keeper holds ${formatEther(facts.balanceWei!)} OKB, below the ${s.minOkb} minimum, ` +
        `so nothing was sent. Top up ${account.address} on X Layer.`,
    );
    return ok(facts);
  }

  const wallet = createWalletClient({account, chain: xLayer, transport: transport()});
  for (const g of due) {
    const call = {
      address: escrow.value as Address,
      abi: grantEscrowAbi,
      functionName: "vest",
      args: [BigInt(g.id)],
    } as const;

    // Simulate first: a grant whose releasable rounds to nothing, or which was vested by
    // someone else a block ago, costs no gas to discover. This is also what makes a pass
    // safe to repeat: whatever an earlier pass already released simply is not due.
    try {
      await rpc.simulateContract({...call, account: account.address});
    } catch (err) {
      log(`grant ${g.id}: skipped, would revert (${shortReason(err)})`);
      continue;
    }

    let hash: Hex;
    try {
      hash = await wallet.writeContract(call);
    } catch (err) {
      facts.problems.push(`grant ${g.id} could not be sent (${shortReason(err)})`);
      warn(`grant ${g.id}: could not be sent (${shortReason(err)})`);
      continue;
    }

    try {
      const receipt = await rpc.waitForTransactionReceipt({hash, timeout: 120_000});
      if (receipt.status !== "success") {
        facts.problems.push(`grant ${g.id}: ${hash} reverted`);
        warn(`grant ${g.id}: REVERTED  ${EXPLORER_TX(hash)}`);
        continue;
      }
      const vested = parseEventLogs({abi: grantEscrowAbi, eventName: "Vested", logs: receipt.logs}).find(
        (l) => l.address.toLowerCase() === escrow.value.toLowerCase() && l.args.id === BigInt(g.id),
      );
      if (!vested) {
        // Mined, but it did not say what it released. Record nothing it did not say.
        facts.problems.push(`grant ${g.id}: ${hash} carries no Vested event`);
        warn(`grant ${g.id}: mined without a Vested event  ${EXPLORER_TX(hash)}`);
        continue;
      }
      const {unitsToBeneficiary, unitsToCaller} = vested.args;
      facts.released.push({
        grantId: g.id,
        tx: hash,
        at: nowS(),
        toBeneficiary: unitsToBeneficiary.toString(),
        toCaller: unitsToCaller.toString(),
      });
      log(
        `RELEASED grant ${g.id}: ${formatUnits(unitsToBeneficiary, g.assetDecimals)} ${g.assetSymbol} ` +
          `to ${short(g.beneficiary)}, ${formatUnits(unitsToCaller, g.assetDecimals)} ${g.assetSymbol} ` +
          `to the keeper, ${receipt.gasUsed} gas  ${EXPLORER_TX(hash)}`,
      );
    } catch (err) {
      facts.problems.push(`grant ${g.id}: sent ${hash}, receipt not seen (${shortReason(err)})`);
      warn(`grant ${g.id}: sent, but the receipt did not come back (${shortReason(err)})  ${EXPLORER_TX(hash)}`);
    }
  }
  return ok(facts);
}

// ── The loop ───────────────────────────────────────────────────────────────────────────

type Keeper = {
  s: Settings;
  account: PrivateKeyAccount | null;
  status: KeeperFile;
  failuresInARow: number;
  lastAlertAt: number | null;
};

/** One pass, its record, and any alert it calls for. Never throws. Returns whether it was clean. */
async function pass(k: Keeper): Promise<boolean> {
  let result: Outcome<PassFacts>;
  try {
    result = await releaseDue(k.s, k.account);
  } catch (err) {
    // A keeper that dies on one bad pass is worse than one that logs and carries on.
    result = held(shortReason(err));
  }

  const at = nowS();
  const next: KeeperFile = {...k.status, address: k.account?.address ?? null};
  let clean: boolean;
  if (result.ok) {
    const f = result.value;
    next.balanceWei = f.balanceWei === null ? null : f.balanceWei.toString();
    next.sending = f.sending;
    for (const r of f.released) next.releases = withRelease(next.releases, r);
    if (f.released.length > 0) next.lastReleaseAt = f.released.at(-1)!.at;
    clean = f.problems.length === 0;
    next.lastError = clean ? null : f.problems.join("; ");
    if (clean) next.lastPassAt = at;
  } else {
    clean = false;
    next.lastError = result.why;
    warn(`HELD. ${result.why}`);
  }
  k.status = next;
  k.failuresInARow = clean ? 0 : k.failuresInARow + 1;
  saveStatus(next);

  const balanceLow =
    k.s.send && next.address !== null && next.balanceWei !== null && BigInt(next.balanceWei) < k.s.minWei;
  const kind = alertDue({failuresInARow: k.failuresInARow, balanceLow, lastAlertAt: k.lastAlertAt, now: at});
  if (kind && (await tell(alertText(kind, next, k.s, k.failuresInARow)))) k.lastAlertAt = at;
  return clean;
}

function serveHealth(k: Keeper): void {
  const server = createServer((req, res) => {
    if (req.method !== "GET" || (req.url ?? "").split("?")[0] !== "/health") {
      res.writeHead(404, {"content-type": "application/json"});
      res.end(JSON.stringify({ok: false, why: ["Only GET /health is served here."]}));
      return;
    }
    const f = k.status;
    const v = healthVerdict(f, {now: nowS(), intervalSeconds: k.s.every, minBalanceWei: k.s.minWei, send: k.s.send});
    res.writeHead(v.ok ? 200 : 503, {"content-type": "application/json", "cache-control": "no-store"});
    res.end(
      JSON.stringify({
        ok: v.ok,
        lastPassAt: f.lastPassAt,
        lastReleaseAt: f.lastReleaseAt,
        balanceOkb: f.balanceWei === null ? null : formatEther(BigInt(f.balanceWei)),
        address: f.address,
        sending: f.sending,
        lastError: f.lastError,
        why: v.why,
      }),
    );
  });
  server.on("error", (err) =>
    warn(`/health could not listen on 127.0.0.1:${k.s.port} (${shortReason(err)}). Releasing carries on without it.`),
  );
  server.listen(k.s.port, "127.0.0.1", () => log(`Health on http://127.0.0.1:${k.s.port}/health`));
}

async function main() {
  const env = loadKeeperEnv();
  const s = settings(env.path);
  if (!s.ok) {
    console.error(s.why);
    process.exit(2);
  }
  const account = keeperAccount();
  if (!account.ok) {
    console.error(account.why);
    process.exit(2);
  }

  console.log(
    `\nWarrant keeper. ${s.value.send ? "Releasing" : "Dry run"}` +
      `${s.value.watch ? `, every ${s.value.every}s` : ", once"}.`,
  );
  console.log(`A grant does not depend on this: anyone can release their own, for no tip.`);
  console.log(
    `Env: ${env.found ? env.path : `${env.path} (not found)`}. ` +
      `Key: ${account.value ? account.value.address : "none"}. Minimum balance: ${s.value.minOkb} OKB.\n`,
  );

  // What the last run knew is still true: when it last passed and what it released. Whether
  // it can send is not carried over; this run finds that out for itself.
  const before = loadStatus();
  const sameKey = before.address?.toLowerCase() === account.value?.address.toLowerCase();
  const k: Keeper = {
    s: s.value,
    account: account.value,
    status: {...before, sending: false, balanceWei: sameKey ? before.balanceWei : null},
    failuresInARow: 0,
    lastAlertAt: null,
  };

  if (!s.value.watch) {
    process.exit((await pass(k)) ? 0 : 1);
  }

  serveHealth(k);
  const stop = (signal: string) => {
    log(`Stopping on ${signal}.`);
    process.exit(0);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  for (;;) {
    await pass(k);
    await new Promise((r) => setTimeout(r, s.value.every * 1000));
  }
}

main().catch((err) => {
  console.error(shortReason(err));
  process.exit(1);
});
