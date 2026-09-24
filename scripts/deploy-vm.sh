#!/usr/bin/env bash
# Ship Warrant to the VM.
#
#   scripts/deploy-vm.sh
#
# Syncs the code, reinstalls dependencies ONLY when package-lock.json changed (a full
# `npm ci` on this box takes nine minutes and is almost never needed), builds with the
# heap capped for a 1 GB machine, and restarts.
#
# The build goes into .next-build, NOT .next: `next build` empties its output folder
# first, and the live server reads its pages from .next, so building in place took the
# site down for the six minutes a build takes here. Now the old build serves until the
# new one is finished, the two folders swap, and the server restarts onto it. The
# previous build stays in .next-prev, so going back is two renames and a restart.
#
# The server's .env.local is never overwritten and never contains a private key: it is
# excluded from the sync on purpose. So is .lock-hash, the marker that lets a deploy skip
# the install — rsync --delete would otherwise remove it every time, because it exists only
# on the VM, and every deploy would reinstall the world.
set -euo pipefail

# Where the VM is, and the key that reaches it, live in .env.deploy (gitignored), never here:
#   WARRANT_VM_HOST=ubuntu@<address>
#   WARRANT_VM_KEY=<path to the SSH key>
[ -f "$(dirname "$0")/../.env.deploy" ] && . "$(dirname "$0")/../.env.deploy"
KEY="${WARRANT_VM_KEY:?set WARRANT_VM_KEY in .env.deploy}"
HOST="${WARRANT_VM_HOST:?set WARRANT_VM_HOST in .env.deploy}"
SSH="ssh -i $KEY -o ConnectTimeout=20 -o ServerAliveInterval=30 -o ServerAliveCountMax=4"

cd "$(dirname "$0")/.."

echo "→ syncing"
rsync -az --delete -e "$SSH" \
  --exclude node_modules --exclude .next --exclude var --exclude .env.local --exclude .git \
  --exclude .env.deploy --exclude .env.keeper \
  --exclude from-scrip --exclude contracts/out --exclude contracts/cache --exclude contracts/lib \
  --exclude tsconfig.tsbuildinfo --exclude .DS_Store --exclude deploy.log --exclude .lock-hash \
  --exclude .next-build --exclude .next-prev --exclude .next-check --exclude .build.log --exclude .claude/worktrees \
  ./ "$HOST:~/warrant/"

echo "→ building on the VM (the live site keeps serving meanwhile)"
$SSH "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
cd ~/warrant

if grep -q PRIVATE_KEY .env.local 2>/dev/null; then
  echo "REFUSING: the server env contains a private key. It should never hold one." >&2
  exit 1
fi

LOCK_HASH=$(sha256sum package-lock.json | cut -d" " -f1)
if [ "$(cat .lock-hash 2>/dev/null || true)" != "$LOCK_HASH" ] || [ ! -d node_modules ]; then
  echo "  dependencies changed — installing"
  npm ci --no-audit --no-fund 2>&1 | tail -2
  echo "$LOCK_HASH" > .lock-hash
else
  echo "  dependencies unchanged — skipping install"
fi

rm -rf .next-build
if ! NEXT_TELEMETRY_DISABLED=1 NEXT_DIST_DIR=.next-build NODE_OPTIONS=--max-old-space-size=700 \
    npm run build </dev/null > .build.log 2>&1; then
  echo "BUILD FAILED — the live site is untouched. The last lines:" >&2
  tail -25 .build.log >&2
  exit 1
fi
grep -E "Compiled" .build.log | head -2

rm -rf .next-prev
[ -d .next ] && mv .next .next-prev
mv .next-build .next
# A tab opened before this deploy still asks for the last build's code files by name. Keep
# them beside the new ones (the names are content hashes, so nothing is overwritten), and an
# open page keeps working instead of failing on its next click.
if [ -d .next-prev/static ]; then cp -Rn .next-prev/static/. .next/static/ 2>/dev/null || true; fi

# Every stream closed: a restarted server that inherits this SSH session's output keeps
# the session open forever, and the deploy never returns even though it finished.
pm2 restart warrant --update-env </dev/null >/dev/null 2>&1
# The indexer runs from source, so new indexer code needs a restart too.
pm2 restart warrant-indexer --update-env </dev/null >/dev/null 2>&1 || true
# So does the keeper (docs/keeper.md). Where it is not installed, this does nothing. Its key
# lives in .env.keeper, which the sync never touches; keep it readable by its owner only.
if [ -f .env.keeper ]; then chmod 600 .env.keeper; fi
pm2 restart warrant-keeper --update-env </dev/null >/dev/null 2>&1 || true
sleep 5
for p in "" pay run grants; do
  printf "  /%-7s %s\n" "$p" "$(curl -s -o /dev/null --max-time 60 -w '%{http_code}' "http://127.0.0.1:3000/$p")"
done
# Share cards fetch their faces once per process (lib/og-fonts.ts); draw one now so the first
# link pasted after a deploy unfurls in a second instead of ten.
printf "  %-8s %s\n" "card" "$(curl -s -o /dev/null --max-time 60 -w '%{http_code}' "http://127.0.0.1:3000/opengraph-image")"
exit 0
REMOTE

echo "→ live at ${WARRANT_SITE:-https://warrant.world}"
