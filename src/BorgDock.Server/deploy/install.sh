#!/bin/zsh
# Installs or updates Dispatch on the Mac mini: dependencies, web build, launchd service, public Funnel route.
# Safe to run again after pulling changes.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd)
TAILSCALE=/Applications/Tailscale.app/Contents/MacOS/Tailscale
PLIST=~/Library/LaunchAgents/dev.borght.dispatch.plist
# The real binary, not fnm's per-shell symlink, which is gone once this shell exits.
NODE=$(node -p process.execPath)
HOST=${DISPATCH_HOST:-$("$TAILSCALE" status --json | node -e 'process.stdin.on("data", (d) => (globalThis.s = (globalThis.s ?? "") + d)).on("end", () => console.log(JSON.parse(globalThis.s).Self.DNSName.replace(/\.$/, "")))')}

cd "$REPO"
npm ci
npm run typecheck
npm test
npm run build

mkdir -p ~/.dispatch/logs
chmod 700 ~/.dispatch
sed -e "s|__NODE__|$NODE|g" -e "s|__NODE_DIR__|${NODE:h}|g" -e "s|__REPO__|$REPO|g" -e "s|__HOME__|$HOME|g" \
  deploy/dev.borght.dispatch.plist > "$PLIST"
launchctl bootout "gui/$(id -u)/dev.borght.dispatch" 2>/dev/null || true
# bootout returns before launchd lets go of the job; bootstrap fails with "5: Input/output error" until it has.
for i in {1..20}; do launchctl print "gui/$(id -u)/dev.borght.dispatch" >/dev/null 2>&1 || break; sleep 0.5; done
launchctl bootstrap "gui/$(id -u)" "$PLIST"

# Public HTTPS on its own port: its own origin. Cookies are still host-wide; see docs/security.md.
"$TAILSCALE" funnel --bg --https=10000 http://127.0.0.1:8795

for i in {1..30}; do curl -sf http://127.0.0.1:8795/api/health >/dev/null && break; sleep 1; done
echo "Dispatch is running: https://$HOST:10000"
grep -h "setup code" ~/.dispatch/logs/dispatch.log 2>/dev/null | tail -1 || true
