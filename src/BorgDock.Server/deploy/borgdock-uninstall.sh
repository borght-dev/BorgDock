#!/bin/zsh
# Stops the BorgDock server and closes its Funnel path route. Leaves ~/.borgdock-server and Dispatch alone.
set -euo pipefail
TAILSCALE=/Applications/Tailscale.app/Contents/MacOS/Tailscale
LABEL=dev.borght.borgdock-server
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f ~/Library/LaunchAgents/$LABEL.plist
"$TAILSCALE" funnel --https=443 --set-path=/borgdock off || true
echo "BorgDock server stopped; its data stays in ~/.borgdock-server."
