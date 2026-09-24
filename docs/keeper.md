# The keeper: install, check, alert, rotate

The keeper releases what is due on every open grant, about once a minute, and earns the grant's
small tip for doing it. It is a convenience, not a dependency: `vest` is permissionless, so
anyone can release their own grant, for no tip, whether or not the keeper runs.

It is `scripts/keeper.ts`, run by pm2 as its own process, `warrant-keeper`, from
`scripts/keeper-ecosystem.config.cjs` (`--send --watch --every=60`).

| Piece | Where |
| --- | --- |
| Its key | `.env.keeper` in the app folder, mode 600. **Never** in `.env.local`: the site's env holds no private key, and `scripts/deploy-vm.sh` refuses to deploy if it finds one there. Deploys never upload, change or delete `.env.keeper` |
| What it did last | `var/keeper.json`, rewritten after every pass. The site reads it (`lib/keeper-status.ts`) to say whether grants are released automatically: only when the last clean pass is under 15 minutes old and it could send |
| Its health | `GET http://127.0.0.1:3101/health`, on the machine itself only |
| Its log | `pm2 logs warrant-keeper`; files in `~/.pm2/logs/warrant-keeper-*.log` |

**The wallet holds gas money only**, about $1 of OKB. It never holds USDT or stock beyond the
tips it earns. If the key leaked, the loss is that dollar and the tips.

## Settings (`.env.keeper`)

| Name | Needed | What it does |
| --- | --- | --- |
| `KEEPER_PRIVATE_KEY` | yes | The keeper's own key. Made on the machine by the command below and never printed |
| `NEXT_PUBLIC_GRANT_ESCROW_ADDRESS` | yes | `0xb238d76499616377abd4908e46f29c7ce50908d1`, the live GrantEscrow |
| `NEXT_PUBLIC_XLAYER_RPC` | no | First endpoint. Default `https://rpc.xlayer.tech` |
| `XLAYER_RPC_FALLBACK` | no | Asked when the first refuses. Default `https://xlayerrpc.okx.com` |
| `KEEPER_MIN_OKB` | no | Below this balance it stops sending, goes red on `/health` and alerts. Default `0.002` (about $0.24 at $118 an OKB; one release costs under 0.000005 OKB of gas) |
| `KEEPER_HEALTH_PORT` | no | Default `3101`. Bound to 127.0.0.1, never to the internet |
| `KEEPER_TELEGRAM_TOKEN` | no | A bot token from @BotFather. Unset means no alerts, silently |
| `KEEPER_TELEGRAM_CHAT` | no | The chat the alerts go to |

The keeper reads `.env.keeper` first (another file if `KEEPER_ENV_FILE` names one), then
`.env.local` for anything the first leaves unset. A variable already set in the shell wins over
both.

---

## (a) On the existing web VM (the chosen setup)

The code arrives with a normal deploy (`scripts/deploy-vm.sh`); nothing below is ever uploaded.

**1. Log in and go to the app.**

```bash
ssh -i "$WARRANT_VM_KEY" "$WARRANT_VM_HOST"     # the two values in your .env.deploy
cd ~/warrant
```

**2. Make a fresh wallet on the machine. The key goes straight into `.env.keeper`; only the
address is printed.** It refuses to overwrite an existing `.env.keeper`.

```bash
umask 077
node -e '
const fs = require("fs");
const {generatePrivateKey, privateKeyToAccount} = require("viem/accounts");
const file = ".env.keeper";
if (fs.existsSync(file)) { console.error(file + " already exists; not overwriting it."); process.exit(1); }
const key = generatePrivateKey();
fs.writeFileSync(file, "KEEPER_PRIVATE_KEY=" + key + "\n", {mode: 0o600, flag: "wx"});
console.log("Keeper address: " + privateKeyToAccount(key).address);
'
```

Write the address down: it is public and it is what you fund. Do not `cat` the file, paste the
key anywhere, or copy it off the machine. If the machine is lost, make a new keeper; the old one
held a dollar.

**3. Add the rest of the settings.**

```bash
cat >> .env.keeper <<'EOF'
NEXT_PUBLIC_GRANT_ESCROW_ADDRESS=0xb238d76499616377abd4908e46f29c7ce50908d1
NEXT_PUBLIC_XLAYER_RPC=https://rpc.xlayer.tech
XLAYER_RPC_FALLBACK=https://xlayerrpc.okx.com
KEEPER_MIN_OKB=0.002
EOF
chmod 600 .env.keeper
ls -l .env.keeper          # -rw------- ubuntu ubuntu  .env.keeper
```

**4. Fund the address with about $1 of OKB on X Layer.** From the OKX app: Withdraw → OKB →
network X Layer → paste the keeper address (the steps and what is and is not verified are in
`docs/topup.md`). Or send OKB on X Layer from any wallet you hold.

**5. One dry pass by hand.** It reads the escrow, the balance and every grant, sends nothing,
and writes `var/keeper.json`.

```bash
npx tsx scripts/keeper.ts --once
```

Expect `Key: 0x…` (your address), a line like `3 grants, nothing due.` and exit code 0. A line
starting `HELD.` says what is missing.

**6. Start it under pm2 and keep it across reboots.**

