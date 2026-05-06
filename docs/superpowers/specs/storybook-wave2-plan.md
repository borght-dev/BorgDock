# Storybook Rollout — Wave 2 Coordination Plan

**Status:** advisory snapshot. Authored after phases 1–5 merged and 4 + 6 were in flight rebasing.
**Companion to:** `docs/superpowers/specs/storybook-roadmap.md` (the index of record).

This doc captures the cumulative mock-layer state, per-window pre-flight audit findings, and the recommended next-wave team setup so the next session can fan out without re-deriving everything from scratch. It is *not* a replacement for the per-window spec format (`YYYY-MM-DD-storybook-phaseN-<window>-design.md`) — those are still required per phase.

## Cumulative mock-layer state (post phases 1–6)

This is what an agent starting wave 2 can rely on without re-implementing.

### `.storybook/main.ts` aliases

- `@tauri-apps/api/core` (Phase 1)
- `@tauri-apps/api/event` (Phase 1)
- `@tauri-apps/api/window` (Phase 1, extended Phases 3+4+6)
- `@tauri-apps/api/app` (Phase 2)
- `@tauri-apps/api/dpi` (Phase 3)
- `@tauri-apps/api/webviewWindow` (Phase 5)
- `@tauri-apps/plugin-opener` (Phase 1)
- `@tauri-apps/plugin-store` (Phase 2)
- `@tauri-apps/plugin-clipboard-manager` (Phase 4)
- `@tauri-apps/plugin-dialog` (Phase 6)
- `@tauri-apps/plugin-fs` (Phase 6)
- `@/services/windows` (Phase 1)
- `@/generated/changelog` (Phase 2)
- `@/services/ado/workitems` (Phase 6)

The catch-all `@: resolve(here, '../src')` MUST stay last.

### Window mock methods

`getCurrentWindow()` returns an object exposing:

- `close, minimize, maximize, unmaximize, isMaximized` (Phase 1)
- `hide, setSize, innerSize, scaleFactor` (Phase 3)
- `currentMonitor` (Phase 3, top-level export)
- `setTitle, getTitle` (Phase 6) plus `Window` type re-export
- `outerPosition, setPosition, onMoved` (Phase 4)

### Control surface (`window.__borgdock_storybook_tauri`)

Fields populated cumulatively across phases:

- `channels, invocations, invokeResponses` (Phase 1; `invokeResponses` widened in Phase 3 to accept `(args) => T | Promise<T>`)
- `windowState (incl. isMaximized + title)` (Phase 1, title added Phase 6)
- `pluginStore, pluginStoreBehavior, appVersion, releasesOverride` (Phase 2)
- `windowSize, monitorState` (Phase 3); `windowSize.{x,y}` extension (Phase 4)
- `pluginDialog, pluginFs, workItemScenario` (Phase 6)
- `clipboardWrites` (Phase 4)

`reset()` wipes everything. Always call it from a story decorator before driving state.

## Per-window pre-flight audit (remaining phases)

Findings produced by greping each window's component tree for `@tauri-apps/...` imports plus signal-pattern usages (`setSize|innerSize|outerPosition|setPosition|onMoved|currentMonitor|writeText|writeFile|readFile|enableAutostart`).

### File Palette (M)

- **Entry:** `file-palette-main.tsx` → `components/file-palette/FilePaletteApp.tsx`
- **Imports:** `@tauri-apps/api/core`, `@tauri-apps/api/event`, `@tauri-apps/api/window`. No plugins.
- **Invokes seen:** `open_file_viewer_window`, `open_in_editor`, `save_settings`, `window_ready`. (Subcomponents likely call more — re-audit at brainstorm time.)
- **Subcomponents that touch window mocks:** `FilePaletteCodeView.tsx`, `DiffPreview.tsx`, `FilePreview.tsx` use `setSize`/`onMoved`-class APIs. Palette auto-resize pattern confirmed — Phase 3's mocks cover this.
- **Mock gaps:** none.
- **Risk:** low. Familiar palette shape post-Worktree.

### Work Item Palette (M)

- **Entry:** `work-item-palette-main.tsx` → `components/work-item-palette/WorkItemPaletteApp.tsx`
- **Imports:** `@tauri-apps/api/core`, `@tauri-apps/api/event`, `@tauri-apps/api/window`. No plugins.
- **Invokes seen at top level:** `window_ready`. Re-audit subcomponents at brainstorm.
- **Mock gaps:** none.
- **Risk:** low. Mirrors File Palette's UX. Share fixture conventions across the two if running in parallel.

### File Viewer (M)

