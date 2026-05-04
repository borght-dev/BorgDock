# Settings Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the right-side `SettingsFlyout` with a full Tauri window that opens via `open_settings_window`, hosts a 232 px rail of grouped sections, scrollable card-based content, deep field-level search, and adopts the design from `docs/superpowers/specs/2026-05-04-settings-screen-redesign-design.md`.

**Architecture:** New singleton Tauri window (`settings.html` → `src/settings-main.tsx` → `<SettingsApp/>`), modelled on the existing agent-overview window. Reuses `WindowTitleBar` for chrome with a Settings breadcrumb in the meta slot. Existing `<X>Section.tsx` components keep their store wiring but get bodies rewritten on top of new shared primitives (`Toggle`, `Slider`, `Seg2`, `Select`, `Checkbox`, `Field`, `SectionHeader`, `TextInput`). Net-new affordances added per spec (rate-limit bar, repo folder scan, ADO match-by, recent releases, clear-cache, reset-everything, diagnostics, run-self-test). Pre-adoption (no users) → no settings migration code; `serde(default)` handles missing fields.

**Tech Stack:** Tauri 2 + Rust (windowing, new commands), React 18 + TypeScript + Tailwind v4 (UI), Zustand (settings store), Vitest (TS tests), cargo test (Rust), tokio + oneshot for thread marshalling.

---

## Pre-flight: Worktree

### Task 0: Create worktree for implementation

**Files:**
- Worktree path: `E:\BorgDock\.worktrees\settings-screen-redesign` (in-repo, gitignored)

- [ ] **Step 1: Verify clean status on master and create worktree**

```bash
cd /e/BorgDock
git status -s | grep -v "^??\|^ M src-tauri/icons\|^ M src-tauri/capabilities/pr-detail.json"  # confirm no other changes
git worktree add -b settings-screen-redesign .worktrees/settings-screen-redesign master
cd .worktrees/settings-screen-redesign/src/BorgDock.Tauri
npm install
```

Expected: worktree created, npm install completes. `.worktrees/` is already in `.gitignore`, so the inner checkout doesn't show up as nested-untracked content in the parent.

- [ ] **Step 2: Set memory marker so future sessions know which worktree this lives in**

No commit. Just record the path in your scratch notes:
```
WORKTREE  = E:\BorgDock\.worktrees\settings-screen-redesign
NPM_CWD   = $WORKTREE/src/BorgDock.Tauri
CARGO_CWD = $WORKTREE/src/BorgDock.Tauri/src-tauri
```

All subsequent tasks run inside `$NPM_CWD` or `$CARGO_CWD`. On Windows MSYS, prefix `cargo` calls with `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'` (per CLAUDE.md).

---

## Phase 1 — Window scaffolding

This phase ends with: clicking the gear icon in the main window opens a new `BorgDock — Settings` window that displays a "Settings (placeholder)" message. No real content yet, but the window exists, geometry persists, and existing settings routes still work.

### Task 1: Add settings entry HTML + main file

**Files:**
- Create: `settings.html` (repo root)
- Create: `src/settings-main.tsx`
- Create: `src/components/settings/SettingsApp.tsx` (placeholder shell, replaced in Task 14)

- [ ] **Step 1: Create `settings.html`** (mirrors `agent-overview.html`)

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BorgDock — Settings</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/settings-main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/settings-main.tsx`** (mirrors `src/main-agent-overview.tsx`)

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import './styles/index.css';
import { SettingsApp } from '@/components/settings/SettingsApp';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SettingsApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
```

- [ ] **Step 3: Create placeholder `SettingsApp.tsx`** (full shell lands in Task 14)

```tsx
import { WindowTitleBar } from '@/components/shared/WindowTitleBar';

export function SettingsApp() {
  return (
    <div className="flex h-screen flex-col bg-[var(--color-background)] text-[var(--color-text-primary)]">
      <WindowTitleBar title="BorgDock — Settings" />
      <main className="flex-1 grid place-items-center text-sm text-[var(--color-text-tertiary)]">
        Settings (placeholder)
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add settings.html src/settings-main.tsx src/components/settings/SettingsApp.tsx
git commit -m "feat(settings): add settings.html entry + placeholder SettingsApp shell"
```

### Task 2: Register settings entry in vite config

**Files:**
- Modify: `vite.config.ts:84-100`

- [ ] **Step 1: Add the `settings` key to `rollupOptions.input`**

In `vite.config.ts`, the `build.rollupOptions.input` block currently ends with `'agent-overview': path.resolve(__dirname, "agent-overview.html")`. Add a sibling line:

```ts
build: {
  rollupOptions: {
    input: {
      main: path.resolve(__dirname, "index.html"),
      flyout: path.resolve(__dirname, "flyout.html"),
      'work-item-palette': path.resolve(__dirname, "work-item-palette.html"),
      'workitem-detail': path.resolve(__dirname, "workitem-detail.html"),
      'pr-detail': path.resolve(__dirname, "pr-detail.html"),
      sql: path.resolve(__dirname, "sql.html"),
      worktree: path.resolve(__dirname, "worktree.html"),
      'whats-new': path.resolve(__dirname, "whats-new.html"),
      filepalette: path.resolve(__dirname, "file-palette.html"),
      fileviewer: path.resolve(__dirname, "file-viewer.html"),
      'agent-overview': path.resolve(__dirname, "agent-overview.html"),
      settings: path.resolve(__dirname, "settings.html"),
    },
  },
},
```

Also extend the `coverage.exclude` array so `settings-main.tsx` is treated like other window entry files:

```ts
exclude: [
  // …existing entries…
  "src/main-agent-overview.tsx",
  "src/settings-main.tsx",
  // …
],
```

- [ ] **Step 2: Verify build still works**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds, output includes `settings.html` in dist.

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "build(settings): register settings.html as Vite entry"
```

### Task 3: Rust side — settings/window.rs module

**Files:**
- Create: `src-tauri/src/settings/window.rs`
- Modify: `src-tauri/src/settings/mod.rs:1` (add `pub mod window;`)
- Modify: `src-tauri/src/settings/models.rs` — add `settings: Option<WindowGeometry>` to a per-window-geometry place. Inspect first; if `WindowGeometry` is currently embedded inside `AgentOverviewSettings`, lift the type to a top-level `pub struct WindowGeometry` (verify it's already public per the agent_overview window code at line 56) and extend `UiSettings` (or a new `WindowGeometries` struct on `AppSettings`) with `pub settings_window: Option<WindowGeometry>`.

- [ ] **Step 1: Add the geometry field to `AppSettings`**

In `src-tauri/src/settings/models.rs`, add after `repo_priority`:

```rust
#[serde(default)]
pub settings_window: Option<WindowGeometry>,
```

Confirm `WindowGeometry` is `pub` (it is — the agent-overview window references it at `crate::settings::models::WindowGeometry`). If it's nested inside another struct, lift it to module scope.

- [ ] **Step 2: Write `src-tauri/src/settings/window.rs`** (mirrors `agent_overview/window.rs`)

```rust
use crate::settings::{load_settings_internal, save_settings_internal};
use tauri::{
    Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder,
};

const DEFAULT_W: f64 = 1080.0;
const DEFAULT_H: f64 = 760.0;
const MIN_W: f64 = 880.0;
const MIN_H: f64 = 560.0;

#[tauri::command]
pub async fn open_settings_window(
    app: tauri::AppHandle,
    section: Option<String>,
) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let app_for_run = app.clone();
    app.run_on_main_thread(move || {
        let app = app_for_run;
        let result = (|| -> Result<(), String> {
            // Singleton: focus existing window and emit deep-link event
            if let Some(existing) = app.get_webview_window("settings") {
                existing.show().map_err(|e| e.to_string())?;
                existing.set_focus().map_err(|e| e.to_string())?;
                if let Some(s) = section.clone() {
                    let _ = existing.emit("settings:deep-link", s);
                }
                return Ok(());
            }

            let settings = load_settings_internal().ok();
            let win_state = settings
                .as_ref()
                .and_then(|s| s.settings_window.clone());

            let url = match section.as_deref() {
                Some(s) => format!("settings.html#section={}", s),
                None => "settings.html".to_string(),
            };

            let mut builder = WebviewWindowBuilder::new(
                &app,
                "settings",
                WebviewUrl::App(url.into()),
            )
            .title("BorgDock — Settings")
            .inner_size(DEFAULT_W, DEFAULT_H)
            .min_inner_size(MIN_W, MIN_H)
            .decorations(false)
            .resizable(true)
            .skip_taskbar(false)
            .shadow(true)
            .visible(true);

            if let Some(g) = &win_state {
                builder = builder
                    .inner_size(g.width as f64, g.height as f64)
                    .position(g.x as f64, g.y as f64);
            }

            let win = builder.build().map_err(|e| e.to_string())?;

            let win_for_close = win.clone();
            win.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    let pos = win_for_close.outer_position().ok();
                    let size = win_for_close.outer_size().ok();
                    if let (Some(p), Some(s)) = (pos, size) {
                        let geom = crate::settings::models::WindowGeometry {
                            x: p.x,
                            y: p.y,
                            width: s.width,
                            height: s.height,
                        };
                        if let Ok(mut settings) = load_settings_internal() {
                            settings.settings_window = Some(geom);
                            let _ = save_settings_internal(&settings);
                        }
                    }
                }
            });

            if let Some(g) = win_state {
                win.set_size(tauri::Size::Physical(PhysicalSize::new(g.width, g.height))).ok();
                win.set_position(tauri::Position::Physical(PhysicalPosition::new(g.x, g.y))).ok();
            }
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}
```

Note `save_settings_internal` — verify the exact symbol name in `src-tauri/src/settings/mod.rs`. The agent-overview window references it; if it's in a sub-module, adjust the import path accordingly.

- [ ] **Step 3: Add `pub mod window;` to `src-tauri/src/settings/mod.rs:1`**

```rust
pub mod models;
pub mod window;
// …existing code…
```

- [ ] **Step 4: Register the command in `src-tauri/src/lib.rs`**

In `src-tauri/src/lib.rs` near line 474 where `agent_overview::window::open_agent_overview_window` is registered, add:

```rust
settings::window::open_settings_window,
```

inside the `tauri::generate_handler![ … ]` list. Keep alphabetical order if the existing list does.

- [ ] **Step 5: Build cargo to confirm it compiles**

```bash
MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10
```

Expected: success with no errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/settings/window.rs src-tauri/src/settings/mod.rs src-tauri/src/settings/models.rs src-tauri/src/lib.rs
git commit -m "feat(settings): open_settings_window command + module"
```

### Task 4: Capabilities for settings window

**Files:**
- Create: `src-tauri/capabilities/settings.json`

- [ ] **Step 1: Audit which Tauri commands current section bodies invoke**

```bash
grep -rn "invoke(" src/components/settings/ | sort -u
```

Note every command name, e.g. `save_settings`, `load_settings`, `get_credential`, `set_credential`, `delete_credential`, `test_ado_connection`, `test_sql_connection`, `set_global_hotkey`, `prune_worktrees`, `set_agent_overview_enabled`, `open_*` deep-links, etc.

- [ ] **Step 2: Pattern off existing capability files**

Inspect `src-tauri/capabilities/agent-overview.json` and `src-tauri/capabilities/pr-detail.json` to see the JSON shape. The settings window needs a superset because more sections invoke external commands.

- [ ] **Step 3: Write `src-tauri/capabilities/settings.json`**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "settings",
  "description": "BorgDock Settings window",
  "windows": ["settings"],
  "permissions": [
    "core:default",
    "core:window:default",
    "core:window:allow-start-dragging",
    "core:window:allow-close",
    "core:window:allow-minimize",
    "core:window:allow-maximize",
    "core:window:allow-unmaximize",
    "core:window:allow-is-maximized",
    "core:event:default",
    "dialog:default",
    "opener:default",
    "notification:default",
    "process:default"
  ]
}
```

If the audit revealed any commands not in `core:default` (custom Rust commands like `save_settings`), Tauri 2 grants those by default to all windows since they're not plugin-namespaced — but verify by checking `gen/schemas/capabilities.json` for any explicit grants in the existing main window's capability file. If the project uses an allow-list pattern, mirror it.

- [ ] **Step 4: Smoke test the capability file shape**

```bash
MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5
```

Expected: no parse errors. If Tauri reports a missing permission identifier, drop it from the list.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/capabilities/settings.json
git commit -m "feat(settings): per-window capability grants"
```

### Task 5: Smoke test — open the placeholder window

**Files:** none (manual verification)

- [ ] **Step 1: Run dev mode**

```bash
npm run tauri dev
```

- [ ] **Step 2: Trigger the command from devtools**

Once the main window is up, in its devtools console run:

```js
await window.__TAURI_INTERNALS__.invoke('open_settings_window', {});
```

