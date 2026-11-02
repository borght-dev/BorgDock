#!/bin/zsh
# Installs or updates the BorgDock server on the Mac mini: dependencies, checks, launchd service and the public
# Funnel path route https://<this machine's tailnet name>/borgdock. Safe to run again after pulling.
# Runs beside Dispatch (dev.borght.dispatch, ~/.dispatch, port 8795) and never touches it.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd)
TAILSCALE=/Applications/Tailscale.app/Contents/MacOS/Tailscale
LABEL=dev.borght.borgdock-server
PLIST=~/Library/LaunchAgents/$LABEL.plist
DATA=~/.borgdock-server
HOST=${BORGDOCK_HOST:-$("$TAILSCALE" status --json | node -e 'process.stdin.on("data", (d) => (globalThis.s = (globalThis.s ?? "") + d)).on("end", () => console.log(JSON.parse(globalThis.s).Self.DNSName.replace(/\.$/, "")))')}
# The real binary, not fnm's per-shell symlink, which is gone once this shell exits.
NODE=$(node -p process.execPath)
PORT=8797

cd "$REPO"
npm ci
npm run typecheck
npm test

mkdir -p "$DATA/logs"
chmod 700 "$DATA"
# The browser's Origin header has no path, so the bare host is allowed for the passkey and CSRF checks.
if [[ ! -f "$DATA/config.json" ]]; then
  cat > "$DATA/config.json" <<JSON
{ "port": $PORT, "publicOrigin": "https://$HOST/borgdock", "extraOrigins": ["https://$HOST"], "rpId": "$HOST", "serverName": "BorgDock" }
JSON
  chmod 600 "$DATA/config.json"
fi
[[ -f "$DATA/clerk.json" ]] || echo "No $DATA/clerk.json yet: the app can't sign in until it exists ({publishableKey, secretKey, frontendApi})."
[[ -f "$DATA/apns.json" ]] || echo "No $DATA/apns.json yet: pushes and Live Activities stay off until it exists."

sed -e "s|__NODE__|$NODE|g" -e "s|__NODE_DIR__|${NODE:h}|g" -e "s|__REPO__|$REPO|g" -e "s|__HOME__|$HOME|g" \
  -e "s|__ORIGIN__|https://$HOST/borgdock|g" deploy/borgdock-server.plist > "$PLIST"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
# bootout returns before launchd lets go of the job; bootstrap fails with "5: Input/output error" until it has.
for i in {1..20}; do launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || break; sleep 0.5; done
launchctl bootstrap "gui/$(id -u)" "$PLIST"

# A path route on 443 beside what already serves there. Tailscale strips /borgdock, so the server sees /api/...
"$TAILSCALE" funnel --bg --https=443 --set-path=/borgdock "http://127.0.0.1:$PORT"

for i in {1..30}; do curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null && break; sleep 1; done
curl -sf "https://$HOST/borgdock/api/server" && echo
echo "BorgDock is running: https://$HOST/borgdock"
echo "Claim it from this machine: cd $REPO && DISPATCH_DATA_DIR=$DATA npm run cli -- pair"