- **Entry:** `file-viewer-main.tsx` → component(s) under `components/file-viewer/`
- **Imports:** `@tauri-apps/api/core`, `@tauri-apps/api/window`.
- **Invokes seen:** `open_in_editor`, `save_settings` (in `FileViewerToolbar.tsx`).
- **Mock gaps:** none mock-wise.
- **Risk: tree-sitter wasm in the Storybook iframe is unverified.** `public/grammars/*.wasm` are served by Vite at `/grammars/...`, and the Storybook config is the same Vite config used by the app, so it *should* "just work." Brainstorm should include a probe story that mounts a small file in TSX, confirms the highlighter runs, and surfaces any console warnings from `[syntax-highlighter]`. CSP also matters: `'wasm-unsafe-eval'` must be in `script-src` (it is in `tauri.conf.json`; Storybook's dev/prod CSP needs the same allowance, verify).

### Pr Detail (L)

- **Entry:** `pr-detail-main.tsx` → `components/pr-detail/PRDetailApp.tsx`
- **Imports:** `@tauri-apps/api/core`, `@tauri-apps/api/window`, `@tauri-apps/plugin-opener`, `@tauri-apps/plugin-clipboard-manager`.
- **Invokes seen at top level:** `cache_init`, `window_ready`. Heavy fan-out across `FilesTab`, `OverviewTab`, `ChecksTab`, `CommentsTab` — re-audit each at brainstorm.
- **Notable:** window persistence (multi-tab UI), per-tab data caches via `useCachedTabData` hook.
- **Mock gaps:** none.
- **Risk:** L-size. Best storied per-tab to keep stories focused. Hold for wave 2b — running this against a clean master post-wave-2a minimizes rebase blast radius.

### Settings (L)

- **Entry:** `settings-main.tsx` → `components/settings/SettingsApp.tsx`
- **Imports:** `@tauri-apps/api/core`, `@tauri-apps/api/event`, `@tauri-apps/plugin-autostart` (**NEW**), `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-opener`, `@tauri-apps/plugin-clipboard-manager`.
- **Invokes seen at top level:** `check_github_auth`, `open_log_folder`, `reset_all_settings`, `set_agent_overview_enabled`, `window_ready`. **Many more in subcomponents** (settings load/save, repo scan, ado/github auth, self-test, maintenance ops) — re-audit per section at brainstorm.
- **Listens:** `settings:deep-link`.
- **Mock gaps:** **`@tauri-apps/plugin-autostart`** — needs alias + tiny mock (just `enable` + `disable`, both no-ops returning `Promise.resolve()`).
- **Notable:** `shared/primitives/*` (Toggle, Slider, Select, Field, Seg2, etc.) get implicit story coverage via Settings. Plus `RepoScanDialog`, `ConnectionEditorDialog`, `SelfTestResultsDialog`.
- **Risk:** L-size. Heaviest invoke surface in the app. Hold for wave 2b — run solo against a clean master.

## Recommended team setup

Wave 2 isn't one all-at-once fan-out. Two passes:

### Wave 2a — three M-size phases in parallel

```
TeamCreate({ team_name: "storybook-wave2a", description: "Storybook M-size windows in parallel" })
```

| Teammate name | Phase # | Window | Branch |
|---|---|---|---|
| `palette-files` | 7 | File Palette | `storybook-phase7-file-palette` |
| `palette-workitems` | 8 | Work Item Palette | `storybook-phase8-work-item-palette` |
| `viewer-files` | 9 | File Viewer | `storybook-phase9-file-viewer` |

Phase numbers continue the roadmap sequence (3 = Worktree palette, 4 = SQL, 5 = Agent Overview, 6 = Work Item Detail; next available is 7).

Three parallel M's means three rebase rounds at most (each merge triggers the survivors to re-rebase). Acceptable.

### Wave 2b — two L-size phases sequential

After wave 2a merges:

| Phase # | Window | Branch | Rationale |
|---|---|---|---|
| 10 | Settings | `storybook-phase10-settings` | Solo — heaviest invoke surface; needs new `plugin-autostart` mock; shakes out `shared/primitives/*` |
| 11 | Pr Detail | `storybook-phase11-pr-detail` | Solo — multi-tab persistence; story-per-tab |

Run sequentially, not in parallel. Each L deserves a clean master.

### Wave 3 — Main / Sidebar (Phase 12)

Reserved by roadmap as the last phase. Story it once everything else is done. Solo.

## Coordination protocol (the actual benefit of Teams)

The pain encountered in the wave-1 fan-out (phases 3–6) wasn't agent isolation — it was **central-registry conflicts at PR-merge time**. Each merge forced every other open PR to re-rebase. Teams give us coordination tools to reduce that churn.

### Shared task list

`~/.claude/tasks/storybook-wave2a/` is the single source of truth for who's doing what. Lead seeds these tasks up front:

1. **`pre-flight-audit-<window>`** — one task per teammate. Each agent runs the pre-flight grep on its target tree before writing the spec, posts findings to the task body. Catches surprise dependencies (the SQL window-position trap from wave 1 is the canonical example).
2. **`claim-roadmap-row-<N>`** — three tasks, claimed in start order via TaskUpdate. The teammate that goes second waits for first to confirm "I'm row 7" via DM before editing `docs/superpowers/specs/storybook-roadmap.md`. Avoids the row-numbering collision that hit Phase 6 needing two re-rebases.
3. **`mock-layer-coordination`** — single shared task. If a teammate needs a mock that's not in the cumulative list above, they DM the others before adding it. Avoids two PRs racing to introduce the same alias with subtly different shapes (e.g. Phase 6's `plugin-dialog` would be useless to a Settings agent if it had been redefined in parallel).