Expected: a new 1080×760 frameless window titled "BorgDock — Settings" opens, showing "Settings (placeholder)" centred. Move and resize it, close it, and re-invoke — geometry should persist.

- [ ] **Step 3: No commit** (validation only)

If anything fails — e.g. the window deadlocks (logs `set_badge_visible: show=true` style silence), revisit `run_on_main_thread` wiring per CLAUDE.md.

---

## Phase 2 — Settings shape additions

This phase ends with: the `AppSettings` TypeScript and Rust types both carry every new field per spec, with sensible defaults; saving and re-loading round-trips them; existing tests still pass.

### Task 6: Extend AppSettings TypeScript type

**Files:**
- Modify: `src/types/settings.ts`

- [ ] **Step 1: Add new fields to existing types**

Open `src/types/settings.ts` and extend the relevant interfaces:

```ts
// AzureDevOpsSettings: add
linkMatchBy: 'branch' | 'title' | 'both';
showWorkItemStateOnPrCard: boolean;
updatePrStatusWhenWiDone: boolean;

// UiSettings: add
quickReviewHotkey: string;
runAtStartup: boolean;
startMinimizedToTray: boolean;
restoreLastSelection: boolean;

// SqlSettings: add
defaultConnectionName: string | null;
readOnlyByDefault: boolean;
confirmDestructiveWithoutWhere: boolean;

// NotificationSettings: add
channels: {
  tray: boolean;
  system: boolean;
  sound: boolean;
  emailDigest: boolean;
};
reviewNudge: {
  enabled: boolean;
  intervalMinutes: number;
  escalate: boolean;
};
lastTestFiredAt: number | null;

// AgentOverviewSettings: add
autoArchiveAfterHours: number | null;

// AppSettings: add
settingsWindow?: { x: number; y: number; width: number; height: number };
```

Use `?` only on the top-level optional `settingsWindow` (the rest are non-optional with defaults applied at load).

- [ ] **Step 2: Update default-settings factory if one exists**

Search for a `defaultSettings()` or similar factory:

```bash
grep -rn "defaultSettings\|DEFAULT_SETTINGS\|getDefaultSettings" src/
```

Wherever defaults are constructed, add the new fields with defaults from spec:
- `linkMatchBy: 'branch'`
- `showWorkItemStateOnPrCard: true`
- `updatePrStatusWhenWiDone: false`
- `quickReviewHotkey: ''`
- `runAtStartup: false`
- `startMinimizedToTray: false`
- `restoreLastSelection: true`
- `defaultConnectionName: null`
- `readOnlyByDefault: true`
- `confirmDestructiveWithoutWhere: true`
- `channels: { tray: true, system: true, sound: true, emailDigest: false }`
- `reviewNudge: { enabled: true, intervalMinutes: 60, escalate: false }`
- `lastTestFiredAt: null`
- `autoArchiveAfterHours: null`

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck 2>&1 | tail -20
```

Expected: any callers that destructure these fields without optional access pass; if there are red lines, they're in section code we'll rewrite later — fix the immediate ones (sections that read but don't write).

- [ ] **Step 4: Commit**

```bash
git add src/types/settings.ts
git commit -m "feat(settings): extend AppSettings with redesign fields"
```

### Task 7: Extend AppSettings Rust models

**Files:**
- Modify: `src-tauri/src/settings/models.rs`

- [ ] **Step 1: Add the same fields on the Rust side**

For each struct, add the new fields with `#[serde(default)]` plus a default function or impl block. Example for `AzureDevOpsSettings`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AzureDevOpsSettings {
    // …existing fields…
    #[serde(default = "default_link_match_by")]
    pub link_match_by: String,
    #[serde(default = "default_true")]
    pub show_work_item_state_on_pr_card: bool,
    #[serde(default)]
    pub update_pr_status_when_wi_done: bool,
}

fn default_link_match_by() -> String { "branch".to_string() }
```

Repeat for each struct (`UiSettings`, `SqlSettings`, `NotificationSettings`, `AgentOverviewSettings`).

For nested `channels` and `reviewNudge`, define small structs:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationChannels {
    #[serde(default = "default_true")] pub tray: bool,
    #[serde(default = "default_true")] pub system: bool,
    #[serde(default = "default_true")] pub sound: bool,
    #[serde(default)] pub email_digest: bool,
}
impl Default for NotificationChannels {
    fn default() -> Self {
        Self { tray: true, system: true, sound: true, email_digest: false }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewNudgeSettings {
    #[serde(default = "default_true")] pub enabled: bool,
    #[serde(default = "default_review_nudge_minutes")] pub interval_minutes: u32,
    #[serde(default)] pub escalate: bool,
}
fn default_review_nudge_minutes() -> u32 { 60 }
impl Default for ReviewNudgeSettings {
    fn default() -> Self {
        Self { enabled: true, interval_minutes: 60, escalate: false }
    }
}
```

Add `pub channels: NotificationChannels` and `pub review_nudge: ReviewNudgeSettings` to `NotificationSettings`, plus `pub last_test_fired_at: Option<i64>`.

- [ ] **Step 2: Add a serde round-trip test**

In `src-tauri/src/settings/models.rs`, append:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_fields_get_defaults() {
        let raw = r#"{}"#;
        let s: AppSettings = serde_json::from_str(raw).expect("empty object should parse");
        assert_eq!(s.azure_dev_ops.link_match_by, "branch");
        assert_eq!(s.notifications.review_nudge.interval_minutes, 60);
        assert!(s.notifications.channels.tray);
        assert!(!s.notifications.channels.email_digest);
        assert_eq!(s.agent_overview.auto_archive_after_hours, None);
    }

    #[test]
    fn round_trip_preserves_new_fields() {
        let mut s = AppSettings::default();
        s.azure_dev_ops.link_match_by = "both".to_string();
        s.ui.run_at_startup = true;
        let json = serde_json::to_string(&s).unwrap();
        let back: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.azure_dev_ops.link_match_by, "both");
        assert!(back.ui.run_at_startup);
    }
}
```

- [ ] **Step 3: Run cargo tests**

```bash
MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --manifest-path src-tauri/Cargo.toml settings::models -- --nocapture 2>&1 | tail -10
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/settings/models.rs
git commit -m "feat(settings): extend Rust AppSettings with redesign fields + serde defaults"
```

---

## Phase 3 — Shared primitives

Each primitive lives at `src/components/shared/primitives/<Name>.tsx` and is exported from `src/components/shared/primitives/index.ts`. Every primitive is built test-first.

### Task 8: Toggle primitive

**Files:**
- Create: `src/components/shared/primitives/Toggle.tsx`
- Create: `src/components/shared/primitives/__tests__/Toggle.test.tsx`
- Modify: `src/components/shared/primitives/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/shared/primitives/__tests__/Toggle.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toggle } from '../Toggle';