```bash
pm2 start scripts/keeper-ecosystem.config.cjs && pm2 save
pm2 ls                               # warrant-keeper  online
pm2 logs warrant-keeper --lines 20   # "Releasing, every 60s." then a line per pass
```

`pm2 save` records it with the site and the indexer, so `pm2 resurrect` at boot brings all three
back. That relies on the boot hook the site already uses; `systemctl status pm2-$USER` should
show it enabled (if not, `pm2 startup` prints the one command to run).

**7. Check its health.**

```bash
curl -s localhost:3101/health
```

```json
{"ok":true,"lastPassAt":1790253852,"lastReleaseAt":null,"balanceOkb":"0.0085","address":"0x…","sending":true,"lastError":null,"why":[]}
```

HTTP 200 when healthy, 503 when not, with the reasons in `why`. It is red when no clean pass has
happened in three intervals (three minutes), when the balance is under `KEEPER_MIN_OKB`, or
when it is meant to send and has no key. One failed pass alone does not turn it red.

**From then on** every deploy restarts it on the new code (`scripts/deploy-vm.sh`). Stop it with
`pm2 stop warrant-keeper`; remove it with `pm2 delete warrant-keeper && pm2 save`.

---

## (b) On a separate small VM

Same software, same steps, on any small Linux machine with Node 20 or newer.

```bash
sudo npm install -g pm2                     # if pm2 is not there yet
git clone https://github.com/shariqazeem/warrant.git ~/warrant-keeper
cd ~/warrant-keeper
npm ci --no-audit --no-fund
```

Then steps 2 to 7 above, in `~/warrant-keeper`, and `pm2 startup` once so it survives a reboot.
To update: `git pull && pm2 restart warrant-keeper`.

Two differences:

- The site cannot read `var/keeper.json` on another machine, so it will say the keeper is not
  running even while it is. Grants are released all the same.
- `/health` stays on that machine. Read it there, or through a tunnel:
  `ssh -L 3101:127.0.0.1:3101 <that machine>` and then `curl -s localhost:3101/health`.

---

## Alerts on Telegram

The keeper sends a message when two passes in a row fail, or when its balance is under the
minimum, at most one message every 30 minutes. Without the two settings it sends nothing and
says nothing.

1. In Telegram, talk to **@BotFather**: `/newbot`, pick a name. It answers with a token.
2. Put the token in `.env.keeper` with an editor, not on the command line (a command line is
   kept in your shell history): `nano .env.keeper`, add `KEEPER_TELEGRAM_TOKEN=<the token>`.
3. Send any message to your new bot from your own Telegram account, then find your chat id
   without printing the token:

   ```bash
   node -e 'require("dotenv").config({path: ".env.keeper", quiet: true}); fetch(`https://api.telegram.org/bot${process.env.KEEPER_TELEGRAM_TOKEN}/getUpdates`).then(r => r.json()).then(j => console.log(j.ok ? [...new Set(j.result.map(u => (u.message || u.channel_post || {}).chat?.id).filter(Boolean))] : "Telegram said: " + j.description)).catch(e => console.log("Telegram could not be reached:", e.cause?.code ?? e.message))'
   ```

   It prints a list like `[ 123456789 ]`. An empty list means the bot has had no message yet;
   "Unauthorized" means the token is wrong.

4. Add `KEEPER_TELEGRAM_CHAT=<that number>` to `.env.keeper`, then send a test message:

   ```bash
   node -e 'require("dotenv").config({path: ".env.keeper", quiet: true}); fetch(`https://api.telegram.org/bot${process.env.KEEPER_TELEGRAM_TOKEN}/sendMessage`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({chat_id: process.env.KEEPER_TELEGRAM_CHAT, text: "Warrant keeper: test alert"})}).then(r => console.log("Telegram answered", r.status)).catch(e => console.log("Telegram could not be reached:", e.cause?.code ?? e.message))'
   ```

   `Telegram answered 200` and a message on your phone means it works.
5. `pm2 restart warrant-keeper --update-env`.

---

## Rotating the key

```bash
pm2 stop warrant-keeper
mv .env.keeper .env.keeper.old && chmod 600 .env.keeper.old
```

Then step 2 again (a new key and address), copy the other settings across from
`.env.keeper.old`, fund the new address, and `pm2 restart warrant-keeper --update-env`. The old
wallet's leftover OKB and tips can be swept later from any wallet the old key is imported into;
then delete `.env.keeper.old`.

## When something is wrong

| You see | It means | Do |
| --- | --- | --- |
| `/health` red, "below the minimum" | Out of gas money; it has stopped sending | Top up the address on X Layer (`docs/topup.md`) |
| `/health` red, "last clean pass was …s ago" | Passes keep failing | `pm2 logs warrant-keeper --lines 50`; the `HELD.` lines say why (usually the endpoints refusing) |
| `/health` does not answer | The process is down | `pm2 ls`; `pm2 restart warrant-keeper`; if it is `errored`, the log's last lines say why |
| `HELD. … NEXT_PUBLIC_GRANT_ESCROW_ADDRESS is not set` | `.env.keeper` is missing that line | Step 3 |
| `KEEPER_PRIVATE_KEY is set but is not a valid private key` | The key line is damaged | Rotate (above) |
| `grant N: skipped, would revert` | Someone released it a moment earlier, or nothing whole is due yet | Nothing; the next pass looks again |
