#!/usr/bin/env bash
# Look for secrets in everything this repository has ever committed, on every branch, and
# in the files that would be committed next. Exit 1 if anything is found.
#
#   scripts/check-secrets.sh
#
# It NEVER PRINTS A SECRET: only where one is (commit, file, line) and what kind it is. The
# repository is public, so anything found in history is already published: the fix is to
# rotate that key or token, not to rewrite history.
#
# What it looks for:
#   - an EVM private key, 64 hex digits given to a name that says key, or to privateKeyToAccount
#   - a PEM private key block
#   - OKX API credentials with a value (OKX_API_KEY, _SECRET, _PASSPHRASE; OK-ACCESS-* headers)
#   - GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_, github_pat_)
#   - a Telegram bot token (the keeper's alerts use one)
#   - a seed phrase given to MNEMONIC
#   - env files that must never be committed: .env, .env.local, .env.keeper, .env.deploy
#
# Allowed: Anvil's published test keys (#0 to #2), which the fork proofs and tests use and
# which Foundry prints to everyone who runs it.
#
# Not checked: the VM's address. Two commits of 23 Sep carried it as a default, but it is
# warrant.world's public A record, so it is not a secret; the SSH key never was in the repo.
set -uo pipefail
cd "$(dirname "$0")/.."

PATTERNS=(
  "EVM private key|(PRIVATE_KEY|PRIVKEY|[Pp]rivate[_]?[Kk]ey|_KEY|[Ss]ecret[_]?[Kk]ey)[\"'\`]?[[:space:]]*[:=][[:space:]]*[\"'\`]?(0x)?[0-9a-fA-F]{64}([^0-9a-fA-F]|$)"
  "EVM private key|privateKeyToAccount\([[:space:]]*[\"'\`](0x)?[0-9a-fA-F]{64}"
  "PEM private key|-----BEGIN ([A-Z]+ )?PRIVATE KEY-----"
  "OKX API credential|OKX_API_(KEY|SECRET|PASSPHRASE)[\"']?[[:space:]]*[:=][[:space:]]*[\"']?[A-Za-z0-9+/=_-]{6,}"
  "OKX API credential|OK-ACCESS-(KEY|SIGN|PASSPHRASE)[\"']?[[:space:]]*[:,][[:space:]]*[\"'][A-Za-z0-9+/=_-]{8,}[\"']"
  "GitHub token|(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}"
  "GitHub token|github_pat_[A-Za-z0-9_]{50,}"
  "Telegram bot token|[0-9]{8,10}:[A-Za-z0-9_-]{35}"
  "Seed phrase|MNEMONIC[\"']?[[:space:]]*[:=][[:space:]]*[\"']?[a-z]+( [a-z]+){11,}"
)

ALLOWED=(
  ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
  59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
  5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
)

FORBIDDEN_FILES='(^|/)\.env(\.local|\.keeper|\.deploy)?$'

ALLOW_ARGS=()
for k in "${ALLOWED[@]}"; do ALLOW_ARGS+=(-e "$k"); done
# Drop lines carrying an allowed test key. Done BEFORE anything is de-duplicated, so a real
# key sitting beside an allowed one is still seen.
not_allowed() { grep -v -F "${ALLOW_ARGS[@]}"; }

found=0
report() {
  found=1
  echo "  FOUND  $1"
}

echo "→ history: every commit on every branch ($(git rev-list --all | wc -l | tr -d ' ') commits)"
HISTORY="$(mktemp)"
trap 'rm -f "$HISTORY"' EXIT
# Every line ever committed was added by some commit, so the added lines are the whole
# history. Each is labelled with its commit and file, then searched.
git log --all -p --no-color --no-ext-diff --unified=0 --format='commit %H' |
  awk '
    /^commit [0-9a-f]+$/ { c = substr($2, 1, 10); next }
    /^\+\+\+ / { f = substr($0, 5); sub(/^b\//, "", f); next }
    /^\+/ { print "commit " c " " f "\t" substr($0, 2) }
  ' >"$HISTORY"
for entry in "${PATTERNS[@]}"; do
  name="${entry%%|*}"
  regex="${entry#*|}"
  while IFS= read -r where; do
    [ -n "$where" ] || continue
    report "$name in history: $where"
  done < <(grep -E -- "$regex" "$HISTORY" | not_allowed | cut -f1 | sort -u)
done
while IFS= read -r path; do
  [ -n "$path" ] || continue
  report "a file that must never be committed, in history: $path"
done < <(git log --all --name-only --format= | grep -E "$FORBIDDEN_FILES" | sort -u)

echo "→ working tree: tracked files, and untracked ones git would pick up"
for entry in "${PATTERNS[@]}"; do
  name="${entry%%|*}"
  regex="${entry#*|}"
  while IFS= read -r where; do
    [ -n "$where" ] || continue
    report "$name at $where"
  done < <(git grep --untracked -I -n -E -e "$regex" -- . 2>/dev/null | not_allowed | cut -d: -f1,2 | sort -u)
done
while IFS= read -r path; do
  [ -n "$path" ] || continue
  report "a file that must never be committed, about to be: $path"
done < <(git ls-files --cached --others --exclude-standard | grep -E "$FORBIDDEN_FILES")

if [ "$found" -ne 0 ]; then
  echo "SECRETS FOUND. Rotate anything real that is listed above; the repository is public." >&2
  exit 1
fi
echo "No secrets found."
