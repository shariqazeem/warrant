/**
 * THE MONEY FLOWS, IN A REAL BROWSER, AGAINST A LOCAL FORK OF X LAYER.
 *
 * A test wallet announces itself to the page the way OKX Wallet does (EIP-6963) and signs in
 * Node with fork-only keys, so the pages run exactly as they do for a person: the permit is
 * signed, the transaction is sent, the page follows it. Every other call goes to the fork.
 * Nothing here can touch mainnet: the keys hold nothing there, and every transaction is sent
 * to 127.0.0.1.
 *
 *   grant   issue a 2-hour grant from /grants and land on its certificate; seal it; then the
 *           recipient opens it with no OKB (the button must name what is missing), is given
 *           0.01 OKB on the fork, and claims
 *   cancel  issue a revocable grant, then cancel the unvested part
 *   run     pay three people from /run in one signature and land on their payslips
 *
 * Setup, once (Playwright is not a dependency of the app):
 *   npm i --no-save playwright && npx playwright install chromium
 *   anvil --fork-url https://rpc.xlayer.tech --port 8547 --silent &
 *   FORK_URL=http://127.0.0.1:8547 npx tsx scripts/fork-scenes.ts     # funds the fork payer
 *   NEXT_PUBLIC_XLAYER_RPC=http://127.0.0.1:8547 XLAYER_RPC_FALLBACK=http://127.0.0.1:8547 \
 *     WARRANT_DB_PATH=var/fork.db NEXT_DIST_DIR=.next-fork npx next build
 *   (then the "warrant-fork" server in .claude/launch.json, on port 3200)
 *
 * Run:
 *   node scripts/fork-e2e.mjs http://localhost:3200 grant
 *
 * It needs the OKX API credentials in .env.local, because the server asks OKX DEX for a live
 * route, exactly as it does on mainnet; the route then executes against the fork's copy of
 * mainnet liquidity. Screenshots go to var/e2e/<flow>/.
 */
import {createRequire} from "node:module";
import {mkdirSync} from "node:fs";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({chromium} = require("playwright"));
} catch {
  console.error("Playwright is not installed: npm i --no-save playwright && npx playwright install chromium");
  process.exit(1);
}
const {createWalletClient, http, keccak256, stringToHex, toHex} = require("viem");
const {privateKeyToAccount} = require("viem/accounts");

const [base = "http://localhost:3200", flow = "grant"] = process.argv.slice(2);
const FORK = process.env.FORK_URL ?? "http://127.0.0.1:8547";
const out = `var/e2e/${flow}`;
mkdirSync(out, {recursive: true});

const chain = {id: 196, name: "X Layer fork", nativeCurrency: {name: "OKB", symbol: "OKB", decimals: 18}, rpcUrls: {default: {http: [FORK]}}};
// The same fork-only keys as lib/fork.ts (FORK_PAYER_KEY) and scripts/fork-scenes.ts.
const PAYER = privateKeyToAccount(keccak256(stringToHex("warrant fork proof payer")));
const RECIPIENT = privateKeyToAccount(keccak256(toHex("warrant fork recipient")));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let failures = 0;
const check = (ok, what) => {
  if (!ok) failures++;
  log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

async function forward(method, params) {
  const r = await fetch(FORK, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({jsonrpc: "2.0", id: 1, method, params})}).then((x) => x.json());
  if (r.error) throw Object.assign(new Error(r.error.message), {code: r.error.code});
  return r.result;
}

/** The wallet's side: sign what a wallet signs, send what it sends, pass everything else to the fork. */
function walletHandler(account, calls) {
  const wallet = createWalletClient({account, chain, transport: http(FORK)});
  return async (method, params) => {
    calls.push(method);
    try {
      switch (method) {
        case "eth_chainId":
          return {ok: "0xc4"};
        case "eth_accounts":
        case "eth_requestAccounts":
          return {ok: [account.address]};
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain":
          return {ok: null};
        case "wallet_requestPermissions":
        case "wallet_getPermissions":
          return {ok: [{parentCapability: "eth_accounts"}]};
        case "eth_signTypedData_v4": {
          const data = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
          const {EIP712Domain: _domain, ...types} = data.types;
          return {ok: await account.signTypedData({domain: data.domain, types, primaryType: data.primaryType, message: data.message})};
        }
        case "personal_sign":
          return {ok: await account.signMessage({message: {raw: params[0]}})};
        case "eth_sendTransaction": {
          const t = params[0];
          return {ok: await wallet.sendTransaction({to: t.to, data: t.data, value: t.value ? BigInt(t.value) : 0n, gas: t.gas ? BigInt(t.gas) : undefined})};
        }
        default:
          return {ok: await forward(method, params ?? [])};
      }
    } catch (e) {
      return {err: {code: e.code ?? -32603, message: String(e.message).split("\n")[0]}};
    }
  };
}

