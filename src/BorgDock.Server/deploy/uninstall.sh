#!/bin/zsh
# Stops Dispatch and closes the public route. Keeps ~/.dispatch (passkeys, sessions, settings).
/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel --https=10000 off || true
launchctl bootout "gui/$(id -u)/dev.borght.dispatch" 2>/dev/null || true
rm -f ~/Library/LaunchAgents/dev.borght.dispatch.plist
echo "Dispatch stopped and no longer reachable."
