#!/bin/zsh
# Runs the web end-to-end check against a throwaway server and database.
set -e
cd "$(dirname "$0")/.."
DATA=$(mktemp -d /tmp/dispatch-e2e-XXXX)
cp ~/.dispatch/t3-session.json "$DATA/" 2>/dev/null || cp /tmp/dispatch-dev/t3-session.json "$DATA/"
export DISPATCH_DATA_DIR=$DATA PORT=8797 DISPATCH_ORIGIN=http://localhost:8797
node --no-warnings server/src/main.ts > "$DATA/server.log" 2>&1 &
SERVER=$!
trap "kill $SERVER 2>/dev/null; rm -rf $DATA" EXIT
for i in {1..40}; do curl -sf localhost:8797/api/health >/dev/null && break; sleep 0.5; done
CODE=$(sed -n 1p "$DATA/setup-code.txt")
sleep 8   # first ADO + T3 sync
DISPATCH_URL=http://localhost:8797 SETUP_CODE=$CODE node e2e/web.e2e.mjs