async function openAs(browser, account, label) {
  const ctx = await browser.newContext({viewport: {width: 1280, height: 900}});
  const page = await ctx.newPage();
  const calls = [];
  page.on("pageerror", (e) => log(`[${label}] page error: ${String(e).split("\n")[0].slice(0, 200)}`));
  await page.exposeFunction("__walletRpc", walletHandler(account, calls));
  await page.addInitScript(() => {
    const provider = {
      request: async ({method, params}) => {
        const r = await window.__walletRpc(method, params ?? []);
        if (r.err) throw Object.assign(new Error(r.err.message), {code: r.err.code});
        return r.ok;
      },
      on: () => {},
      removeListener: () => {},
    };
    const info = {uuid: "0e2c1f5a-9b1a-4e7e-9a55-7b3f4e0c9d11", name: "Test Wallet", icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=", rdns: "test.wallet"};
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {detail: Object.freeze({info, provider})}));
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
  });
  return {ctx, page, calls};
}

/** A wallet the site has seen before reconnects by itself; otherwise press its button. */
async function connect(page) {
  await page.waitForTimeout(2500);
  const button = page.getByRole("button", {name: /^(Connect )?Test Wallet$/});
  if (await button.count()) {
    await button.first().click();
    await page.waitForTimeout(1500);
  }
}

const bodyHas = (page, re, timeout = 90_000) => page.waitForFunction((src) => new RegExp(src).test(document.body.innerText), re.source, {timeout});

async function issue(browser, {seal}) {
  const payer = await openAs(browser, PAYER, "payer");
  const {page} = payer;
  await page.goto(`${base}/grants`, {waitUntil: "load", timeout: 120_000});
  await connect(page);
  await page.fill("#issue-recipient", RECIPIENT.address);
  await page.fill("#issue-amount", "5");
  await page.getByRole("button", {name: /Custom/}).click();
  await page.fill("#issue-length", "2");
  await page.selectOption('select[aria-label="Unit for how long it vests"]', "hours");
  await page.fill("#issue-cliff", "");
  if (seal) await page.getByRole("radio", {name: /Seal it/}).check();
  await page.check(".wa-issue-review input[type=checkbox]");
  const submit = page.locator("button.wa-issue-btn");
  for (let i = 0; i < 40 && !(await submit.isEnabled()); i++) await page.waitForTimeout(1500);
  check(/^Issue certificate for \$5\.00$/.test((await submit.innerText()).trim()), `the button says what it will do: "${(await submit.innerText()).trim()}"`);
  await page.screenshot({path: `${out}/1-form.png`});
  const pressed = Date.now();
  await submit.click();
  await page.waitForURL(/\/g\/\d+/, {timeout: 180_000});
  const seconds = (Date.now() - pressed) / 1000;
  check(seconds < 90, `on the certificate ${seconds.toFixed(1)} s after pressing issue`);
  check(payer.calls.includes("eth_signTypedData_v4") && payer.calls.filter((m) => m === "eth_sendTransaction").length === 1, "one permit signature and one transaction");
  const id = Number(/\/g\/(\d+)/.exec(page.url())[1]);
  await page.waitForTimeout(3000);
  const engraved = await page.evaluate(() =>
    [...document.querySelectorAll(".wa-cert")]
      .filter((c) => c.getBoundingClientRect().width > 0)
      .every((c) => c.getAnimations({subtree: true}).filter((a) => a.animationName !== "wa-vest-grow").every((a) => a.playState === "finished")),
  );
  check(engraved, `certificate ${id} engraved in`);
  await page.screenshot({path: `${out}/2-certificate.png`});
  return {payer, id};
}

