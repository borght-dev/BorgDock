# PRDock — Developer Guide for Claude

## What is this?

A desktop app that monitors GitHub PRs as a docked sidebar. Built with Tauri + React + TypeScript in `src/PRDock.Tauri/`.

## Quick Commands

```bash
cd src/PRDock.Tauri
npm install                     # Install dependencies
npm run dev                     # Dev mode with hot reload
npm run build                   # Production build
npm run tauri dev               # Launch Tauri dev window
```

## Project Layout

```
src/PRDock.Tauri/         # Tauri + React application
```

## Implementation Status (Legacy WPF — completed before Tauri rewrite)

- **Phase 1 COMPLETE**: Core skeleton (sidebar, DI, settings, tray, hotkey, themes, work area)
- **Phase 2 COMPLETE**: GitHub integration (auth, HTTP client, PR fetching, check suites/runs, PR card UI, polling loop, grouping/sorting/filtering)
- **Phase 3 COMPLETE**: Failure details (log parsing, GitHub Actions extensions, check detail panel)
- **Phase 4 COMPLETE**: Claude Code integration (worktrees, launcher, process tracking, prompt generation)
- **Phase 5 COMPLETE**: Claude review panel (review comments, Markdown rendering, severity grouping)
- **Phase 6 COMPLETE**: Polish (notifications, floating badge, auto-hide, settings flyout, setup wizard, keyboard nav, worktree pruning, recently closed PRs, merge conflict indicators)
- **Phase 7 COMPLETE**: Hardening (retry handling, rate limit display, adaptive polling, graceful degradation)
- **Phase 8 COMPLETE**: Azure DevOps (work items, CRUD, query browser, filtering, attachments, section switcher)

Full spec: `PRDock-Implementation-Plan.md`

## Syntax highlighting (diff view)

Tree-sitter based. Three moving parts that must stay in sync:

1. **Runtime**: `web-tree-sitter` (dynamic import in `src/services/syntax-highlighter.ts`). Its wasm is served at `/web-tree-sitter.wasm` — do NOT change the `locateFile` callback without also updating `vite.config.ts`.
2. **Grammars from npm**: `tree-sitter-wasms` ships prebuilt `.wasm` for tsx, typescript, javascript, rust, c_sharp, css, html, json, yaml, toml, etc. They are copied to `/grammars/` by `vite-plugin-static-copy` in `vite.config.ts`. Dev server and prod build both go through this plugin — nothing to commit.
3. **SQL grammar (special case)**: SQL is NOT in `tree-sitter-wasms`. We build it from `@derekstride/tree-sitter-sql` using the tree-sitter CLI and commit the result to `public/grammars/tree-sitter-sql.wasm`. Rebuild with `bash scripts/build-sql-grammar.sh` (needs `tree-sitter-cli` dev dep, which auto-downloads wasi-sdk on first run). **On Windows, the wasi-sdk binaries may need `Unblock-File` before they can run** — if `wasm-ld.exe: Access is denied` appears, run `Get-ChildItem $env:LOCALAPPDATA\tree-sitter\wasi-sdk\bin\*.exe | Unblock-File`.

The `EXT_TO_GRAMMAR` map in `syntax-highlighter.ts` must only reference grammars that actually exist in `public/grammars/` or `node_modules/tree-sitter-wasms/out/`. Markdown is intentionally absent — no prebuilt wasm ships for it.

If diffs show up as plain text with no coloring, first check the browser devtools network tab for 404s on `/grammars/tree-sitter-*.wasm` or `/web-tree-sitter.wasm` — that's almost always the symptom of a broken copy pipeline.

## Self-Improvement

Whenever you learn something new that is important to remember, run into the same issue twice, or encounter an issue that might happen again — update this CLAUDE.md so the next session avoids the same pitfalls.
