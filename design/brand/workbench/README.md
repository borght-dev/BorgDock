# BorgDock Workbench identity

A geometric B formed by a shared vertical rail and two docked panels. The shape refers to the app's navigation and connected workspaces: PRs, reviews, agents, worktrees, work items, files and SQL. Flat indigo, graphite and porcelain match the 3.0.0 Workbench tokens.

## Files

- `app-icon.svg`: application tile, transparent exterior.
- `app/`: PNGs at 16, 20, 24, 32, 48, 64, 128, 256, 512 and 1024 px; eight-resolution Windows ICO; macOS ICNS.
- `mark-{light,dark,black,white}.svg` and `.png`: standalone marks. Light/dark names indicate the intended background.
- `mark-current-color.svg`: single-color source for inline SVG use.
- `wordmark-{light,dark}.svg`: editable Inter wordmarks, with Segoe UI fallback. Install Inter or outline text before external print production.
- `favicon.svg`: adapts indigo to the browser's light/dark preference.
- `tray/on-{light,dark}.*`: monochrome tray artwork at 16, 20, 24, 32 and 64 px.
- `tray/{idle,passing,pending,failing}.*`: colored tray artwork in the same sizes.
- `preview.html` and `preview.png`: identity sheet with native-size icon checks.
- `concept.png`: original built-in ImageGen exploration. The production assets are clean SVG geometry, not resized concept pixels.
- `prompt.txt`: ImageGen prompt.

## Rebuild

Run `node design/brand/workbench/build.mjs` from the repository root. Requires Inkscape; set `INKSCAPE` to override its executable path. No image packages are required. Each PNG is rasterized directly at its destination size. ICO and ICNS package those PNGs without resampling.

## Integration status

App: done.

- `BorgDockLogo` React component (rail, tool-window title bars, flyout) and the duplicate logo in `PRDetailPanel`.
- Splash and every HTML entry: `public/borgdock-icon.svg` tile, `public/borgdock-favicon.svg` favicon.
- Tauri bundle icons in `src-tauri/icons/`, including `icon.icns`.
- Rust tray renderer (`src-tauri/src/platform/tray.rs`): flat status colours with a dark-ink live PR count, the mark on indigo when idle, the loading pulse kept.

Marketing site and launch video: in progress separately. Old release screenshots keep the previous branding.