describe('Toggle', () => {
  it('reflects on state via aria-checked', () => {
    render(<Toggle on={true} onChange={() => {}} ariaLabel="X" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange with the inverted value when clicked', async () => {
    const onChange = vi.fn();
    render(<Toggle on={false} onChange={onChange} ariaLabel="X" />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does not call onChange when disabled', async () => {
    const onChange = vi.fn();
    render(<Toggle on={false} onChange={onChange} disabled ariaLabel="X" />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
npx vitest run src/components/shared/primitives/__tests__/Toggle.test.tsx 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `Toggle`**

```tsx
// src/components/shared/primitives/Toggle.tsx
import clsx from 'clsx';

interface ToggleProps {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export function Toggle({ on, onChange, disabled, ariaLabel }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={clsx(
        'relative h-[18px] w-[32px] rounded-full border transition-colors',
        on
          ? 'bg-[var(--color-accent)] border-[var(--color-accent)]'
          : 'bg-[var(--color-surface-hover)] border-[var(--color-strong-border)]',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span
        className="absolute top-[1px] h-[14px] w-[14px] rounded-full bg-white shadow transition-[left]"
        style={{ left: on ? 15 : 1 }}
      />
    </button>
  );
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
npx vitest run src/components/shared/primitives/__tests__/Toggle.test.tsx 2>&1 | tail -5
```

Expected: 3 tests pass.

- [ ] **Step 5: Export from index**

In `src/components/shared/primitives/index.ts`, add:

```ts
export { Toggle } from './Toggle';
```

- [ ] **Step 6: Commit**

```bash
git add src/components/shared/primitives/Toggle.tsx src/components/shared/primitives/__tests__/Toggle.test.tsx src/components/shared/primitives/index.ts
git commit -m "feat(primitives): Toggle"
```

### Task 9: ToggleRow primitive

**Files:**
- Create: `src/components/shared/primitives/ToggleRow.tsx`
- Create: `src/components/shared/primitives/__tests__/ToggleRow.test.tsx`
- Modify: `src/components/shared/primitives/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/shared/primitives/__tests__/ToggleRow.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToggleRow } from '../ToggleRow';

describe('ToggleRow', () => {
  it('renders label and hint, click forwards to onChange', async () => {
    const onChange = vi.fn();
    render(<ToggleRow label="Run at startup" hint="Launch on log-in" on={false} onChange={onChange} />);
    expect(screen.getByText('Run at startup')).toBeInTheDocument();
    expect(screen.getByText('Launch on log-in')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npx vitest run src/components/shared/primitives/__tests__/ToggleRow.test.tsx 2>&1 | tail -5
```

- [ ] **Step 3: Implement**

```tsx
// src/components/shared/primitives/ToggleRow.tsx
import clsx from 'clsx';
import { Toggle } from './Toggle';

interface ToggleRowProps {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (next: boolean) => void;
  last?: boolean;
}

export function ToggleRow({ label, hint, on, onChange, last }: ToggleRowProps) {
  return (
    <div
      className={clsx(
        'flex items-center gap-4 py-3',
        !last && 'border-b border-[var(--color-subtle-border)]',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-[var(--color-text-primary)]">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{hint}</div>}
      </div>
      <Toggle on={on} onChange={onChange} ariaLabel={label} />
    </div>
  );
}
```

- [ ] **Step 4: Run, expect PASS; export**

```bash
npx vitest run src/components/shared/primitives/__tests__/ToggleRow.test.tsx
```

Add `export { ToggleRow } from './ToggleRow';` to index.

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/primitives/ToggleRow.tsx src/components/shared/primitives/__tests__/ToggleRow.test.tsx src/components/shared/primitives/index.ts
git commit -m "feat(primitives): ToggleRow"
```

### Task 10: Slider, Seg2, Select, Checkbox, Field, SectionHeader, TextInput

For each primitive, follow the Task 8 pattern: failing test → implementation → passing test → export → commit. All share the same TDD cadence; the controllable-state contract is identical.

**Files (one per primitive):**
- Create: `src/components/shared/primitives/Slider.tsx` + `__tests__/Slider.test.tsx`
- Create: `src/components/shared/primitives/Seg2.tsx` + `__tests__/Seg2.test.tsx`
- Create: `src/components/shared/primitives/Select.tsx` + `__tests__/Select.test.tsx`
- Create: `src/components/shared/primitives/Checkbox.tsx` + `__tests__/Checkbox.test.tsx`
- Create: `src/components/shared/primitives/Field.tsx` + `__tests__/Field.test.tsx`
- Create: `src/components/shared/primitives/SectionHeader.tsx` (+ no test — purely presentational)
- Create: `src/components/shared/primitives/TextInput.tsx` + `__tests__/TextInput.test.tsx`
- Modify: `src/components/shared/primitives/index.ts` after each

- [ ] **Step 1: `Slider`**

Test:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Slider } from '../Slider';

describe('Slider', () => {
  it('renders value with suffix', () => {
    render(<Slider value={60} min={15} max={600} suffix="s" onChange={() => {}} ariaLabel="X" />);
    expect(screen.getByText('60s')).toBeInTheDocument();
  });
  it('arrow Right increments by step', async () => {
    const onChange = vi.fn();
    render(<Slider value={60} min={15} max={600} step={5} onChange={onChange} ariaLabel="X" />);
    const slider = screen.getByRole('slider');
    slider.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith(65);
  });
  it('clamps to max', async () => {
    const onChange = vi.fn();
    render(<Slider value={595} min={15} max={600} step={10} onChange={onChange} ariaLabel="X" />);
    const slider = screen.getByRole('slider');
    slider.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith(600);
  });
});
```

Implementation:
```tsx
import clsx from 'clsx';
import { useCallback } from 'react';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
  suffix?: string;
  format?: (v: number) => string;
  ariaLabel?: string;
}

export function Slider({ value, min, max, step = 1, onChange, suffix = '', format, ariaLabel }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const big = e.shiftKey ? step * 10 : step;
    let next = value;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp': next = value + big; break;
      case 'ArrowLeft':
      case 'ArrowDown': next = value - big; break;
      case 'Home': next = min; break;
      case 'End': next = max; break;
      default: return;
    }
    e.preventDefault();
    onChange(Math.max(min, Math.min(max, next)));
  }, [value, min, max, step, onChange]);
  return (
    <div className="flex items-center gap-3 w-full">
      <div
        role="slider"
        tabIndex={0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        className="relative flex-1 h-[5px] rounded-full bg-[var(--color-surface-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
        <div
          className="absolute -top-[5px] h-[15px] w-[15px] rounded-full border-2 border-[var(--color-accent)] bg-[var(--color-surface)] shadow"
          style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
        />
      </div>
      <span className={clsx('text-[11px] text-[var(--color-text-tertiary)] min-w-[60px] text-right font-mono')}>
        {format ? format(value) : `${value}${suffix}`}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: `Seg2`**

Test:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Seg2 } from '../Seg2';

describe('Seg2', () => {
  it('marks the active option and calls onChange when another is clicked', async () => {
    const onChange = vi.fn();
    render(<Seg2 value="a" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
```

Implementation:
```tsx
import clsx from 'clsx';

interface SegOption<T extends string> { value: T; label: string }
interface Seg2Props<T extends string> {
  value: T;
  options: ReadonlyArray<SegOption<T>>;
  onChange: (next: T) => void;
  full?: boolean;
}

export function Seg2<T extends string>({ value, options, onChange, full }: Seg2Props<T>) {
  return (
    <div
      className={clsx(
        'p-[3px] gap-[2px] rounded-[7px] border border-[var(--color-subtle-border)] bg-[var(--color-surface-hover)]',
        full ? 'grid' : 'inline-flex',
      )}
      style={full ? { gridTemplateColumns: `repeat(${options.length}, 1fr)` } : undefined}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              'rounded-[5px] px-[14px] py-[6px] text-[11.5px] transition-colors',
              active
                ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)] font-semibold'
                : 'text-[var(--color-text-tertiary)] font-medium hover:text-[var(--color-text-secondary)]',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: `Select` — wraps native `<select>`**

Test:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from '../Select';

describe('Select', () => {
  it('forwards selected value via onChange', async () => {
    const onChange = vi.fn();
    render(<Select value="a" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} onChange={onChange} ariaLabel="X" />);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'b');
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
```

Implementation:
```tsx
interface SelectOption { value: string; label: string }
interface SelectProps {
  value: string;
  options: ReadonlyArray<SelectOption>;
  onChange: (next: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

export function Select({ value, options, onChange, placeholder, ariaLabel }: SelectProps) {
  return (
    <div className="relative h-[30px] flex items-center pl-[10px] pr-[26px] rounded-[5px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)]">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span className="text-xs text-[var(--color-text-primary)] pointer-events-none">
        {options.find((o) => o.value === value)?.label ?? placeholder ?? ''}
      </span>
      <svg
        className="pointer-events-none absolute right-[8px] top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]"
        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
```

- [ ] **Step 4: `Checkbox`**

Test:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from '../Checkbox';

describe('Checkbox', () => {
  it('toggles via click', async () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} label="X" />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
```

Implementation:
```tsx
import clsx from 'clsx';

interface CheckboxProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}

export function Checkbox({ checked, onChange, label, hint }: CheckboxProps) {
  return (
    <label className="flex items-center gap-[10px] py-1.5 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden
        className={clsx(
          'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border',
          checked
            ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
            : 'bg-[var(--color-input-bg)] border-[var(--color-strong-border)]',
        )}
      >
        {checked && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </span>
      <span>
        <span className="text-xs text-[var(--color-text-primary)]">{label}</span>
        {hint && <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{hint}</div>}
      </span>
    </label>
  );
}
```

- [ ] **Step 5: `Field`**

Test:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Field } from '../Field';

describe('Field', () => {
  it('renders label, hint, and an anchor id when given', () => {
    render(
      <Field label="Poll interval" hint="seconds" anchorId="poll-interval">
        <input data-testid="ctrl" />
      </Field>,
    );
    expect(screen.getByText('Poll interval')).toBeInTheDocument();
    expect(screen.getByText('seconds')).toBeInTheDocument();
    expect(document.getElementById('field-poll-interval')).toBeInTheDocument();
  });
});
```

Implementation:
```tsx
import type { ReactNode } from 'react';

interface FieldProps {
  label?: string;
  hint?: string;
  dense?: boolean;
  anchorId?: string;
  children: ReactNode;
}

export function Field({ label, hint, dense, anchorId, children }: FieldProps) {
  return (
    <div id={anchorId ? `field-${anchorId}` : undefined} className={dense ? 'mb-3' : 'mb-[18px]'}>
      {label && (
        <div className="mb-1.5 text-[11.5px] font-medium text-[var(--color-text-secondary)]">{label}</div>
      )}
      {children}
      {hint && (
        <div className="mt-1.5 text-[11px] leading-relaxed text-[var(--color-text-muted)]">{hint}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: `SectionHeader`**

```tsx
import type { ReactNode } from 'react';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
}

export function SectionHeader({ title, subtitle, badge }: SectionHeaderProps) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-[10px]">
        <h2 className="text-[18px] font-semibold tracking-tight text-[var(--color-text-primary)]">{title}</h2>
        {badge}
      </div>
      {subtitle && (
        <p className="mt-1.5 max-w-[620px] text-xs leading-relaxed text-[var(--color-text-tertiary)]">
          {subtitle}
        </p>
      )}
    </div>
  );
}
```

No test — pure presentation.

- [ ] **Step 7: `TextInput`** (thin wrapper over existing `Input` adding `mono` + `suffix`)

Test:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TextInput } from '../TextInput';

describe('TextInput', () => {
  it('renders mono font when mono prop set', () => {
    render(<TextInput value="abc" onChange={() => {}} mono ariaLabel="X" />);
    const input = screen.getByRole('textbox');
    expect(input.className).toContain('font-mono');
  });
  it('renders suffix node', () => {
    render(<TextInput value="abc" onChange={() => {}} suffix={<span>$</span>} ariaLabel="X" />);
    expect(screen.getByText('$')).toBeInTheDocument();
  });
});
```

Implementation:
```tsx
import clsx from 'clsx';
import type { ReactNode } from 'react';

interface TextInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: 'text' | 'password' | 'number';
  mono?: boolean;
  suffix?: ReactNode;
  ariaLabel?: string;
}

export function TextInput({ value, onChange, placeholder, type = 'text', mono, suffix, ariaLabel }: TextInputProps) {
  return (
    <div className="flex h-[30px] items-center gap-2 rounded-[5px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-[10px]">
      <input
        type={type}
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(
          'flex-1 bg-transparent text-xs text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-faint)]',
          mono && 'font-mono text-[11.5px]',
        )}
      />
      {suffix && <span className="text-[11px] text-[var(--color-text-muted)]">{suffix}</span>}
    </div>
  );
}
```

- [ ] **Step 8: Run all primitive tests, expect pass; export from index; commit**

```bash
npx vitest run src/components/shared/primitives/__tests__/ 2>&1 | tail -10
```

Expected: all pass.

Add to `src/components/shared/primitives/index.ts`:
```ts
export { Slider } from './Slider';
export { Seg2 } from './Seg2';
export { Select } from './Select';
export { Checkbox } from './Checkbox';
export { Field } from './Field';
export { SectionHeader } from './SectionHeader';
export { TextInput } from './TextInput';
```

```bash
git add src/components/shared/primitives/
git commit -m "feat(primitives): Slider, Seg2, Select, Checkbox, Field, SectionHeader, TextInput"
```

---

## Phase 4 — Net-new Rust commands

Each command is independent. Implement test-first when feasible. Register each in `src-tauri/src/lib.rs` `tauri::generate_handler!` and add the corresponding permission to `src-tauri/capabilities/settings.json` if needed.

### Task 11: get_github_rate_limit

**Files:**
- Create: `src-tauri/src/git/rate_limit.rs` (or extend existing GitHub client module)
- Modify: `src-tauri/src/lib.rs` (register command)

- [ ] **Step 1: Locate existing GitHub auth/HTTP plumbing**

```bash
grep -rn "octocrab\|reqwest::Client\|github.com/api" src-tauri/src/ 2>&1 | head -10
```

Find how PR fetching authenticates. Reuse the same client/token loader.

- [ ] **Step 2: Implement command**

```rust
// src-tauri/src/git/rate_limit.rs (new) — adjust path to project's GitHub module
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RateLimit {
    pub used: u32,
    pub limit: u32,
    pub reset_at: i64,
}

#[tauri::command]
pub async fn get_github_rate_limit() -> Result<RateLimit, String> {
    // Reuse the existing GitHub auth helper. Pseudo-code; replace with actual symbol:
    let client = crate::git::client::authed_client().await.map_err(|e| e.to_string())?;
    let res: serde_json::Value = client
        .get("https://api.github.com/rate_limit")
        .send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;
    let core = &res["resources"]["core"];
    Ok(RateLimit {
        used: core["used"].as_u64().unwrap_or(0) as u32,
        limit: core["limit"].as_u64().unwrap_or(5000) as u32,
        reset_at: core["reset"].as_i64().unwrap_or(0),
    })
}
```

- [ ] **Step 3: Register in `lib.rs`**

Add `git::rate_limit::get_github_rate_limit,` inside `tauri::generate_handler![]`.

- [ ] **Step 4: Smoke**

```bash
MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/git/rate_limit.rs src-tauri/src/lib.rs
git commit -m "feat(github): get_github_rate_limit command"
```

### Task 12: scan_repos_under

**Files:**
- Create: `src-tauri/src/git/scan.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing test**

```rust
// src-tauri/src/git/scan.rs (new)
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn finds_git_dirs_under_parent() {
        let dir = TempDir::new().unwrap();
        std::fs::create_dir_all(dir.path().join("repo-a/.git")).unwrap();
        std::fs::create_dir_all(dir.path().join("nested/repo-b/.git")).unwrap();
        std::fs::create_dir_all(dir.path().join("not-a-repo/src")).unwrap();
        let found = scan_repos_under_inner(dir.path()).unwrap();
        let names: Vec<_> = found.iter().map(|c| c.name.clone()).collect();
        assert!(names.contains(&"repo-a".to_string()));
        assert!(names.contains(&"repo-b".to_string()));
        assert!(!names.contains(&"not-a-repo".to_string()));
    }
}
```

- [ ] **Step 2: Run, expect FAIL**

```bash
MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --manifest-path src-tauri/Cargo.toml git::scan -- --nocapture 2>&1 | tail -10
```

- [ ] **Step 3: Implement**

```rust
use serde::Serialize;
use std::path::Path;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoCandidate {
    pub path: String,
    pub owner: Option<String>,
    pub name: String,
    pub already_tracked: bool,
}

pub(crate) fn scan_repos_under_inner(parent: &Path) -> Result<Vec<RepoCandidate>, String> {
    let mut out = Vec::new();
    fn walk(dir: &Path, depth: u32, out: &mut Vec<RepoCandidate>) -> std::io::Result<()> {
        if depth > 4 { return Ok(()); }
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if !path.is_dir() { continue; }
            if path.join(".git").exists() {
                let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
                let owner = read_owner_from_remote(&path);
                out.push(RepoCandidate {
                    path: path.to_string_lossy().to_string(),
                    owner,
                    name,
                    already_tracked: false,
                });
            } else {
                walk(&path, depth + 1, out)?;
            }
        }
        Ok(())
    }
    walk(parent, 0, &mut out).map_err(|e| e.to_string())?;
    Ok(out)
}

fn read_owner_from_remote(repo_dir: &Path) -> Option<String> {
    let cfg = std::fs::read_to_string(repo_dir.join(".git/config")).ok()?;
    let url_line = cfg.lines().find(|l| l.trim().starts_with("url = "))?;
    let url = url_line.trim().trim_start_matches("url = ");
    // git@github.com:Owner/Repo.git OR https://github.com/Owner/Repo.git
    let after = url.split(['/', ':']).rev().nth(1)?;
    Some(after.to_string())
}

#[tauri::command]
pub async fn scan_repos_under(path: String) -> Result<Vec<RepoCandidate>, String> {
    let p = std::path::PathBuf::from(&path);
    let mut found = scan_repos_under_inner(&p)?;
    let tracked = crate::settings::load_settings_internal().ok()
        .map(|s| s.repos.iter().map(|r| format!("{}/{}", r.owner, r.name)).collect::<Vec<_>>())
        .unwrap_or_default();
    for c in &mut found {
        let key = format!("{}/{}", c.owner.clone().unwrap_or_default(), c.name);
        c.already_tracked = tracked.iter().any(|t| *t == key);
    }
    Ok(found)
}
```

- [ ] **Step 4: Register, build**

Add `git::scan::scan_repos_under,` to `lib.rs` handler list.

```bash
MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --manifest-path src-tauri/Cargo.toml git::scan 2>&1 | tail -5
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/git/scan.rs src-tauri/src/lib.rs
git commit -m "feat(repos): scan_repos_under command"
```

### Task 13: clear_cache, reset_all_settings, estimate_worktree_prune_size, run_self_test, agent_overview_status

Each follows the same pattern (TDD where feasible, register, commit). Implementations below.

**Files:**
- Create: `src-tauri/src/cache/mod.rs` extension or `src-tauri/src/maintenance.rs` (new module).
- Modify: `src-tauri/src/lib.rs`.

- [ ] **Step 1: `clear_cache`** — drops `%APPDATA%/BorgDock/cache/`

```rust
// src-tauri/src/maintenance.rs (new)
use serde::Serialize;
use std::path::PathBuf;

fn cache_dir() -> Result<PathBuf, String> {
    let base = dirs::data_dir().ok_or("no APPDATA")?.join("BorgDock").join("cache");
    Ok(base)
}

fn dir_size(p: &std::path::Path) -> u64 {
    let Ok(rd) = std::fs::read_dir(p) else { return 0 };
    let mut total = 0u64;
    for entry in rd.flatten() {
        let m = match entry.metadata() { Ok(m) => m, Err(_) => continue };
        total += if m.is_dir() { dir_size(&entry.path()) } else { m.len() };
    }
    total
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheClearResult { pub bytes_freed: u64 }

#[tauri::command]
pub async fn clear_cache() -> Result<CacheClearResult, String> {
    let dir = cache_dir()?;
    let bytes = if dir.exists() { dir_size(&dir) } else { 0 };
    if dir.exists() { std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?; }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(CacheClearResult { bytes_freed: bytes })
}

#[tauri::command]
pub async fn get_cache_size() -> Result<u64, String> {
    let dir = cache_dir()?;
    Ok(if dir.exists() { dir_size(&dir) } else { 0 })
}
```

- [ ] **Step 2: `reset_all_settings`** — wipes settings file + every keychain entry

```rust
// continuation of maintenance.rs
fn settings_file() -> Result<PathBuf, String> {
    Ok(dirs::data_dir().ok_or("no APPDATA")?.join("BorgDock").join("settings.json"))
}

#[tauri::command]
pub async fn reset_all_settings(app: tauri::AppHandle) -> Result<(), String> {
    let svc = "borgdock";
    for user in ["borgdock:github", "borgdock:azure_devops", "borgdock:claude_api"] {
        if let Ok(entry) = keyring::Entry::new(svc, user) {
            let _ = entry.delete_password();
        }
    }
    if let Ok(s) = crate::settings::load_settings_internal() {
        for c in &s.sql.connections {
            let user = format!("borgdock:sql:{}", c.name);
            if let Ok(entry) = keyring::Entry::new(svc, &user) {
                let _ = entry.delete_password();
            }
        }
    }
    let path = settings_file()?;
    if path.exists() { std::fs::remove_file(&path).map_err(|e| e.to_string())?; }
    let _ = app.restart();
    Ok(())
}
```

`app.restart()` returns nothing on Tauri 2 (the process replaces). Confirm by checking the Tauri 2 Manager API in your version.

- [ ] **Step 3: `estimate_worktree_prune_size`**

Reuse the existing prune-candidates resolver. The function it calls today (find via `grep prune` in src-tauri) returns a list of paths. Wrap it:

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PruneEstimate { pub count: u32, pub bytes: u64 }

#[tauri::command]
pub async fn estimate_worktree_prune_size() -> Result<PruneEstimate, String> {
    let candidates: Vec<std::path::PathBuf> = crate::git::worktree::list_prune_candidates().await?;
    let bytes = candidates.iter().map(|p| dir_size(p)).sum();
    Ok(PruneEstimate { count: candidates.len() as u32, bytes })
}
```

If `list_prune_candidates` doesn't exist with that name, find the actual symbol:

```bash
grep -rn "fn.*prune\|prune_candidates\|prune_worktrees" src-tauri/src/ | head
```

…and adjust the call site.

- [ ] **Step 4: `run_self_test`**

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelfTestResult { pub service: String, pub ok: bool, pub message: String }

#[tauri::command]
pub async fn run_self_test() -> Result<Vec<SelfTestResult>, String> {
    let mut out = Vec::new();
    // GitHub
    out.push(match crate::git::rate_limit::get_github_rate_limit().await {
        Ok(_) => SelfTestResult { service: "GitHub".into(), ok: true, message: "Rate limit reachable".into() },
        Err(e) => SelfTestResult { service: "GitHub".into(), ok: false, message: e },
    });
    // ADO and SQL — call existing test_*_connection helpers in the same way.
    Ok(out)
}
```

- [ ] **Step 5: `agent_overview_status`** — only if missing

```bash
grep -rn "agent_overview_status" src-tauri/src/ | head
```

If absent, add a thin command:

```rust
// src-tauri/src/agent_overview/status.rs (new)
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentOverviewStatus {
    pub healthy: bool,
    pub endpoint: String,
    pub events_per_min: u32,
    pub last_write_ago_seconds: Option<u64>,
}

#[tauri::command]
pub async fn agent_overview_status(/* state: tauri::State<'_, …> */) -> Result<AgentOverviewStatus, String> {
    // TODO during impl: derive from existing OTel sender state.
    Ok(AgentOverviewStatus {
        healthy: false,
        endpoint: "127.0.0.1:0".into(),
        events_per_min: 0,
        last_write_ago_seconds: None,
    })
}
```

- [ ] **Step 6: Register all five (six) commands**

In `src-tauri/src/lib.rs`, inside `tauri::generate_handler![]`:

```rust
maintenance::clear_cache,
maintenance::get_cache_size,
maintenance::reset_all_settings,
maintenance::estimate_worktree_prune_size,
maintenance::run_self_test,
agent_overview::status::agent_overview_status,  // if added
```

Plus `pub mod maintenance;` near the top.

- [ ] **Step 7: Build and commit**

```bash
MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10
git add src-tauri/src/maintenance.rs src-tauri/src/agent_overview/status.rs src-tauri/src/lib.rs
git commit -m "feat(settings): cache + reset-all + prune-estimate + self-test + agent-status commands"
```

---

## Phase 5 — Settings shell, search, and routing

This phase ends with: opening the settings window shows the real left-rail layout, all 11 sections render their existing components (no visual rewrite yet), section switching works, deep-link via `open_settings_window({ section: 'ado' })` lands on ADO, and search filters across an empty-but-typed index.

### Task 14: SettingsApp shell

**Files:**
- Modify: `src/components/settings/SettingsApp.tsx` (replace placeholder)
- Create: `src/components/settings/RailSearchInput.tsx`
- Create: `src/components/settings/RailSectionList.tsx`
- Create: `src/components/settings/RailSearchResults.tsx`
- Create: `src/components/settings/sections-catalog.ts`
- Create: `src/components/settings/__tests__/SettingsApp.test.tsx`

- [ ] **Step 1: Sections catalog**

```ts
// src/components/settings/sections-catalog.ts
import type { ReactNode } from 'react';
import {
  // existing icon set in primitives — match exact exports
} from '@/components/shared/icons';

export type SettingsSectionId =
  | 'github' | 'repos' | 'ado' | 'sql'
  | 'appearance' | 'notif'
  | 'claude' | 'claude-api' | 'agent-overview'
  | 'updates' | 'maintenance';

export type SettingsGroupId = 'sources' | 'app' | 'ai' | 'system';

export interface SettingsSectionMeta {
  id: SettingsSectionId;
  label: string;
  group: SettingsGroupId;
  icon: ReactNode; // populate at use site
}

export const SETTINGS_GROUPS: ReadonlyArray<{ id: SettingsGroupId; label: string }> = [
  { id: 'sources', label: 'Data sources' },
  { id: 'app',     label: 'Application' },
  { id: 'ai',      label: 'AI' },
  { id: 'system',  label: 'System' },
] as const;

export const SETTINGS_SECTIONS: ReadonlyArray<Omit<SettingsSectionMeta, 'icon'>> = [
  { id: 'github',         label: 'GitHub',        group: 'sources' },
  { id: 'repos',          label: 'Repositories',  group: 'sources' },
  { id: 'ado',            label: 'Azure DevOps',  group: 'sources' },
  { id: 'sql',            label: 'SQL Server',    group: 'sources' },
  { id: 'appearance',     label: 'Appearance',    group: 'app' },
  { id: 'notif',          label: 'Notifications', group: 'app' },
  { id: 'claude',         label: 'Claude Code',   group: 'ai' },
  { id: 'claude-api',     label: 'Claude API',    group: 'ai' },
  { id: 'agent-overview', label: 'Agent Overview',group: 'ai' },
  { id: 'updates',        label: 'Updates',       group: 'system' },
  { id: 'maintenance',    label: 'Maintenance',   group: 'system' },
] as const;
```

- [ ] **Step 2: Implement `SettingsApp`**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { WindowTitleBar } from '@/components/shared/WindowTitleBar';
import { Kbd } from '@/components/shared/primitives';
import { useSettingsStore } from '@/stores/settings-store';
import type { AppSettings } from '@/types/settings';
import { SETTINGS_SECTIONS, SETTINGS_GROUPS, type SettingsSectionId } from './sections-catalog';
import { RailSearchInput } from './RailSearchInput';
import { RailSectionList } from './RailSectionList';
import { RailSearchResults } from './RailSearchResults';
// existing section components
import { GitHubSection }       from './GitHubSection';
import { RepoSection }         from './RepoSection';
import { AdoSection }          from './AdoSection';
import { SqlSection }          from './SqlSection';
import { AppearanceSection }   from './AppearanceSection';
import { NotificationSection } from './NotificationSection';
import { ClaudeSection }       from './ClaudeSection';
import { ClaudeApiSection }    from './ClaudeApiSection';
import { AgentOverviewSection } from './AgentOverviewSection';
import { UpdateSection }       from './UpdateSection';
import { MaintenanceSection }  from './MaintenanceSection';

const STORAGE_KEY = 'settings.lastSection';

function readInitialSection(): SettingsSectionId {
  const fromHash = location.hash.match(/section=([\w-]+)/)?.[1];
  if (fromHash && SETTINGS_SECTIONS.some((s) => s.id === fromHash)) {
    return fromHash as SettingsSectionId;
  }
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && SETTINGS_SECTIONS.some((s) => s.id === saved)) {
    return saved as SettingsSectionId;
  }
  return 'github';
}

export function SettingsApp() {
  const settings = useSettingsStore((s) => s.settings);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const [active, setActive] = useState<SettingsSectionId>(readInitialSection);
  const [search, setSearch] = useState('');
  const settingsRef = useRef<AppSettings>(settings);
  settingsRef.current = settings;

  // Section change → persist + replace hash
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, active);
    history.replaceState(null, '', `#section=${active}`);
  }, [active]);

  // Deep-link from Rust
  useEffect(() => {
    const promise = listen<string>('settings:deep-link', (e) => {
      if (SETTINGS_SECTIONS.some((s) => s.id === e.payload)) {
        setActive(e.payload as SettingsSectionId);
      }
    });
    return () => { promise.then((un) => un()); };
  }, []);

  // Debounced save (mirrors old SettingsFlyout)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const update = (partial: Partial<AppSettings>) => {
    const next = { ...settingsRef.current, ...partial };
    useSettingsStore.getState().updateSettings(partial);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => saveSettings(next), 300);
  };

  const renderSection = useMemo(() => {
    switch (active) {
      case 'github':         return <GitHubSection github={settings.gitHub} onChange={(gitHub) => update({ gitHub })} />;
      case 'repos':          return <RepoSection repos={settings.repos} onChange={(repos) => update({ repos })} />;
      case 'ado':            return <AdoSection azureDevOps={settings.azureDevOps} onChange={(azureDevOps) => update({ azureDevOps })} />;
      case 'sql':            return <SqlSection sql={settings.sql} onChange={(sql) => update({ sql })} />;
      case 'appearance':     return <AppearanceSection ui={settings.ui} onChange={(ui) => update({ ui })} />;
      case 'notif':          return <NotificationSection notifications={settings.notifications} onChange={(notifications) => update({ notifications })} />;
      case 'claude':         return <ClaudeSection claudeCode={settings.claudeCode} onChange={(claudeCode) => update({ claudeCode })} />;
      case 'claude-api':     return <ClaudeApiSection claudeApi={settings.claudeApi} onChange={(claudeApi) => update({ claudeApi })} />;
      case 'agent-overview': return <AgentOverviewSection />;
      case 'updates':        return <UpdateSection updates={settings.updates} onChange={(updates) => update({ updates })} />;
      case 'maintenance':    return <MaintenanceSection />;
    }
  }, [active, settings]);

  const breadcrumb = SETTINGS_SECTIONS.find((s) => s.id === active)?.label ?? '';

  return (
    <div className="flex h-screen flex-col bg-[var(--color-background)] text-[var(--color-text-primary)]">
      <WindowTitleBar
        title="BorgDock"
        meta={
          <span className="ml-2 flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
            <span className="text-[var(--color-text-faint)]">›</span>
            <span className="font-medium text-[var(--color-text-secondary)]">Settings</span>
            <span className="text-[var(--color-text-faint)]">›</span>
            <span>{breadcrumb}</span>
          </span>
        }
      />
      <div className="grid flex-1 min-h-0" style={{ gridTemplateColumns: '232px 1fr' }}>
        <aside className="flex flex-col border-r border-[var(--color-subtle-border)]"
               style={{ background: 'linear-gradient(180deg, var(--color-sidebar-gradient-top), var(--color-sidebar-gradient-bottom))' }}>
          <div className="px-3.5 pb-2.5 pt-3.5">
            <RailSearchInput value={search} onChange={setSearch} />
          </div>
          <div className="flex-1 overflow-auto px-2 pb-3.5 pt-1">
            {search.trim()
              ? <RailSearchResults query={search} onSelect={(id) => { setActive(id); setSearch(''); }} />
              : <RailSectionList active={active} onSelect={setActive} />}
          </div>
          <div className="flex items-center gap-2 border-t border-[var(--color-subtle-border)] px-3.5 py-2.5 text-[10.5px] text-[var(--color-text-muted)]">
            {/* All-synced footer comes in Task 24 once save state is exposed */}
            <span>v{__BORGDOCK_VERSION__ ?? ''}</span>
          </div>
        </aside>
        <main className="overflow-auto bg-[var(--color-background)]">
          <div className="mx-auto max-w-[720px] px-9 pb-16 pt-7">
            {renderSection}
          </div>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `RailSearchInput`**

```tsx
// src/components/settings/RailSearchInput.tsx
import { Kbd } from '@/components/shared/primitives';
import { useEffect, useRef } from 'react';

interface Props { value: string; onChange: (s: string) => void }

export function RailSearchInput({ value, onChange }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        ref.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === ref.current) {
        onChange('');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onChange]);
  return (
    <div className="flex h-7 items-center gap-2 rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-2.5">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-muted)]">
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search settings…"
        className="flex-1 bg-transparent text-[11.5px] outline-none placeholder:text-[var(--color-text-faint)]"
      />
      <Kbd>⌘K</Kbd>
    </div>
  );
}
```

- [ ] **Step 4: `RailSectionList`**

```tsx
// src/components/settings/RailSectionList.tsx
import clsx from 'clsx';
import { Dot } from '@/components/shared/primitives';
import { SETTINGS_GROUPS, SETTINGS_SECTIONS, type SettingsSectionId } from './sections-catalog';

interface Props { active: SettingsSectionId; onSelect: (id: SettingsSectionId) => void }

export function RailSectionList({ active, onSelect }: Props) {
  return (
    <>
      {SETTINGS_GROUPS.map((g) => {
        const items = SETTINGS_SECTIONS.filter((s) => s.group === g.id);
        if (!items.length) return null;
        return (
          <div key={g.id} className="mb-2.5">
            <div className="px-2.5 pb-1.5 pt-2 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
              {g.label}
            </div>
            {items.map((s) => {
              const a = active === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className={clsx(
                    'mb-px flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs',
                    a ? 'bg-[var(--color-accent-subtle)] font-semibold text-[var(--color-accent)]'
                      : 'font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]',
                  )}
                >
                  <span className="flex-1">{s.label}</span>
                  {(s.id === 'github' || s.id === 'ado') && <Dot tone="green" size={6} />}
                </button>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
```

- [ ] **Step 5: `RailSearchResults` stub** (real index lands in Task 15)

```tsx
// src/components/settings/RailSearchResults.tsx
import { SETTINGS_FIELDS } from './settings-search-index';
import type { SettingsSectionId } from './sections-catalog';

interface Props { query: string; onSelect: (id: SettingsSectionId) => void }

export function RailSearchResults({ query, onSelect }: Props) {
  const q = query.toLowerCase().trim();
  const matches = SETTINGS_FIELDS.filter((f) =>
    f.label.toLowerCase().includes(q)
    || (f.hint?.toLowerCase().includes(q) ?? false)
    || (f.keywords?.some((k) => k.toLowerCase().includes(q)) ?? false),
  );
  if (matches.length === 0) {
    return <div className="px-2.5 py-2 text-[11px] text-[var(--color-text-muted)]">No matches.</div>;
  }
  return (
    <ul className="space-y-px">
      {matches.map((f) => (
        <li key={`${f.sectionId}.${f.anchorId}`}>
          <button
            type="button"
            onClick={() => onSelect(f.sectionId)}
            className="w-full rounded-md px-2.5 py-1.5 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
          >
            <div className="font-medium">{f.label}</div>
            <div className="text-[10.5px] text-[var(--color-text-muted)]">{sectionLabel(f.sectionId)}</div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function sectionLabel(id: SettingsSectionId) {
  return id; // overridden in Task 15 to use SETTINGS_SECTIONS labels
}
```

- [ ] **Step 6: Initial test for `SettingsApp`**

```tsx
// src/components/settings/__tests__/SettingsApp.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@tauri-apps/api/event', () => ({ listen: () => Promise.resolve(() => {}) }));
vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: Object.assign(
    (sel: any) => sel({ settings: defaultMockSettings(), saveSettings: vi.fn() }),
    { getState: () => ({ updateSettings: vi.fn() }) },
  ),
}));

function defaultMockSettings() {
  return { /* fill out the minimum AppSettings shape so each section renders without throwing */ } as any;
}

import { SettingsApp } from '../SettingsApp';

describe('SettingsApp', () => {
  beforeEach(() => { localStorage.clear(); location.hash = ''; });

  it('renders rail with all four groups', () => {
    render(<SettingsApp />);
    expect(screen.getByText('DATA SOURCES')).toBeInTheDocument();
    expect(screen.getByText('APPLICATION')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('SYSTEM')).toBeInTheDocument();
  });

  it('switches active section when a rail button is clicked', async () => {
    render(<SettingsApp />);
    await userEvent.click(screen.getByRole('button', { name: 'Repositories' }));
    expect(localStorage.getItem('settings.lastSection')).toBe('repos');
  });

  it('honors location.hash on mount', () => {
    location.hash = '#section=ado';
    render(<SettingsApp />);
    // ADO section renders (probe a unique label inside it once Task 18 lands;
    // for now just assert rail row is highlighted)
    const adoBtn = screen.getByRole('button', { name: 'Azure DevOps' });
    expect(adoBtn.className).toMatch(/font-semibold/);
  });
});
```

The mock object shape needs the full AppSettings; cobble it together so each section component renders without crashing (each section just needs its slice present with the right keys).

- [ ] **Step 7: Run, iterate until pass**

```bash
npx vitest run src/components/settings/__tests__/SettingsApp.test.tsx 2>&1 | tail -10
```

- [ ] **Step 8: Commit**

```bash
git add src/components/settings/
git commit -m "feat(settings): SettingsApp shell + rail + section routing"
```

### Task 15: Settings search index

**Files:**
- Create: `src/components/settings/settings-search-index.ts`
- Create: `src/components/settings/__tests__/settings-search-index.test.tsx`

- [ ] **Step 1: Write the index seed**

Populate one entry per `<Field>` that the rewritten sections will include. Anchors are slugs of labels.

```ts
import type { SettingsSectionId } from './sections-catalog';

export interface FieldEntry {
  sectionId: SettingsSectionId;
  anchorId: string;
  label: string;
  hint?: string;
  keywords?: ReadonlyArray<string>;
}

export const SETTINGS_FIELDS: ReadonlyArray<FieldEntry> = [
  // GitHub
  { sectionId: 'github', anchorId: 'auth-method',  label: 'Auth method', keywords: ['gh', 'cli', 'pat', 'token'] },
  { sectionId: 'github', anchorId: 'username',     label: 'Username' },
  { sectionId: 'github', anchorId: 'poll-interval',label: 'Poll interval', keywords: ['frequency', 'refresh'] },
  { sectionId: 'github', anchorId: 'rate-limit',   label: 'Rate limit',   keywords: ['quota'] },

  // Repositories
  { sectionId: 'repos', anchorId: 'tracked-repositories', label: 'Tracked repositories' },
  { sectionId: 'repos', anchorId: 'local-folder',         label: 'Local folder' },
  { sectionId: 'repos', anchorId: 'scan-folder',          label: 'Scan parent folder', keywords: ['discover'] },

  // Azure DevOps
  { sectionId: 'ado', anchorId: 'organization', label: 'Organization' },
  { sectionId: 'ado', anchorId: 'project',      label: 'Project' },
  { sectionId: 'ado', anchorId: 'auth-method',  label: 'Auth method', keywords: ['az', 'cli', 'pat'] },
  { sectionId: 'ado', anchorId: 'poll-interval',label: 'Poll interval' },
  { sectionId: 'ado', anchorId: 'match-by',     label: 'Match by',    keywords: ['link', 'work item', 'wi'] },

  // SQL
  { sectionId: 'sql', anchorId: 'connections',         label: 'Connections' },
  { sectionId: 'sql', anchorId: 'default-connection',  label: 'Default connection' },
  { sectionId: 'sql', anchorId: 'read-only-default',   label: 'Read-only by default' },
  { sectionId: 'sql', anchorId: 'confirm-destructive', label: 'Confirm DELETE / UPDATE without WHERE' },

  // Appearance
  { sectionId: 'appearance', anchorId: 'theme',         label: 'Theme' },
  { sectionId: 'appearance', anchorId: 'sidebar-edge',  label: 'Sidebar edge' },
  { sectionId: 'appearance', anchorId: 'sidebar-mode',  label: 'Sidebar mode' },
  { sectionId: 'appearance', anchorId: 'sidebar-width', label: 'Sidebar width' },
  { sectionId: 'appearance', anchorId: 'global-hotkey', label: 'Global hotkey', keywords: ['shortcut'] },
  { sectionId: 'appearance', anchorId: 'flyout-hotkey', label: 'Flyout hotkey' },
  { sectionId: 'appearance', anchorId: 'quick-review-hotkey', label: 'Quick review hotkey' },
  { sectionId: 'appearance', anchorId: 'wt-profile',    label: 'Windows Terminal profile' },
  { sectionId: 'appearance', anchorId: 'run-at-startup',label: 'Run at startup' },
  { sectionId: 'appearance', anchorId: 'start-minimized',label:'Start minimized to tray' },
  { sectionId: 'appearance', anchorId: 'restore-last-selection', label: 'Restore last selection' },

  // Notifications
  { sectionId: 'notif', anchorId: 'check-status',         label: 'Check status changes' },
  { sectionId: 'notif', anchorId: 'new-pull-requests',    label: 'New pull requests' },
  { sectionId: 'notif', anchorId: 'review-updates',       label: 'Review updates' },
  { sectionId: 'notif', anchorId: 'pr-mergeable',         label: 'PR becomes mergeable' },
  { sectionId: 'notif', anchorId: 'sound-on-merge',       label: 'Play sound on merge' },
  { sectionId: 'notif', anchorId: 'only-my-prs',          label: 'Only notify for my PRs' },
  { sectionId: 'notif', anchorId: 'nudge-pending',        label: 'Nudge for pending reviews' },
  { sectionId: 'notif', anchorId: 'remind-every',         label: 'Remind every' },
  { sectionId: 'notif', anchorId: 'escalate',             label: 'Escalate urgency over time' },
  { sectionId: 'notif', anchorId: 'channels',             label: 'Channels' },

  // Claude Code
  { sectionId: 'claude', anchorId: 'post-fix-action', label: 'Post-fix action' },
  { sectionId: 'claude', anchorId: 'claude-code-path',label: 'Claude Code path' },
  { sectionId: 'claude', anchorId: 'default-model',   label: 'Default model' },

  // Claude API
  { sectionId: 'claude-api', anchorId: 'api-key',     label: 'API key' },
  { sectionId: 'claude-api', anchorId: 'model',       label: 'Model' },
  { sectionId: 'claude-api', anchorId: 'max-tokens',  label: 'Max tokens' },
  { sectionId: 'claude-api', anchorId: 'pr-summary',  label: 'PR summary card' },
  { sectionId: 'claude-api', anchorId: 'diff-explain',label: 'Diff explanations' },
  { sectionId: 'claude-api', anchorId: 'review-nudge-phrasing', label: 'Review nudge phrasing' },
  { sectionId: 'claude-api', anchorId: 'commit-msg',  label: 'Commit message suggestions' },

  // Agent Overview
  { sectionId: 'agent-overview', anchorId: 'enable-telemetry', label: 'Enable telemetry collection' },
  { sectionId: 'agent-overview', anchorId: 'open-on-startup',  label: 'Open on BorgDock startup' },
  { sectionId: 'agent-overview', anchorId: 'auto-archive',     label: 'Auto-archive completed sessions after 24h' },

  // Updates
  { sectionId: 'updates', anchorId: 'auto-check',     label: 'Auto-check for updates' },
  { sectionId: 'updates', anchorId: 'auto-download',  label: 'Auto-download updates' },
  { sectionId: 'updates', anchorId: 'check-now',      label: 'Check now' },
  { sectionId: 'updates', anchorId: 'recent-releases',label: 'Recent releases' },

  // Maintenance
  { sectionId: 'maintenance', anchorId: 'prune-worktrees', label: 'Prune worktrees' },
  { sectionId: 'maintenance', anchorId: 'reset-onboarding',label: 'Reset onboarding' },
  { sectionId: 'maintenance', anchorId: 'clear-cache',     label: 'Clear cache' },
  { sectionId: 'maintenance', anchorId: 'reset-everything',label: 'Reset all settings' },
  { sectionId: 'maintenance', anchorId: 'diagnostics',     label: 'Diagnostics' },
];
```

- [ ] **Step 2: Add invariant tests**

```tsx
// src/components/settings/__tests__/settings-search-index.test.tsx
import { describe, it, expect } from 'vitest';
import { SETTINGS_FIELDS } from '../settings-search-index';
import { SETTINGS_SECTIONS } from '../sections-catalog';

describe('SETTINGS_FIELDS', () => {
  it('has no duplicate (sectionId, anchorId) pairs', () => {
    const seen = new Set<string>();
    for (const f of SETTINGS_FIELDS) {
      const key = `${f.sectionId}.${f.anchorId}`;
      expect(seen.has(key), `duplicate ${key}`).toBe(false);
      seen.add(key);
    }
  });
  it('only references known section ids', () => {
    const ids = new Set(SETTINGS_SECTIONS.map((s) => s.id));
    for (const f of SETTINGS_FIELDS) {
      expect(ids.has(f.sectionId), `unknown section ${f.sectionId}`).toBe(true);
    }
  });
  it('every section has at least one field', () => {
    for (const s of SETTINGS_SECTIONS) {
      const has = SETTINGS_FIELDS.some((f) => f.sectionId === s.id);
      expect(has, `section ${s.id} has no fields`).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Update `RailSearchResults.sectionLabel`** to read from `SETTINGS_SECTIONS`

```tsx
import { SETTINGS_SECTIONS } from './sections-catalog';
function sectionLabel(id: SettingsSectionId) {
  return SETTINGS_SECTIONS.find((s) => s.id === id)?.label ?? id;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/components/settings/__tests__/settings-search-index.test.tsx 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/settings-search-index.ts src/components/settings/__tests__/settings-search-index.test.tsx src/components/settings/RailSearchResults.tsx
git commit -m "feat(settings): search index + invariant tests"
```

### Task 16: Search jump + pulse

**Files:**
- Create: `src/components/settings/useFieldPulse.ts`
- Modify: `src/components/settings/SettingsApp.tsx` — propagate the pulse target through context.

- [ ] **Step 1: Implement context + hook**

```tsx
// src/components/settings/useFieldPulse.ts
import { createContext, useContext, useEffect, useState } from 'react';

interface PulseCtx {
  pulseAnchor: string | null;
  setPulseAnchor: (a: string | null) => void;
}
const Ctx = createContext<PulseCtx>({ pulseAnchor: null, setPulseAnchor: () => {} });

export const PulseProvider = Ctx.Provider;
export function usePulseTarget() { return useContext(Ctx); }

/** Hook that returns a className when this anchor is currently pulsing. */
export function useFieldPulse(anchorId?: string): string {
  const { pulseAnchor, setPulseAnchor } = usePulseTarget();
  useEffect(() => {
    if (anchorId && pulseAnchor === anchorId) {
      const el = document.getElementById(`field-${anchorId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const t = setTimeout(() => setPulseAnchor(null), 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [anchorId, pulseAnchor, setPulseAnchor]);
  return pulseAnchor === anchorId ? 'bg-[var(--color-accent-subtle)] transition-colors duration-300' : '';
}
```

- [ ] **Step 2: Wire `PulseProvider` in `SettingsApp`**

In `SettingsApp.tsx`, add state for `pulseAnchor` and wrap `<main>` (or the whole shell) in `<PulseProvider value={{ pulseAnchor, setPulseAnchor }}>`. Update the search-result onClick to set `pulseAnchor` after switching sections:

```tsx
const [pulseAnchor, setPulseAnchor] = useState<string | null>(null);
// …
<RailSearchResults
  query={search}
  onSelect={({ sectionId, anchorId }) => {
    setActive(sectionId);
    setSearch('');
    // wait one paint so the section mounts before we scroll
    requestAnimationFrame(() => setPulseAnchor(anchorId));
  }}
/>
```

`RailSearchResults`'s `onSelect` signature changes to accept the entry object; update accordingly.

- [ ] **Step 3: Update `Field` to consume pulse class** — modify the existing `Field` from Task 10:

```tsx
import { useFieldPulse } from '@/components/settings/useFieldPulse';

export function Field({ label, hint, dense, anchorId, children }: FieldProps) {
  const pulse = useFieldPulse(anchorId);
  return (
    <div id={anchorId ? `field-${anchorId}` : undefined}
         className={clsx(dense ? 'mb-3' : 'mb-[18px]', pulse, '-mx-1 px-1 rounded')}>
      {/* …rest unchanged… */}
    </div>
  );
}
```

(`Field` lives under `shared/primitives/`, but importing the settings-only hook makes that primitive coupled. Acceptable trade-off for this app. If you prefer cleanliness, extract the pulse class via render-prop or move `Field` into `components/settings/`.)

- [ ] **Step 4: Test**

Add to `SettingsApp.test.tsx`:

```tsx
it('clicking a search result switches section and scrolls to anchor', async () => {
  const scrollSpy = vi.fn();
  Element.prototype.scrollIntoView = scrollSpy;
  render(<SettingsApp />);
  const search = screen.getByPlaceholderText('Search settings…');
  await userEvent.type(search, 'poll');
  await userEvent.click(screen.getByRole('button', { name: /Poll interval/ }));
  await new Promise((r) => requestAnimationFrame(r));
  expect(localStorage.getItem('settings.lastSection')).toBe('github');
  expect(scrollSpy).toHaveBeenCalled();
});
```

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/useFieldPulse.ts src/components/settings/SettingsApp.tsx src/components/settings/RailSearchResults.tsx src/components/shared/primitives/Field.tsx
git commit -m "feat(settings): deep search jump + anchor pulse"
```

---

## Phase 6 — Section bodies (visual rewrite)

Each section keeps its `(props, onChange)` interface and existing store wiring. Only the JSX is rewritten using new primitives. Anchors must match the entries in `SETTINGS_FIELDS`.

For each task in this phase, after editing the file:
1. `npx vitest run src/components/settings/__tests__/<Section>.test.tsx 2>&1 | tail -10` (existing tests must still pass; some assertions referenced old class names — update them, don't delete coverage).
2. `npm run typecheck`
3. Commit.

### Task 17: GitHubSection rewrite + rate-limit hook

**Files:**
- Modify: `src/components/settings/GitHubSection.tsx`
- Create: `src/services/github-rate-limit.ts`

- [ ] **Step 1: Implement `useGitHubRateLimit` hook**

```ts
// src/services/github-rate-limit.ts
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface RateLimit { used: number; limit: number; resetAt: number }

export function useGitHubRateLimit(pollMs = 60000): RateLimit | null {
  const [rl, setRl] = useState<RateLimit | null>(null);
  useEffect(() => {
    let cancelled = false;
    const fetchOnce = () => invoke<RateLimit>('get_github_rate_limit').then((r) => { if (!cancelled) setRl(r); }).catch(() => {});
    fetchOnce();
    const t = setInterval(fetchOnce, pollMs);
    return () => { cancelled = true; clearInterval(t); };
  }, [pollMs]);
  return rl;
}
```

- [ ] **Step 2: Rewrite `GitHubSection.tsx`**

Replace the body with:

```tsx
import { Card, Pill, LinearProgress, Button, IconButton } from '@/components/shared/primitives';
import { Field, SectionHeader, Seg2, Slider, TextInput } from '@/components/shared/primitives';
import { useGitHubRateLimit } from '@/services/github-rate-limit';
import type { GitHubSettings } from '@/types/settings';
import { invoke } from '@tauri-apps/api/core';

interface Props { github: GitHubSettings; onChange: (g: GitHubSettings) => void }

export function GitHubSection({ github, onChange }: Props) {
  const rl = useGitHubRateLimit();
  const pct = rl ? (rl.used / rl.limit) * 100 : 0;
  const tone = pct >= 95 ? 'red' : pct >= 80 ? 'yellow' : 'green';
  return (
    <>
      <SectionHeader
        title="GitHub"
        subtitle="How BorgDock authenticates with github.com and how often it polls for new pull requests."
      />
      <Card>
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight">Authentication</h3>

        <Field label="Auth method" anchorId="auth-method">
          <Seg2
            value={github.authMethod === 'pat' ? 'pat' : 'cli'}
            options={[{ value: 'cli', label: 'GitHub CLI' }, { value: 'pat', label: 'Personal Access Token' }]}
            onChange={(v) => onChange({ ...github, authMethod: v === 'pat' ? 'pat' : 'ghCli' })}
          />
        </Field>

        {github.authMethod !== 'pat' ? (
          <div className="mb-4 flex items-center gap-2.5 rounded-md border border-[var(--color-success-badge-border)] bg-[var(--color-success-badge-bg)] px-3 py-2.5 text-[var(--color-success-badge-fg)]">
            <span className="text-xs font-medium">Authenticated via <code className="font-mono">gh</code> as</span>
            <span className="text-xs font-semibold">{github.username || '—'}</span>
            <span className="flex-1" />
            <Button variant="secondary" size="sm" onClick={() => invoke('refresh_gh_auth')}>Re-authenticate</Button>
          </div>
        ) : (
          <Field label="Token" hint="Needs repo, read:org and workflow scopes." anchorId="pat">
            <TextInput
              value={github.personalAccessToken ?? ''}
              onChange={(personalAccessToken) => onChange({ ...github, personalAccessToken })}
              type="password"
              mono
            />
          </Field>
        )}

        <Field label="Username" anchorId="username">
          <TextInput value={github.username} onChange={(username) => onChange({ ...github, username })} />
        </Field>

        <Field
          label="Poll interval"
          hint="How often BorgDock checks GitHub for PR changes. Adaptive polling doubles the interval near the rate-limit ceiling."
          anchorId="poll-interval"
        >
          <Slider
            value={github.pollIntervalSeconds}
            min={15}
            max={600}
            suffix="s"
            onChange={(pollIntervalSeconds) => onChange({ ...github, pollIntervalSeconds })}
            ariaLabel="Poll interval"
          />
        </Field>

        <Field label="Rate limit" hint="REST API quota for the authenticated token." anchorId="rate-limit">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <LinearProgress value={pct} tone={tone as 'red'|'yellow'|'green'} height={5} />
            </div>
            <span className="font-mono text-[11px] text-[var(--color-text-tertiary)]">
              {rl ? `${rl.used.toLocaleString()} / ${rl.limit.toLocaleString()}` : '—'}
            </span>
          </div>
        </Field>

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" onClick={() => invoke('test_github_connection')}>Test connection</Button>
          <Button variant="ghost" onClick={() => invoke('plugin:opener|open_url', { url: 'https://github.com' })}>
            Open on github.com
          </Button>
        </div>
      </Card>
    </>
  );
}
```

`LinearProgress` may need a `tone` prop. If the existing one only accepts `value`, extend it: add `tone?: 'red'|'yellow'|'green'` (and `height?: number`) and switch the fill colour via CSS variable. Verify by reading the current `LinearProgress.tsx`.

- [ ] **Step 3: Update existing tests**

Tests for `GitHubSection` likely assert old class strings or query elements that moved. Update query patterns; keep behaviour assertions (auth toggle, save callback called).

- [ ] **Step 4: Verify, commit**

```bash
npx vitest run src/components/settings/__tests__/GitHubSection
npm run typecheck
git add src/components/settings/GitHubSection.tsx src/services/github-rate-limit.ts src/components/shared/primitives/LinearProgress.tsx
git commit -m "feat(settings): rewrite GitHubSection with rate-limit bar"
```

### Task 18: ReposSection rewrite + scan dialog

**Files:**
- Modify: `src/components/settings/RepoSection.tsx`
- Create: `src/components/settings/RepoScanDialog.tsx`

- [ ] **Step 1: Implement `RepoScanDialog`**

```tsx
// src/components/settings/RepoScanDialog.tsx
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button, Checkbox } from '@/components/shared/primitives';
import type { RepoSettings } from '@/types/settings';

interface Candidate { path: string; owner: string | null; name: string; alreadyTracked: boolean }
interface Props {
  isOpen: boolean;
  parentPath: string;
  onClose: () => void;
  onAdd: (selected: RepoSettings[]) => void;
}

export function RepoScanDialog({ isOpen, parentPath, onClose, onAdd }: Props) {
  const [results, setResults] = useState<Candidate[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!isOpen) return;
    invoke<Candidate[]>('scan_repos_under', { path: parentPath }).then(setResults).catch(() => setResults([]));
  }, [isOpen, parentPath]);
  if (!isOpen) return null;
  const untracked = results.filter((r) => !r.alreadyTracked);
  return (
    <div role="dialog" className="fixed inset-0 z-50 grid place-items-center bg-[var(--color-overlay-bg)]">
      <div className="w-[480px] rounded-lg bg-[var(--color-surface)] p-5 shadow-xl">
        <h3 className="mb-3 text-sm font-semibold">Repositories under {parentPath}</h3>
        {untracked.length === 0 && <p className="text-xs text-[var(--color-text-muted)]">Nothing new to add.</p>}
        <ul className="max-h-[300px] space-y-1 overflow-auto">
          {untracked.map((c) => (
            <li key={c.path}>
              <Checkbox
                checked={picked.has(c.path)}
                onChange={(on) => {
                  const n = new Set(picked);
                  if (on) n.add(c.path); else n.delete(c.path);
                  setPicked(n);
                }}
                label={`${c.owner ?? '?'}/${c.name}`}
                hint={c.path}
              />
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={picked.size === 0}
            onClick={() => {
              const selected = untracked
                .filter((c) => picked.has(c.path) && c.owner)
                .map<RepoSettings>((c) => ({
                  owner: c.owner!,
                  name: c.name,
                  enabled: true,
                  worktreeBasePath: c.path,
                  worktreeSubfolder: '.worktrees',
                  fixPromptTemplate: null,
                  favoriteWorktreePaths: [],
                }));
              onAdd(selected);
              onClose();
            }}
          >
            Add {picked.size}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `RepoSection.tsx`**

```tsx
import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Card, Button, IconButton, Pill } from '@/components/shared/primitives';
import { Field, SectionHeader, TextInput } from '@/components/shared/primitives';
import type { RepoSettings } from '@/types/settings';
import { RepoScanDialog } from './RepoScanDialog';

interface Props { repos: RepoSettings[]; onChange: (rs: RepoSettings[]) => void }

export function RepoSection({ repos, onChange }: Props) {
  const [parent, setParent] = useState<string>('');
  const [scanOpen, setScanOpen] = useState(false);
  return (
    <>
      <SectionHeader
        title="Repositories"
        subtitle="The repositories BorgDock monitors. Worktrees, PR cards and notifications come from these."
      />
      <Card>
        <div className="mb-3 flex items-start gap-2.5">
          <h3 className="flex-1 text-[13px] font-semibold tracking-tight">Tracked repositories</h3>
          <Button variant="primary" size="sm" onClick={async () => {
            const folder = await open({ directory: true, multiple: false });
            if (typeof folder === 'string') {
              onChange([
                ...repos,
                { owner: '', name: folder.split(/[\\/]/).pop() ?? '', enabled: true, worktreeBasePath: folder, worktreeSubfolder: '.worktrees', fixPromptTemplate: null, favoriteWorktreePaths: [] },
              ]);
            }
          }}>+ Add repository</Button>
        </div>
        <div id="field-tracked-repositories" className="flex flex-col gap-2">
          {repos.map((r, i) => (
            <div key={`${r.owner}/${r.name}`} className="flex items-center gap-3 rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface)] px-3 py-2.5">
              <span className="grid h-[18px] w-[18px] place-items-center rounded-md bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">⌥</span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold">{r.owner}/{r.name}</div>
                <div className="mt-0.5 font-mono text-[10.5px] text-[var(--color-text-muted)]">{r.worktreeBasePath} · {r.worktreeSubfolder}</div>
              </div>
              <IconButton aria-label="Edit" size={22} icon={<span>✎</span>} onClick={() => {/* opens existing inline editor */}} />
              <IconButton aria-label="Remove" size={22} icon={<span>×</span>} onClick={() => onChange(repos.filter((_, j) => j !== i))} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="mb-1.5 text-[13px] font-semibold tracking-tight">Add a repository</h3>
        <p className="mb-3.5 text-[11.5px] leading-relaxed text-[var(--color-text-tertiary)]">
          Point BorgDock at a local clone — it reads the git remote to figure out owner/name automatically.
        </p>
        <Field label="Local folder" anchorId="local-folder">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <TextInput value={parent} onChange={setParent} placeholder="C:\\path\\to\\your\\clone" mono />
            <Button variant="primary" onClick={async () => {
              const r = await open({ directory: true, multiple: false });
              if (typeof r === 'string') setParent(r);
            }}>Browse…</Button>
          </div>
        </Field>
        <div id="field-scan-folder" className="flex items-center gap-2.5 rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface-hover)] px-3 py-2.5">
          <div className="flex-1 text-[11.5px] leading-relaxed text-[var(--color-text-tertiary)]">
            Or scan a parent folder for repos.
          </div>
          <Button variant="secondary" size="sm" disabled={!parent} onClick={() => setScanOpen(true)}>
            Scan folder…
          </Button>
        </div>
      </Card>

      <RepoScanDialog
        isOpen={scanOpen}
        parentPath={parent}
        onClose={() => setScanOpen(false)}
        onAdd={(selected) => onChange([...repos, ...selected])}
      />
    </>
  );
}
```

- [ ] **Step 3: Update tests, commit**

```bash
npx vitest run src/components/settings/__tests__/RepoSection
git add src/components/settings/RepoSection.tsx src/components/settings/RepoScanDialog.tsx
git commit -m "feat(settings): rewrite RepoSection + scan dialog"
```

### Task 19: AdoSection rewrite + match-by

**Files:**
- Modify: `src/components/settings/AdoSection.tsx`

- [ ] **Step 1: Replace body**

```tsx
import { Card, Button } from '@/components/shared/primitives';
import { Field, SectionHeader, Seg2, Slider, TextInput, ToggleRow } from '@/components/shared/primitives';
import type { AzureDevOpsSettings } from '@/types/settings';
import { invoke } from '@tauri-apps/api/core';

interface Props { azureDevOps: AzureDevOpsSettings; onChange: (a: AzureDevOpsSettings) => void }

export function AdoSection({ azureDevOps, onChange }: Props) {
  return (
    <>
      <SectionHeader title="Azure DevOps" subtitle="BorgDock pulls work-items, build status and policy info from Azure DevOps to enrich PR cards." />
      <Card>
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight">Connection</h3>
        <div className="grid grid-cols-2 gap-3.5">
          <Field label="Organization" dense anchorId="organization">
            <TextInput value={azureDevOps.organization} onChange={(organization) => onChange({ ...azureDevOps, organization })} />
          </Field>
          <Field label="Project" dense anchorId="project">
            <TextInput value={azureDevOps.project} onChange={(project) => onChange({ ...azureDevOps, project })} />
          </Field>
        </div>
        <Field label="Auth method" anchorId="auth-method">
          <Seg2
            value={azureDevOps.authMethod === 'pat' ? 'pat' : 'cli'}
            options={[{ value: 'cli', label: 'Azure CLI' }, { value: 'pat', label: 'Personal Access Token' }]}
            onChange={(v) => onChange({ ...azureDevOps, authMethod: v === 'pat' ? 'pat' : 'azCli' })}
          />
        </Field>
        <Field label="Poll interval" anchorId="poll-interval">
          <Slider
            value={azureDevOps.pollIntervalSeconds}
            min={30}
            max={900}
            suffix="s"
            onChange={(pollIntervalSeconds) => onChange({ ...azureDevOps, pollIntervalSeconds })}
            ariaLabel="ADO poll interval"
          />
        </Field>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => invoke('test_ado_connection')}>Test connection</Button>
          <Button variant="ghost" onClick={() => invoke('plugin:opener|open_url', { url: `https://dev.azure.com/${azureDevOps.organization}` })}>
            Open ADO
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="mb-1.5 text-[13px] font-semibold tracking-tight">Work-item linking</h3>
        <p className="mb-3.5 text-[11.5px] leading-relaxed text-[var(--color-text-tertiary)]">
          How BorgDock matches a PR to its ADO work-item.
        </p>
        <Field label="Match by" anchorId="match-by">
          <Seg2
            value={azureDevOps.linkMatchBy}
            options={[
              { value: 'branch', label: 'Branch name' },
              { value: 'title',  label: 'PR title (AB#)' },
              { value: 'both',   label: 'Both' },
            ]}
            onChange={(v) => onChange({ ...azureDevOps, linkMatchBy: v as 'branch' | 'title' | 'both' })}
          />
        </Field>
        <ToggleRow
          label="Show work-item state on PR card"
          on={azureDevOps.showWorkItemStateOnPrCard}
          onChange={(showWorkItemStateOnPrCard) => onChange({ ...azureDevOps, showWorkItemStateOnPrCard })}
        />
        <ToggleRow
          label="Update PR status when WI moves to Done"
          on={azureDevOps.updatePrStatusWhenWiDone}
          onChange={(updatePrStatusWhenWiDone) => onChange({ ...azureDevOps, updatePrStatusWhenWiDone })}
          last
        />
      </Card>
    </>
  );
}
```

Existing structured-error display (the `az_not_installed` / `az_not_logged_in` banners) — preserve by lifting the existing logic into this rewrite. Search the original `AdoSection.tsx` for those error keys before deleting them.

- [ ] **Step 2: Verify, commit**

```bash
npx vitest run src/components/settings/__tests__/AdoSection
git add src/components/settings/AdoSection.tsx
git commit -m "feat(settings): rewrite AdoSection with match-by"
```

### Task 20: SqlSection rewrite

**Files:**
- Modify: `src/components/settings/SqlSection.tsx`

- [ ] **Step 1: Replace body** (full new JSX in the same shape as Task 19, mapping to design's 2-card layout). Preserve the existing `ConnectionEditor` flow — open it via dialog now instead of inline.

```tsx
import { Card, Pill, Button, IconButton } from '@/components/shared/primitives';
import { Field, SectionHeader, Select, ToggleRow } from '@/components/shared/primitives';
import type { SqlSettings } from '@/types/settings';
import { useState } from 'react';
import { ConnectionEditorDialog } from './ConnectionEditorDialog'; // refactor existing inline ConnectionEditor

interface Props { sql: SqlSettings; onChange: (s: SqlSettings) => void }

export function SqlSection({ sql, onChange }: Props) {
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const conns = sql.connections ?? [];
  return (
    <>
      <SectionHeader title="SQL Server" subtitle='Saved connections used by the SQL window (Ctrl+F10) and the "Open in SQL" action on PR cards.' />
      <Card>
        <div className="mb-3 flex items-start gap-2.5">
          <h3 className="flex-1 text-[13px] font-semibold tracking-tight">Connections</h3>
          <Button variant="primary" size="sm" onClick={() => setEditing('new')}>+ Add connection</Button>
        </div>
        <div id="field-connections" className="flex flex-col gap-2">
          {conns.map((c, i) => (
            <div key={c.name} className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface)] px-3 py-2.5">
              <span className="grid h-[22px] w-[22px] place-items-center rounded-md bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">⌘</span>
              <div className="min-w-0">
                <div className="text-xs font-semibold">{c.name}</div>
                <div className="mt-0.5 font-mono text-[10.5px] text-[var(--color-text-muted)]">
                  {c.server} · {c.database} · {c.authMode}
                </div>
              </div>
              <Pill tone={c.savedToKeychain ? 'success' : 'neutral'}>{c.savedToKeychain ? 'saved' : 'session'}</Pill>
              <Button variant="secondary" size="sm" onClick={() => setEditing(i)}>Edit</Button>
              <Button variant="danger" size="sm" onClick={() => onChange({ ...sql, connections: conns.filter((_, j) => j !== i) })}>Delete</Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight">Defaults</h3>
        <Field label="Default connection" hint="Used when SQL window opens with no context." anchorId="default-connection">
          <Select
            value={sql.defaultConnectionName ?? ''}
            options={[{ value: '', label: '(none)' }, ...conns.map((c) => ({ value: c.name, label: c.name }))]}
            onChange={(v) => onChange({ ...sql, defaultConnectionName: v || null })}
            ariaLabel="Default SQL connection"
          />
        </Field>
        <ToggleRow
          label="Read-only by default"
          hint="Block writes unless explicitly toggled in the SQL window."
          on={sql.readOnlyByDefault}
          onChange={(readOnlyByDefault) => onChange({ ...sql, readOnlyByDefault })}
        />
        <ToggleRow
          label="Confirm DELETE / UPDATE without WHERE"
          on={sql.confirmDestructiveWithoutWhere}
          onChange={(confirmDestructiveWithoutWhere) => onChange({ ...sql, confirmDestructiveWithoutWhere })}
          last
        />
      </Card>

      <ConnectionEditorDialog
        index={editing}
        sql={sql}
        onClose={() => setEditing(null)}
        onSave={(next) => { onChange({ ...sql, connections: next }); setEditing(null); }}
      />
    </>
  );
}
```

- [ ] **Step 2: Refactor existing `ConnectionEditor` into a dialog** — minimal change: wrap its current JSX in a `<dialog>`-style overlay and accept `index | 'new' | null`. Test the round-trip.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/SqlSection.tsx src/components/settings/ConnectionEditorDialog.tsx
git commit -m "feat(settings): rewrite SqlSection + extract ConnectionEditorDialog"
```

### Task 21: AppearanceSection rewrite + autostart wiring

**Files:**
- Modify: `src/components/settings/AppearanceSection.tsx`
- Modify: `src/components/settings/HotkeyRecorder.tsx` — restyle outer container only (keep capture logic).
- Modify: `src-tauri/Cargo.toml` (add `tauri-plugin-autostart` if absent)
- Modify: `src-tauri/src/lib.rs` (register plugin)
- Modify: `src-tauri/capabilities/main.json` and `settings.json` (grant autostart permissions)

- [ ] **Step 1: Wire autostart plugin**

```bash
grep -n "autostart" src-tauri/Cargo.toml src-tauri/src/lib.rs 2>&1
```

If absent:

```toml
# src-tauri/Cargo.toml
tauri-plugin-autostart = "2"
```

```rust
// src-tauri/src/lib.rs::run
.plugin(tauri_plugin_autostart::init(
    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
    None, // args
))
```

Add `autostart:default` to capabilities `settings.json` and `main.json`.

- [ ] **Step 2: Rewrite section body**

Use the design from `BorgDock - Settings.html` Appearance section (Task 4 in spec). Three Cards: Theme, Sidebar, Hotkeys, Terminal & startup. Wire `Toggle on Run at startup` to:

```tsx
import { enable, disable } from '@tauri-apps/plugin-autostart';
// …
<ToggleRow
  label="Run at startup"
  hint="Launch BorgDock when you log in."
  on={ui.runAtStartup}
  onChange={async (runAtStartup) => {
    if (runAtStartup) await enable(); else await disable();
    onChange({ ...ui, runAtStartup });
  }}
/>
```

(Full JSX template — same pattern as Task 19/20; copy from spec section 4 / Appearance.)

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/capabilities/ src/components/settings/AppearanceSection.tsx src/components/settings/HotkeyRecorder.tsx
git commit -m "feat(settings): rewrite AppearanceSection + autostart plugin"
```

### Task 22: NotificationSection, ClaudeSection, ClaudeApiSection rewrite

For each, follow the same pattern as Tasks 19–21. Each is straightforward — just primitives with the existing fields. JSX templates per spec section 4.

- [ ] **Step 1: NotificationSection** — three cards (What to notify / Review reminders / Channels). Channels card uses chip-style multi-select (a small inline component, not extracted). Wire `last_test_fired_at` updates inside the test-notification handler.
- [ ] **Step 2: ClaudeSection** — single Fix-with-Claude card.
- [ ] **Step 3: ClaudeApiSection** — Anthropic API + Where AI is used cards (no budget slider, no usage card).
- [ ] **Step 4: Run tests, commit**

```bash
npx vitest run src/components/settings/__tests__/Notification src/components/settings/__tests__/Claude
git add src/components/settings/NotificationSection.tsx src/components/settings/ClaudeSection.tsx src/components/settings/ClaudeApiSection.tsx
git commit -m "feat(settings): rewrite NotificationSection, ClaudeSection, ClaudeApiSection"
```

### Task 23: AgentOverviewSection rewrite + UpdateSection rewrite + recent releases

**Files:**
- Modify: `src/components/settings/AgentOverviewSection.tsx`
- Modify: `src/components/settings/UpdateSection.tsx`
- Read: `src/generated/changelog.ts` (already exists)

- [ ] **Step 1: AgentOverviewSection** — 3 Checkboxes + OTel health card driven by `agent_overview_status` polled every 5 s.
- [ ] **Step 2: UpdateSection** — Channel card + Check now card + Recent releases card pulling 3 most-recent entries from `changelog.ts`. Highlight current row (compare `entry.version === __BORGDOCK_VERSION__`).
- [ ] **Step 3: Commit**

```bash
git add src/components/settings/AgentOverviewSection.tsx src/components/settings/UpdateSection.tsx
git commit -m "feat(settings): rewrite AgentOverviewSection + UpdateSection with recent releases"
```

### Task 24: MaintenanceSection rewrite + diagnostics

**Files:**
- Modify: `src/components/settings/MaintenanceSection.tsx`
- Create: `src/components/settings/SelfTestResultsDialog.tsx`

- [ ] **Step 1: Maintenance card 1 — Worktrees** — invoke `estimate_worktree_prune_size` on mount → render count + size in the row, button still calls existing prune flow.
- [ ] **Step 2: Maintenance card 2 — Onboarding & cache** — Reset onboarding (existing), Clear cache → `clear_cache` + show bytes-freed toast, Reset everything → confirm dialog → `reset_all_settings` (auto-restarts).
- [ ] **Step 3: Maintenance card 3 — Diagnostics** — Copy diagnostic info (clipboard write of `{ appVersion, os, arch, settingsHash, lastConnectionTests }`), Open log folder (opener), Run self-test → opens `SelfTestResultsDialog` listing `{service, ok, message}` rows.

- [ ] **Step 4: SelfTestResultsDialog** — list rendering of `Vec<SelfTestResult>` with green/red dots and message lines.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/MaintenanceSection.tsx src/components/settings/SelfTestResultsDialog.tsx
git commit -m "feat(settings): rewrite MaintenanceSection + diagnostics + self-test dialog"
```

---

## Phase 7 — Callsite migration & cleanup

### Task 25: Switch open-settings callsites

**Files:**
- Modify: `src/components/Header.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/work-items/WorkItemsSection.tsx`

- [ ] **Step 1: Replace `setSettingsOpen(true)` with `invoke('open_settings_window', ...)`**

In each file, find the click handler / tray-event handler:

```tsx
// before
useUiStore.getState().setSettingsOpen(true);
// after
import { invoke } from '@tauri-apps/api/core';
await invoke('open_settings_window', {});
```

For `WorkItemsSection`, pass the deep-link section:

```tsx
await invoke('open_settings_window', { section: 'ado' });
```

- [ ] **Step 2: Smoke test by running dev**

```bash
npm run tauri dev
```

Click gear icon → settings window opens. Click Configure in Work Items → settings window opens to Azure DevOps.

- [ ] **Step 3: Commit**

```bash
git add src/components/Header.tsx src/App.tsx src/components/work-items/WorkItemsSection.tsx
git commit -m "refactor(settings): callsites switch to open_settings_window"
```

### Task 26: Delete SettingsFlyout and useUiStore.isSettingsOpen

**Files:**
- Delete: `src/components/settings/SettingsFlyout.tsx`
- Delete: `src/components/settings/__tests__/SettingsFlyout.test.tsx` (if any)
- Modify: `src/stores/ui-store.ts` — remove `isSettingsOpen` and `setSettingsOpen`
- Modify: any remaining importers — typecheck will surface them

- [ ] **Step 1: Delete the file**

```bash
git rm src/components/settings/SettingsFlyout.tsx
git rm src/components/settings/__tests__/SettingsFlyout.test.tsx 2>/dev/null || true
```

- [ ] **Step 2: Strip from `ui-store.ts`**

Remove the two fields and their setter. Type-check:

```bash
npm run typecheck 2>&1 | tail -20
```

Fix any leftover references (likely in render-roots or top-level layout code that conditionally rendered the flyout).

- [ ] **Step 3: Search-and-destroy old import**

```bash
grep -rn "SettingsFlyout\|isSettingsOpen\|setSettingsOpen" src/
```

Should return zero matches.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(settings): delete SettingsFlyout + isSettingsOpen state"
```

---

## Phase 8 — Build integrity, full test suite, manual smoke

### Task 27: build-integrity test

**Files:**
- Modify: `src/__tests__/build-integrity.test.ts`

- [ ] **Step 1: Add `settings.html` to the registered-window-entries assertion**

Read the file first (it asserts each `*.html` has a matching Vite input plus a `WebviewUrl::App("X.html")` reference in Rust). Add `'settings.html'` to whatever array drives the assertions.

- [ ] **Step 2: Run, commit**

```bash
npx vitest run src/__tests__/build-integrity.test.ts
git add src/__tests__/build-integrity.test.ts
git commit -m "test(build): assert settings.html window registration"
```

### Task 28: Run full test + typecheck + cargo + manual smoke

- [ ] **Step 1: Vitest**

```bash
npm test 2>&1 | tail -20
```

Expected: zero failures.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck 2>&1 | tail -10
```

- [ ] **Step 3: Cargo tests**

```bash
MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -20
```

- [ ] **Step 4: Tauri build (release)**

```bash
npm run tauri build 2>&1 | tail -20
```

Expected: bundle succeeds.

- [ ] **Step 5: Manual smoke checklist (run in dev mode)**

```bash
npm run tauri dev
```

Verify:
- Gear icon opens new window with breadcrumb "Settings › GitHub".
- Each rail row switches the right pane and updates the breadcrumb.
- Search "poll" → two matches (GitHub > Poll interval, ADO > Poll interval). Clicking either opens the section and pulses the field.
- Edit GitHub username → close window → re-open → value persists.
- Window close → re-open → geometry persists.
- Tray menu Settings → window opens, focuses if already open.
- Reset onboarding still works; Prune worktrees opens existing dialog; Clear cache reports bytes freed; Reset everything restarts the app.

- [ ] **Step 6: No commit** (validation only)

If anything regresses, file the gap and patch it before declaring done.

### Task 29: Open PR

- [ ] **Step 1: Push**

```bash
git push -u origin settings-screen-redesign
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat(settings): full-window settings screen redesign" --body "$(cat <<'EOF'
## Summary

- Replaces the right-side SettingsFlyout with a full Tauri window (`open_settings_window`).
- New rail-based shell (4 groups, 11 sections) with deep field-level search (⌘K).
- Net-new affordances: GitHub rate-limit bar, repo folder scan, ADO match-by, Recent releases timeline, Clear cache, Reset everything, Diagnostics, Run self-test.
- 9 new shared primitives (Toggle, ToggleRow, Slider, Seg2, Select, Checkbox, Field, SectionHeader, TextInput).
- 7 new Rust commands; settings shape extended with new fields (no migration — pre-adoption).

## Test plan

- [ ] `npm test`
- [ ] `npm run typecheck`
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] `npm run tauri build`
- [ ] Manual smoke (see plan Task 28 step 5)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist (run after writing this plan)

- **Spec coverage**: every spec section maps to ≥1 task above. Verified ✓.
  - Architecture (own window, capabilities, callsite migration) → Tasks 1–5, 25.
  - Shell layout (rail + breadcrumb + footer + state) → Task 14.
  - Primitives → Tasks 8–10.
  - Sections (visual rewrite) → Tasks 17–24.
  - Deep search → Tasks 15–16.
  - New Rust commands → Tasks 11–13.
  - Settings shape additions → Tasks 6–7.
  - Tests → embedded in each task + Tasks 27–28.
  - Migration / cleanup → Task 26.

- **Placeholder scan**: Section 4 / NotificationSection / ClaudeSection / ClaudeApiSection / AgentOverviewSection / UpdateSection / MaintenanceSection use the design's section bodies described in the spec. The plan refers the engineer back to spec section 4 for the literal JSX rather than duplicating it here, except where net-new behavior (autostart, recent releases, diagnostics, self-test, scan dialog) needs explicit code — those are spelled out fully. Engineers reading these tasks out of order should read the spec section alongside.

- **Type consistency**: `getGitHubRateLimit` / `useGitHubRateLimit` / `RateLimit { used, limit, resetAt }` consistent. `RepoCandidate { path, owner, name, alreadyTracked }` matches between Rust + TS dialog. `linkMatchBy: 'branch'|'title'|'both'` consistent across spec, Task 7, Task 19. `SETTINGS_FIELDS` anchor IDs match anchors used in section bodies (cross-checked against Task 15 + Task 17–24 anchors).

---

**Plan complete.**
