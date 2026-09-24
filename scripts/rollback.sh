#!/usr/bin/env bash
# Put the previous build of the site back.
#
#   scripts/rollback.sh            on the VM, from ~/warrant
#   scripts/rollback.sh --remote   from a laptop: the same thing over SSH, using .env.deploy
#
# Every deploy (scripts/deploy-vm.sh) keeps the build it replaced in .next-prev. This swaps
# .next and .next-prev and restarts the site, so it takes seconds, and running it a second
# time swaps them back: a rollback of a rollback is the new build again.
#
# WHAT IT DOES NOT ROLL BACK: the source on the VM. The indexer and the keeper run from
# source (tsx), so they stay on the new code. To take those back too, check out the last
# good commit locally and run scripts/deploy-vm.sh. The database (var/) is never touched.
set -euo pipefail

if [ "${1:-}" = "--remote" ]; then
  # Where the VM is lives in .env.deploy (gitignored), exactly as for a deploy. The host is
  # never printed.
  [ -f "$(dirname "$0")/../.env.deploy" ] && . "$(dirname "$0")/../.env.deploy"
  KEY="${WARRANT_VM_KEY:?set WARRANT_VM_KEY in .env.deploy}"
  HOST="${WARRANT_VM_HOST:?set WARRANT_VM_HOST in .env.deploy}"
  SSH="ssh -i $KEY -o ConnectTimeout=20 -o ServerAliveInterval=30 -o ServerAliveCountMax=4"
  echo "→ rolling back the site on the VM"
  # This same file, run there. It need not have been deployed yet.
  $SSH "$HOST" 'bash -s -- --on-vm' < "$0"
  echo "→ done: ${WARRANT_SITE:-https://warrant.world}"
  exit 0
fi

if [ "${1:-}" = "--on-vm" ]; then
  cd ~/warrant
else
  cd "$(dirname "$0")/.."
fi

if [ ! -d .next-prev ]; then
  echo "Nothing to roll back to: there is no .next-prev here. The live build is untouched." >&2
  exit 1
fi
if [ ! -f .next-prev/BUILD_ID ]; then
  echo "REFUSING: .next-prev has no BUILD_ID, so it is not a finished build. The live build is untouched." >&2
  exit 1
fi

was="$(cat .next/BUILD_ID 2>/dev/null || echo none)"
now="$(cat .next-prev/BUILD_ID)"

rm -rf .next-swap
if [ -d .next ]; then mv .next .next-swap; fi
mv .next-prev .next
if [ -d .next-swap ]; then mv .next-swap .next-prev; fi
# A tab opened on the build being retired still asks for its code files by name. Keep them
# beside the restored ones (content-hashed names, so nothing is overwritten).
if [ -d .next-prev/static ]; then cp -Rn .next-prev/static/. .next/static/ 2>/dev/null || true; fi

# Every stream closed, or an SSH session that runs this never returns (see deploy-vm.sh).
pm2 restart warrant --update-env </dev/null >/dev/null 2>&1
echo "  build $was → $now (run this again to swap back)"
sleep 5
for p in "" pay run grants; do
  printf "  /%-7s %s\n" "$p" "$(curl -s -o /dev/null --max-time 60 -w '%{http_code}' "http://127.0.0.1:3000/$p")"
done
