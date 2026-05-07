#!/bin/bash
# Builds the tree-sitter SQL grammar WASM used for SQL syntax highlighting in diffs.
#
# Why this exists: SQL is not in the prebuilt `tree-sitter-wasms` npm package, so we
# build it from `@derekstride/tree-sitter-sql` source. All other grammars (tsx, ts,
# rust, c_sharp, etc.) are copied at build time by `vite-plugin-static-copy` from
# `node_modules/tree-sitter-wasms/out/` — see vite.config.ts.
#
# Usage: bash scripts/build-sql-grammar.sh
# Requires:
#   - tree-sitter CLI (devDependency in package.json) — installed by `bun install`.
#   - npm CLI on PATH for `npm pack` (bun has no registry-fetch equivalent).
#
# Output: public/grammars/tree-sitter-sql.wasm (commit this file to the repo).

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TAURI_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$TAURI_DIR/../.." && pwd)"
OUTPUT="$TAURI_DIR/public/grammars/tree-sitter-sql.wasm"
# bun's hoisted workspace install puts CLIs at the repo root's node_modules/.bin.
if [ -x "$REPO_ROOT/node_modules/.bin/tree-sitter" ]; then
  TS_CLI="$REPO_ROOT/node_modules/.bin/tree-sitter"
else
  TS_CLI="$TAURI_DIR/node_modules/.bin/tree-sitter"
fi

if [ ! -x "$TS_CLI" ]; then
  echo "tree-sitter CLI not found at $TS_CLI" >&2
  echo "Run 'bun install' from the repo root first." >&2
  exit 1
fi

mkdir -p "$TAURI_DIR/public/grammars"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "Downloading @derekstride/tree-sitter-sql source..."
(cd "$TMP" && npm pack @derekstride/tree-sitter-sql --silent >/dev/null)
tar -xzf "$TMP"/derekstride-tree-sitter-sql-*.tgz -C "$TMP"

echo "Building SQL WASM (requires wasi-sdk — tree-sitter CLI will download it if needed)..."
(cd "$TMP/package" && "$TS_CLI" build --wasm -o "$OUTPUT")

echo "Built: $OUTPUT"
ls -lh "$OUTPUT"
