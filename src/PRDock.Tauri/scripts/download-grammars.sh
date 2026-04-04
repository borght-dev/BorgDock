#!/bin/bash
# Downloads pre-built tree-sitter grammar WASM files for syntax highlighting.
# Run from the PRDock.Tauri directory: bash scripts/download-grammars.sh
#
# Requires: tree-sitter CLI (npm install -g tree-sitter-cli)
# Alternative: download from https://github.com/nicolo-ribaudo/tree-sitter-wasm-builds/releases

set -e

GRAMMAR_DIR="public/grammars"
mkdir -p "$GRAMMAR_DIR"

# List of grammars to build
GRAMMARS=(
  "tree-sitter-typescript:typescript"
  "tree-sitter-typescript:tsx"
  "tree-sitter-javascript:javascript"
  "tree-sitter-rust:rust"
  "tree-sitter-c-sharp:c_sharp"
  "tree-sitter-json:json"
  "tree-sitter-yaml:yaml"
  "tree-sitter-css:css"
  "tree-sitter-html:html"
  "tree-sitter-markdown:markdown"
  "tree-sitter-toml:toml"
  "tree-sitter-sql:sql"
)

echo "Downloading grammar WASM files..."
echo "Note: This requires tree-sitter CLI. Install with: npm install -g tree-sitter-cli"
echo ""

for entry in "${GRAMMARS[@]}"; do
  IFS=':' read -r package lang <<< "$entry"
  WASM_FILE="$GRAMMAR_DIR/tree-sitter-${lang}.wasm"

  if [ -f "$WASM_FILE" ]; then
    echo "  [skip] $lang (already exists)"
    continue
  fi

  echo "  [build] $lang..."

  # Clone, build, copy
  TEMP_DIR=$(mktemp -d)
  git clone --depth 1 "https://github.com/tree-sitter/$package.git" "$TEMP_DIR/$package" 2>/dev/null || {
    echo "  [fail] Could not clone $package"
    rm -rf "$TEMP_DIR"
    continue
  }

  GRAMMAR_PATH="$TEMP_DIR/$package"
  # Some grammars have the language in a subdirectory (e.g., tree-sitter-typescript/typescript)
  if [ -d "$GRAMMAR_PATH/$lang" ]; then
    GRAMMAR_PATH="$GRAMMAR_PATH/$lang"
  fi

  (cd "$GRAMMAR_PATH" && tree-sitter build --wasm) 2>/dev/null || {
    echo "  [fail] Could not build $lang WASM"
    rm -rf "$TEMP_DIR"
    continue
  }

  # Find the output wasm file
  BUILT_WASM=$(find "$GRAMMAR_PATH" -name "*.wasm" -maxdepth 1 | head -1)
  if [ -n "$BUILT_WASM" ]; then
    cp "$BUILT_WASM" "$WASM_FILE"
    echo "  [done] $lang"
  else
    echo "  [fail] No WASM output for $lang"
  fi

  rm -rf "$TEMP_DIR"
done

echo ""
echo "Grammar files are in $GRAMMAR_DIR/"
ls -lh "$GRAMMAR_DIR/"*.wasm 2>/dev/null || echo "No grammar files found."
