# Monitoring, alerts and rollback

What is watched, who notices when it breaks, how it reaches the founder, and how to go back to
the last good build in seconds.

## Who hears about what

| When this breaks | What notices | How it reaches the founder |
| --- | --- | --- |
| The site is down or erroring (the VM, Caddy, `next start`) | An outside uptime checker on `https://warrant.world/` | The checker's email, and its Telegram integration if set up |
| The keeper fails two passes in a row, or runs low on OKB | The keeper itself | A Telegram message from the keeper's bot (`docs/keeper.md`), at most one per 30 minutes |
| The keeper process is dead, or its machine is | A heartbeat checker (healthchecks.io) that stops hearing from it | The checker's email or Telegram |
| A page fails in someone's browser | The page reports it to `POST /api/client-error` | Not pushed. It is in the site's log; look after every deploy and once a day (below) |
| The indexer falls behind | Pages show the newest payments late | Not pushed. `pm2 logs warrant-indexer` |

The keeper runs on the same VM as the site, so the VM going down is caught by the site's check.

## 1. Uptime check on warrant.world

Any free HTTP checker works. Three that fit, with what to set; plan limits change, so confirm
them at sign-up (not verified here):

- **UptimeRobot**: an HTTP(s) monitor or a keyword monitor.
- **Better Stack Uptime**: an HTTP monitor.
- **Healthchecks.io** is not an HTTP checker; it is the heartbeat for the keeper (section 2).

Set up:

| Setting | Value |
| --- | --- |
| URL | `https://warrant.world/` |
| Expect | HTTP 200, and the word `Warrant` in the body (a keyword check catches a 200 that is an error page) |
| Interval | 5 minutes (or the shortest the free plan allows) |
| Alert after | 2 failures in a row, so one slow deploy restart does not page anyone |
| Alert to | The founder's email; add Telegram if the checker offers it |

A second monitor on `https://warrant.world/grants` catches a site whose front page is cached but
whose chain reads are failing.

## 2. The keeper's health

The keeper serves `GET /health` on `127.0.0.1:3101`, on the VM only (`docs/keeper.md`):

```bash
curl -s localhost:3101/health      # 200 {"ok":true,…} or 503 {"ok":false,"why":[…]}
```

An outside checker cannot reach that port, by design. Two ways to watch it from outside:

**A heartbeat (recommended).** A keeper that has died cannot send its own alert, so let a
checker notice the silence instead.

1. At healthchecks.io, create a check with period **2 minutes** and grace **5 minutes**, and
   connect its email or Telegram integration.
2. Put its ping URL in `.env.keeper` as `KEEPER_HEARTBEAT_URL=https://hc-ping.com/<its id>`
   (with an editor; it is a secret of sorts).
3. `pm2 restart warrant-keeper --update-env`.

The keeper pings after every pass whose health verdict is ok. The pings stop when the process
dies, when passes stop reading the escrow, or when the balance drops under the minimum, and the
checker alerts. Nothing is exposed to the internet.

**Or expose it through Caddy.** A keyword monitor on `https://warrant.world/keeper-health`
looking for `"ok":true`. This publishes the keeper's address, balance and last error; the
address and balance are public on chain anyway, but it is one more public URL. Add inside the
`warrant.world` block of `/etc/caddy/Caddyfile`, above `reverse_proxy`:

```caddyfile
    handle /keeper-health {
        rewrite * /health
        reverse_proxy 127.0.0.1:3101
    }
```

then `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`. Note
that `scripts/set-domain.sh` rewrites the Caddyfile, so run it again after that script.

## 3. Errors

**In people's browsers.** A page that fails shows the error line and sends the error (message,
first lines of the stack, the page, the browser; no address, nothing typed) to
`/api/client-error`, which writes one line to the site's error log, tagged `[client-error]`.

On the VM:

```bash
# The newest browser errors
grep -h '\[client-error\]' ~/.pm2/logs/warrant-error*.log | tail -n 20

# The same through pm2
pm2 logs warrant --err --lines 1000 --nostream | grep '\[client-error\]'

# Which pages fail most, and with what (counts over the whole log)
grep -h '\[client-error\]' ~/.pm2/logs/warrant-error*.log | sed 's/.*\[client-error\] //' |
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c={};for(const l of s.split("\n")){try{const j=JSON.parse(l);const k=(j.path||"?")+"  "+String(j.message||"").slice(0,90);c[k]=(c[k]||0)+1}catch{}}for(const [k,n] of Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,20))console.log(String(n).padStart(5)+"  "+k)})'

# Errors from one day only (each line carries its own "at" time)
grep -h '\[client-error\]' ~/.pm2/logs/warrant-error*.log | grep '"at":"2026-09-25'
```

**On the server.** Next.js writes a failed render to the same error log:

```bash
grep -hE '⨯|Error' ~/.pm2/logs/warrant-error.log | tail -n 30
```

**The other processes.**

```bash
pm2 ls                                          # all three online: warrant, warrant-indexer, warrant-keeper
pm2 logs warrant-indexer --lines 50 --nostream  # windows read, throttles, the cursor
pm2 logs warrant-keeper --lines 50 --nostream   # passes, RELEASED lines, HELD lines
sudo journalctl -u caddy --since "1 hour ago" --no-pager | tail -n 50
```

The pm2 logs grow without limit. `pm2 install pm2-logrotate` caps them; it downloads a pm2
module, so it is the founder's call.

## 4. After every deploy

`scripts/deploy-vm.sh` prints the status of `/`, `/pay`, `/run` and `/grants` from the VM itself.
Then, from anywhere:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://warrant.world/
```

and on the VM `pm2 ls` and `curl -s localhost:3101/health`. If the new build is wrong, roll back.

## 5. Rollback

Every deploy keeps the build it replaced in `.next-prev`. Going back is a swap and a restart:

```bash
scripts/rollback.sh --remote     # from the laptop, through .env.deploy (the host is never printed)
scripts/rollback.sh              # or on the VM, from ~/warrant
```

It prints `build <old id> → <restored id>` and the status of the four pages. Run it again and it
swaps back to the newer build. It refuses, and changes nothing, when there is no finished
previous build.

**What it does not roll back:** the indexer and the keeper run from source, which stays on the
new code, and `var/` (the database, `keeper.json`) is never touched. To take everything back:
check out the last good commit locally and run `scripts/deploy-vm.sh`. Never rewrite the pushed
history to do it; a revert commit is the record of what happened.

## 6. Before pushing, and before submission

```bash
scripts/check-secrets.sh
```

It searches every commit on every branch and the files about to be committed for private keys,
OKX credentials, GitHub and Telegram tokens and env files, prints where (never the value), and
exits 1 on a find. The repository is public: anything it finds in history is already published,
so the fix is to rotate that key, not to rewrite history.
