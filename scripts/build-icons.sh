#!/usr/bin/env bash
# Rasterize src-tauri/icons/icon.svg into the PNG sizes Tauri's bundler needs
# and pack them into a multi-resolution icon.ico.
#
# The SVG is the canonical source — derived from
# site/src/components/ui/BorgDockLogo.tsx so the desktop and marketing site
# stay visually in sync. Run this whenever the logo changes.
#
# Requirements:
#   - Inkscape (used as the rasterizer; antialiases vector strokes properly)
#   - Python with Pillow (used to assemble the .ico)
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ICON_DIR="$ROOT/src/BorgDock.Tauri/src-tauri/icons"
SVG="$ICON_DIR/icon.svg"

if [[ ! -f "$SVG" ]]; then
  echo "icon.svg not found at $SVG" >&2
  exit 1
fi

INKSCAPE=""
for candidate in \
  "C:/Program Files/Inkscape/bin/inkscape.exe" \
  "C:/Program Files (x86)/Inkscape/bin/inkscape.exe" \
  "$(command -v inkscape || true)"; do
  if [[ -n "$candidate" && -x "$candidate" ]]; then
    INKSCAPE="$candidate"
    break
  fi
done

if [[ -z "$INKSCAPE" ]]; then
  echo "Inkscape not found — install it or extend the search list above." >&2
  exit 1
fi

render() {
  local size="$1" out="$2"
  echo "  rendering ${size}x${size} -> $(basename "$out")"
  "$INKSCAPE" "$SVG" \
    --export-type=png \
    --export-filename="$out" \
    --export-width="$size" \
    --export-height="$size" \
    --export-background-opacity=0 >/dev/null
}

# Direct PNG outputs Tauri's bundler reads.
render 32   "$ICON_DIR/32x32.png"
render 128  "$ICON_DIR/128x128.png"
render 256  "$ICON_DIR/128x128@2x.png"
render 512  "$ICON_DIR/icon.png"

# Sizes packed into the .ico — Windows pulls 32/24/16 for the taskbar at
# different DPI and shell contexts. Keep all of them so each size renders
# crisp instead of falling back to a downsample of the largest.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
for s in 16 24 32 48 64 128 256; do
  render "$s" "$TMP/$s.png"
done

echo "  building icon.ico"
python - "$ICON_DIR/icon.ico" "$TMP" <<'PY'
import os, struct, sys

# Pillow's `Image.save(format="ICO", sizes=...)` ignores append_images on
# multiple Pillow versions and ends up writing only the first frame, so we
# emit the ICO container manually. Each entry is a PNG-payload icon (the
# modern "PNG ICO" format Windows fully supports since Vista). Using
# pre-rasterized PNGs per size keeps small entries crisp instead of
# downsampling the 256x256 source.
out_path, src_dir = sys.argv[1], sys.argv[2]
sizes = [16, 24, 32, 48, 64, 128, 256]

png_blobs = []
for s in sizes:
    with open(os.path.join(src_dir, f"{s}.png"), "rb") as f:
        png_blobs.append(f.read())

header = struct.pack("<HHH", 0, 1, len(sizes))                # ICONDIR
entry_size = 16
data_offset = len(header) + entry_size * len(sizes)

entries = bytearray()
data = bytearray()
for s, blob in zip(sizes, png_blobs):
    w = 0 if s == 256 else s                                  # 0 means 256
    h = 0 if s == 256 else s
    entries += struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(blob), data_offset)
    data += blob
    data_offset += len(blob)

with open(out_path, "wb") as f:
    f.write(header)
    f.write(entries)
    f.write(data)
print(f"  wrote {out_path}")
PY

echo "done."
