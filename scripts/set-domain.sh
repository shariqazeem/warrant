#!/usr/bin/env bash
# Put Warrant on a real domain.
#
#   scripts/set-domain.sh usewarrant.xyz
#
# 1. Checks the domain's A record already points at the VM — Caddy cannot get a
#    certificate for a name that resolves somewhere else, and would retry for an hour.
# 2. Serves the domain (and www) from Caddy alongside the sslip.io address, so nothing
#    that already links to the old one breaks.
# 3. Sets SITE_URL so every share card and absolute link advertises the new address.
# 4. Rebuilds, restarts, and waits for HTTPS to answer with a real certificate.
set -euo pipefail

DOMAIN="${1:?usage: scripts/set-domain.sh <domain>}"
# Where the VM is, and the key that reaches it, live in .env.deploy (gitignored), never here:
#   WARRANT_VM_HOST=ubuntu@<address>
#   WARRANT_VM_KEY=<path to the SSH key>
[ -f "$(dirname "$0")/../.env.deploy" ] && . "$(dirname "$0")/../.env.deploy"
KEY="${WARRANT_VM_KEY:?set WARRANT_VM_KEY in .env.deploy}"
HOST="${WARRANT_VM_HOST:?set WARRANT_VM_HOST in .env.deploy}"
IP="${WARRANT_VM_IP:?set WARRANT_VM_IP in .env.deploy}"
SSH="ssh -i $KEY -o ConnectTimeout=20"

echo "→ checking DNS for $DOMAIN"
resolved=$(dig +short A "$DOMAIN" @1.1.1.1 | tail -1)
if [ "$resolved" != "$IP" ]; then
  echo "  $DOMAIN resolves to '${resolved:-nothing}', not $IP."
  echo "  Add an A record: $DOMAIN -> $IP (and www.$DOMAIN -> $IP), wait a minute, run again."
  exit 1
fi
echo "  $DOMAIN -> $IP"

echo "→ configuring the VM"
$SSH "$HOST" DOMAIN="$DOMAIN" 'bash -s' <<'REMOTE'
set -euo pipefail

sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
# Warrant. The sslip.io address stays so older links keep working.
# The previous Brief config is at /etc/caddy/Caddyfile.brief.bak.

${DOMAIN}, www.${DOMAIN}, ${WARRANT_VM_SSLIP:-} {
    log {
        output stdout
        format console
    }
    encode zstd gzip

    # ">" replaces the app's own Cache-Control instead of sending a second, conflicting one.
    @og path /opengraph-image /receipt/*/opengraph-image /*/opengraph-image
    header @og >Cache-Control "public, max-age=300, s-maxage=300"
    header Strict-Transport-Security "max-age=31536000"

    reverse_proxy 127.0.0.1:3000 {
        transport http {
            read_timeout 120s
        }
    }
}
EOF
sudo caddy validate --config /etc/caddy/Caddyfile >/dev/null
sudo systemctl reload caddy

cd ~/warrant
if grep -q '^SITE_URL=' .env.local; then
  sed -i "s#^SITE_URL=.*#SITE_URL=https://${DOMAIN}#" .env.local
else
  printf '\nSITE_URL=https://%s\n' "$DOMAIN" >> .env.local
fi
echo "  SITE_URL=https://${DOMAIN}"
NODE_OPTIONS=--max-old-space-size=700 npm run build 2>&1 | grep -E "Compiled|Failed|rror" | head -3
# Every stream closed: a restarted server that inherits this SSH session's output keeps
# the session open forever, and the deploy never returns even though it finished.
pm2 restart warrant --update-env </dev/null >/dev/null 2>&1
REMOTE

echo "→ waiting for a certificate"
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$DOMAIN/" || true)
  if [ "$code" = "200" ]; then
    echo "  https://$DOMAIN is live"
    exit 0
  fi
  sleep 5
done
echo "  HTTPS did not come up. Check: ssh in and run 'sudo journalctl -u caddy -n 50'"
exit 1
