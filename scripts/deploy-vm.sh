#!/usr/bin/env bash
# Ship Warrant to the VM.
#
#   scripts/deploy-vm.sh
#
# Syncs the code, reinstalls dependencies ONLY when package-lock.json changed (a full
# `npm ci` on this box takes nine minutes and is almost never needed), builds with the
# heap capped for a 1 GB machine, and restarts. The old server keeps serving until the
# new build is ready, so the site stays up throughout.
#
# The server's .env.local is never overwritten and never contains a private key: it is
# excluded from the sync on purpose. So is .lock-hash, the marker that lets a deploy skip
# the install — rsync --delete would otherwise remove it every time, because it exists only
# on the VM, and every deploy would reinstall the world.
set -euo pipefail

KEY="${WARRANT_VM_KEY:-$HOME/Downloads/ssh-key-2025-10-14.key}"
HOST="${WARRANT_VM_HOST:-ubuntu@141.148.215.239}"
SSH="ssh -i $KEY -o ConnectTimeout=20"

cd "$(dirname "$0")/.."

echo "→ syncing"
rsync -az --delete -e "$SSH" \
  --exclude node_modules --exclude .next --exclude var --exclude .env.local --exclude .git \
  --exclude from-scrip --exclude contracts/out --exclude contracts/cache --exclude contracts/lib \
  --exclude tsconfig.tsbuildinfo --exclude .DS_Store --exclude deploy.log --exclude .lock-hash \
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

NODE_OPTIONS=--max-old-space-size=700 npm run build 2>&1 | grep -E "Compiled|Failed|rror" | head -5
# Every stream closed: a restarted server that inherits this SSH session's output keeps
# the session open forever, and the deploy never returns even though it finished.
pm2 restart warrant --update-env </dev/null >/dev/null 2>&1
sleep 4
for p in "" pay run grants; do
  printf "  /%-7s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000/$p")"
done
REMOTE

echo "→ live at https://141-148-215-239.sslip.io"
