#!/bin/bash
# Builds every tree-sitter grammar WASM we use for syntax highlighting, straight
# from the grammar source packages on npm. The prebuilt `tree-sitter-wasms` npm
# package is pinned at 0.1.13 (last publish) and ships wasms with the *old*
# `dylink` custom section; `web-tree-sitter` ≥0.24 requires the new `dylink.0`
# section, so those prebuilt binaries fail to load with "need dylink section".
#
# This script re-builds the grammars with the bundled tree-sitter CLI (which
# matches `web-tree-sitter` and emits the new format) and drops the results
# in public/grammars/. Commit the resulting wasms.
#
# Usage: bash scripts/build-grammars.sh [NAME]
#   With no argument, builds all grammars.
#   With a name (e.g. "tsx"), builds only that one.
#
# Requires: tree-sitter CLI (devDependency in package.json). On first run it
# will download wasi-sdk into %LOCALAPPDATA%/tree-sitter — on Windows you may
# need to Unblock-File the downloaded binaries (see CLAUDE.md).

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TAURI_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TS_CLI="$TAURI_DIR/node_modules/.bin/tree-sitter"
OUT_DIR="$TAURI_DIR/public/grammars"

if [ ! -x "$TS_CLI" ]; then
  echo "tree-sitter CLI not found at $TS_CLI" >&2
  echo "Run 'npm install' in $TAURI_DIR first." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

TMP_ROOT=$(mktemp -d)
trap 'rm -rf "$TMP_ROOT"' EXIT

# build_grammar <output-name> <npm-package> [subdir-inside-package]
build_grammar() {
  local name="$1"
  local pkg="$2"
  local subdir="$3"
  local only="${ONLY:-}"

  if [ -n "$only" ] && [ "$only" != "$name" ]; then
    return 0
  fi

  local workdir="$TMP_ROOT/$name"
  mkdir -p "$workdir"

  echo "==> $name  (source: $pkg${subdir:+ /$subdir})"
  (cd "$workdir" && npm pack "$pkg" --silent >/dev/null)
  local tarball
  tarball=$(ls "$workdir"/*.tgz | head -n1)
  tar -xzf "$tarball" -C "$workdir"

  local grammar_dir="$workdir/package"
  if [ -n "$subdir" ]; then
    grammar_dir="$grammar_dir/$subdir"
  fi

  (cd "$grammar_dir" && "$TS_CLI" build --wasm -o "$OUT_DIR/tree-sitter-$name.wasm")
}

ONLY="${1:-}"

# The `tree-sitter-typescript` package ships two grammars (typescript + tsx).
build_grammar typescript tree-sitter-typescript typescript
build_grammar tsx        tree-sitter-typescript tsx
build_grammar javascript tree-sitter-javascript
build_grammar rust       tree-sitter-rust
build_grammar c_sharp    tree-sitter-c-sharp
build_grammar json       tree-sitter-json
build_grammar css        tree-sitter-css
build_grammar html       tree-sitter-html
build_grammar yaml       @tree-sitter-grammars/tree-sitter-yaml
build_grammar toml       @tree-sitter-grammars/tree-sitter-toml

echo
echo "Built grammars in $OUT_DIR:"
ls -lh "$OUT_DIR"/tree-sitter-*.wasm