async function grantFlow(browser) {
  const {payer, id} = await issue(browser, {seal: true});
  await payer.page.getByRole("button", {name: "Seal it now"}).click();
  // The seal says IRREVOCABLE in SVG, which innerText does not carry; the lede says it in words.
  await bodyHas(payer.page, /It is sealed/);
  check(true, "sealed, and the seal pressed");
  await payer.page.waitForTimeout(2500);
  await payer.page.screenshot({path: `${out}/3-sealed.png`});
  await payer.ctx.close();

  const rec = await openAs(browser, RECIPIENT, "recipient");
  await forward("anvil_setBalance", [RECIPIENT.address, "0x0"]);
  await rec.page.goto(`${base}/g/${id}`, {waitUntil: "load", timeout: 120_000});
  await connect(rec.page);
  await rec.page.waitForTimeout(4000);
  const blocked = rec.page.locator(".wa-cx button", {hasText: "Top up a little OKB to claim"});
  check((await blocked.count()) === 1 && !(await blocked.isEnabled()), "with no OKB, the claim button names what is missing");
  await rec.page.screenshot({path: `${out}/4-no-okb.png`});
  await forward("anvil_setBalance", [RECIPIENT.address, "0x2386F26FC10000"]); // 0.01 OKB, on the fork only
  const claim = rec.page.locator(".wa-cx button", {hasText: /^Claim /});
  await claim.first().waitFor({timeout: 60_000});
  for (let i = 0; i < 40 && !(await claim.first().isEnabled()); i++) await rec.page.waitForTimeout(1000);
  await claim.first().click();
  await bodyHas(rec.page, /Released to them\s+0\.0000*[1-9]/);
  check(true, "the recipient claimed, and the certificate shows it released");
  await rec.page.screenshot({path: `${out}/5-claimed.png`});
  await rec.ctx.close();
}

async function cancelFlow(browser) {
  const {payer} = await issue(browser, {seal: false});
  await payer.page.getByRole("button", {name: "Cancel the unvested part"}).first().click();
  const confirm = payer.page.locator(".wa-cx-confirm");
  check(/goes back to you/.test(await confirm.innerText()), "the confirmation says what goes back and what stays theirs");
  await payer.page.screenshot({path: `${out}/3-confirm.png`});
  await confirm.locator("button.is-primary").click();
  await bodyHas(payer.page, /Cancelled/);
  check(true, "cancelled");
  await payer.page.waitForTimeout(2500);
  await payer.page.screenshot({path: `${out}/4-cancelled.png`});
  await payer.ctx.close();
}

async function runFlow(browser) {
  const people = [1, 2, 3].map((n) => privateKeyToAccount(keccak256(stringToHex(`warrant fork run person ${n}`))).address);
  const payer = await openAs(browser, PAYER, "payer");
  const {page} = payer;
  await page.goto(`${base}/run`, {waitUntil: "load", timeout: 120_000});
  await page.waitForTimeout(2500);
  await page.fill('textarea[aria-label^="Your team"]', people.map((a, i) => `${a}, ${i + 3}, Fork test line ${i + 1}`).join("\n"));
  const act = page.locator(".wa-pay-act button.is-primary");
  await act.first().click();
  await connect(page);
  for (let i = 0; i < 60 && !(await act.first().isEnabled() && /^Pay /.test((await act.first().innerText()).trim())); i++) await page.waitForTimeout(1000);
  check((await act.first().innerText()).trim() === "Pay $12 to 3 people", `the button says what it will do: "${(await act.first().innerText()).trim()}"`);
  await page.screenshot({path: `${out}/1-lines.png`});
  await act.first().click();
  await page.waitForURL(/\/receipt\//, {timeout: 180_000});
  await bodyHas(page, /3 payslips for transaction/);
  check(payer.calls.filter((m) => m === "eth_sendTransaction").length === 1, "three people paid in one transaction");
  await page.screenshot({path: `${out}/2-payslips.png`});
  await payer.ctx.close();
}

const browser = await chromium.launch();
const started = Date.now();
try {
  if (flow === "grant") await grantFlow(browser);
  else if (flow === "cancel") await cancelFlow(browser);
  else if (flow === "run") await runFlow(browser);
  else throw new Error(`No flow "${flow}": use grant, cancel or run`);
} catch (e) {
  failures++;
  log(`FAIL ${String(e).split("\n")[0]}`);
} finally {
  await browser.close();
}
log(`${flow}: ${failures === 0 ? "passed" : `${failures} failed`} in ${((Date.now() - started) / 1000).toFixed(0)} s; screenshots in ${out}/`);
process.exit(failures === 0 ? 0 : 1);