### Ordering of central-registry edits

Each teammate's plan must structure mock-layer commits to land BEFORE story commits. That way, when a peer reads the rebased main.ts/control.ts at conflict-resolution time, the most-recent canonical shape is in their git history rather than buried inside a stories-only commit.

### Branch-from-`origin/master`, not `master`

Local `master` may still be polluted with phase-3 spec/plan commits (carried over from wave 1). All branches in wave 2a must be created from `origin/master` and verified at Step 0 of each agent's workflow:

```bash
git fetch origin master
git rev-parse --abbrev-ref HEAD   # matches the assigned branch
git rev-parse HEAD                 # equals origin/master
```

Production-tree byte-identical diff verification must use `git diff origin/master...HEAD --` (read-only). Never `git diff master...HEAD --`.

## Lessons baked in (carry-forward from wave 1)

These are the operational hazards we hit in phases 3–6. The wave-2 prompts should re-state them explicitly per agent.

### Watchdog timeouts

Set explicit `timeout: 600000` on every long-running Bash call (`npm run test`, `npm run build-storybook`, `npm install`). Phase 5's first agent died at the 600s no-progress watchdog mid-build. Skipping `npm install` (when `node_modules` is already populated in the worktree) buys margin.

### Destructive git ban

The forbidden command list (re-state per agent prompt):

- `git checkout <ref> -- <path>` — Phase 5's first agent ran `git checkout origin/master -- .` and reverted everything. It recovered before the watchdog killed it but the panic was avoidable.
- `git checkout <path>` (no ref)
- `git restore`
- `git reset --hard`
- `git reset --merge`
- `git clean`
- `git rm`
- `git commit --amend`
- `git push --force` to `master`
- `git stash drop`
- `git branch -D`

`git rebase` against `origin/master` is allowed. `git push --force-with-lease` to a feature branch is allowed.

### Verification with `git diff`, never `git checkout`

To verify "production tree byte-identical to master", use `git diff origin/master...HEAD -- <paths>` (read-only). Do not "verify" with `git checkout origin/master -- .`.

### gh account protocol

- `gh auth switch --user borght-dev` before any PR-creating action
- `gh auth switch --user KvanderBorght_gomocha` immediately after
- The work account (`KvanderBorght_gomocha`) is EMU and **cannot** create PRs on the personal `borght-dev/BorgDock` repo

### Master pollution

Local `master` is currently 2 commits ahead of `origin/master` with the phase-3 spec/plan commits that should never have landed there. Until reconciled (`git branch -f master origin/master`), all wave-2 work must use `origin/master` as the base reference. Do NOT push `master` from any wave-2 worktree.

## Spawning the team — sketch

Lead session sets up the team and seeds tasks:

```
TeamCreate({
  team_name: "storybook-wave2a",
  description: "Storybook M-size windows (file palette, work item palette, file viewer) in parallel"
})
```

Seed tasks via TaskCreate:
- `pre-flight-audit-file-palette` (owner: `palette-files`)
- `pre-flight-audit-work-item-palette` (owner: `palette-workitems`)
- `pre-flight-audit-file-viewer` (owner: `viewer-files`)
- `claim-roadmap-row` (unowned, first-come)
- `mock-layer-coordination` (unowned, shared)

Spawn three teammates via Agent with `team_name: "storybook-wave2a"` and `name: "<teammate>"`. Per-teammate prompts follow the wave-1 phase-2/3 plan template, with these additions:

- Reference this doc for the cumulative mock-layer state
- Reference its own pre-flight-audit task — must be completed and findings posted before writing the spec
- Reference the destructive-git ban + watchdog timeout rules above
- Reference the roadmap-row-claim protocol — DM peers before editing `roadmap.md`

Each teammate goes through brainstorm → spec → plan → execute → verify → PR autonomously, using TaskUpdate to mark their pre-flight, spec, plan, and PR tasks as complete.

After all three PRs land, run wave 2b (Settings then Pr Detail, sequential). Wave 3 (Main / Sidebar) closes the rollout.
