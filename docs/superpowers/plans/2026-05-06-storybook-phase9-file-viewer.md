# Storybook Phase 9 — FileViewerApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 25 exhaustive Storybook stories for `FileViewerApp.tsx` (the standalone file-viewer window with content + diff modes and tree-sitter syntax highlighting). Add one Vite plugin to `.storybook/main.ts viteFinal` (to copy the runtime tree-sitter wasm into the Storybook dev/build output). Stories drive state via `parameters.viewer.*` consumed by a `FileViewerHarness` wrapper. No production code changes.

**Architecture:** Add one viteFinal plugin invocation, one fixtures file, one stories file. The control singleton (`window.__borgdock_storybook_tauri`) gains **zero** new fields — we use the existing `invokeResponses` and `invocations` machinery only.

**Tech Stack:** Storybook 9 + `@storybook/react-vite`, Vite 6, React 19, Tailwind v4, TypeScript 5.8, web-tree-sitter ≥0.25 (already installed in Phase 1).

**Spec:** `docs/superpowers/specs/2026-05-06-storybook-phase9-file-viewer-design.md`
**Roadmap:** `docs/superpowers/specs/storybook-roadmap.md`

**All paths in this plan are relative to `src/BorgDock.Tauri/` unless explicitly absolute.**

**Phase organization:**
- **Phase A — Storybook config (Task 1):** add `viteStaticCopy` to viteFinal so `/web-tree-sitter.wasm` is served. Self-contained.
- **Phase B — Fixtures (Task 2):** all sample contents, patches, and the `makeSettings` helper.
- **Phase C — Stories (Tasks 3–9):** scaffold + per-axis story groups (URL / content / mode-resolution / diff view / baseline / toolbar / diff shape / probe).
- **Phase D — Verification & PR (Tasks 10–13):** byte-identical assertion, vitest pass, build-storybook pass, manual probe verification, roadmap update, PR.

---

## Task 0: Verify worktree environment

**Files:** none

- [ ] **Step 1: Check branch + tree**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-file-viewer
git status && git rev-parse --abbrev-ref HEAD && git rev-parse HEAD
```
Expected: clean tree, branch `storybook-phase9-file-viewer`, HEAD == `origin/master`.

- [ ] **Step 2: Verify npm install**

```bash
ls /Users/koenvdb/projects/borgdock-storybook-file-viewer/src/BorgDock.Tauri/node_modules/.bin/storybook 2>&1
```
If it's missing, run `cd src/BorgDock.Tauri && npm install` with `timeout: 600000`.

---

# Phase A — Storybook config

## Task 1: Add `viteStaticCopy` to Storybook viteFinal

**Files:**
- Modify: `src/BorgDock.Tauri/.storybook/main.ts`

**Why:** the production Vite config copies `node_modules/web-tree-sitter/web-tree-sitter.wasm` to the build root via `vite-plugin-static-copy`. Storybook's Vite config does NOT inherit `vite.config.ts`. Without this plugin, the runtime tree-sitter loader (`Parser.init({ locateFile: () => '/web-tree-sitter.wasm' })`) 404s, the highlighter falls back silently to plain spans, and every story renders unhighlighted text. Acceptance is verified by Story #25 (ContentTSXSyntaxProbe).

- [ ] **Step 1: Replace `.storybook/main.ts` with the extended version**

Full new content:

```ts
// .storybook/main.ts

import type { StorybookConfig } from '@storybook/react-vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const here = dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-themes'],
  typescript: {
    check: false,
    reactDocgen: 'react-docgen-typescript',
  },
  async viteFinal(config) {
    config.plugins = config.plugins ?? [];
    config.plugins.push(tailwindcss());
    // Phase 9 — copy the tree-sitter runtime wasm into the Storybook output.
    // The grammar wasms (public/grammars/*.wasm) are served by Vite's
    // public-dir mechanism automatically, but the runtime wasm lives in
    // node_modules/web-tree-sitter/ and needs an explicit copy. Mirrors
    // the production vite.config.ts plugin invocation.
    config.plugins.push(
      viteStaticCopy({
        targets: [
          {
            src: 'node_modules/web-tree-sitter/web-tree-sitter.wasm',
            dest: '.',
            rename: { stripBase: true },
          },
        ],
      }),
    );

    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@tauri-apps/api/core': resolve(here, 'mocks/tauri-core.ts'),
      '@tauri-apps/api/event': resolve(here, 'mocks/tauri-event.ts'),
      '@tauri-apps/api/window': resolve(here, 'mocks/tauri-api-window.ts'),
      '@tauri-apps/api/webviewWindow': resolve(here, 'mocks/tauri-api-webviewWindow.ts'),
      '@tauri-apps/api/app': resolve(here, 'mocks/tauri-api-app.ts'),
      '@tauri-apps/api/dpi': resolve(here, 'mocks/tauri-api-dpi.ts'),
      '@tauri-apps/plugin-opener': resolve(here, 'mocks/tauri-plugin-opener.ts'),
      '@tauri-apps/plugin-store': resolve(here, 'mocks/tauri-plugin-store.ts'),
      '@tauri-apps/plugin-clipboard-manager': resolve(here, 'mocks/tauri-plugin-clipboard-manager.ts'),
      '@tauri-apps/plugin-dialog': resolve(here, 'mocks/tauri-plugin-dialog.ts'),
      '@tauri-apps/plugin-fs': resolve(here, 'mocks/tauri-plugin-fs.ts'),
      '@/services/windows': resolve(here, 'mocks/services-windows.ts'),
      '@/services/ado/workitems': resolve(here, 'mocks/services-ado-workitems.ts'),
      '@/generated/changelog': resolve(here, 'mocks/generated-changelog.ts'),
      '@': resolve(here, '../src'),
    };
    return config;
  },
};

export default config;
```

- [ ] **Step 2: Verify the diff shape**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-file-viewer && git diff -- src/BorgDock.Tauri/.storybook/main.ts
```
Expected: one new `import` line, one new `config.plugins.push(viteStaticCopy(...))` block. No alias changes. No deletions.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/.storybook/main.ts
git commit -m "$(cat <<'EOF'
storybook: copy tree-sitter runtime wasm into iframe output

Phase 9 setup. The production Vite config copies
node_modules/web-tree-sitter/web-tree-sitter.wasm into the build
root via vite-plugin-static-copy so that Parser.init({ locateFile:
() => '/web-tree-sitter.wasm' }) resolves at runtime. Storybook's
Vite config doesn't inherit vite.config.ts, so without the same
plugin in viteFinal the runtime wasm 404s, the highlighter falls
back to plain spans silently, and every file-viewer story renders
unhighlighted text. The accompanying probe story (added in a
later commit) asserts this works end-to-end.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# Phase B — Fixtures

## Task 2: Create file-viewer fixtures

**Files:**
- Create: `src/BorgDock.Tauri/src/components/file-viewer/__fixtures__/file-viewer-data.ts`

- [ ] **Step 1: Write the fixtures file**

Full content:

```ts
// src/components/file-viewer/__fixtures__/file-viewer-data.ts
//
// Shared fixtures for FileViewerApp.stories.tsx. AppSettings is built up
// via makeSettings(). Patches are unified-diff strings as they come back
// from the `git_file_diff` Tauri command.

import type { AppSettings } from '@/types/settings';

const BASE_UI = {
  theme: 'system' as const,
  showFlyoutBadge: true,
  fileViewerDefaultViewMode: 'unified' as const,
};

export function makeSettings(uiOverrides?: Partial<AppSettings['ui']>): AppSettings {
  return {
    setupComplete: true,
    gitHub: {
      authMethod: 'ghCli',
      pollIntervalSeconds: 30,
      username: 'storybook',
    },
    repos: [],
    ui: { ...BASE_UI, ...(uiOverrides ?? {}) } as AppSettings['ui'],
    notifications: {
      toastOnCheckStatusChange: false,
      toastOnNewPR: false,
      toastOnReviewUpdate: false,
      toastOnMergeable: false,
      onlyMyPRs: true,
      playMergeSound: false,
      reviewNudgeEnabled: false,
      reviewNudgeIntervalMinutes: 30,
      reviewNudgeEscalation: false,
      deduplicationWindowSeconds: 60,
      channels: { tray: true, system: false, sound: false, emailDigest: false },
    },
    claudeCode: { defaultPostFixAction: 'none' },
    claudeApi: {
      model: 'claude-sonnet-4-6',
      maxTokens: 8192,
      prSummaryEnabled: false,
      diffExplanationsEnabled: false,
      reviewNudgePhrasingEnabled: false,
      commitMessageSuggestionsEnabled: false,
    },
    claudeReview: { botUsername: 'claude[bot]' },
    updates: { autoCheckEnabled: false, autoDownload: false },
    azureDevOps: {
      organization: '',
      project: '',
      authMethod: 'azCli',
      authAutoDetected: false,
      pollIntervalSeconds: 30,
      favoriteQueryIds: [],
      trackedWorkItemIds: [],
      workingOnWorkItemIds: [],
      workItemWorktreePaths: {},
      recentWorkItemIds: [],
      linkMatchBy: 'branch',
      showWorkItemStateOnPrCard: false,
      updatePrStatusWhenWiDone: false,
    },
    sql: {
      connections: [],
      readOnlyByDefault: false,
      confirmDestructiveWithoutWhere: true,
    },
    repoPriority: {},
  };
}

// ---------------------------------------------------------------------------
// File-content samples
// ---------------------------------------------------------------------------

// Small TSX with keywords / strings / JSX tags / numbers — exercises the
// hl-keyword / hl-string / hl-tag / hl-number categories the highlighter
// emits. Used by the syntax-highlight probe story.
export const TSX_SAMPLE = `import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <div className="counter">
      <span>Count: {count}</span>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
}
`;

export const PLAIN_TEXT_SAMPLE = `BorgDock README

A desktop app that monitors GitHub PRs as a docked sidebar.

Quick start:
  npm install
  npm run dev
`;

export const LARGE_TS_SAMPLE = Array.from({ length: 80 }, (_, i) =>
  `export const item${i} = { id: ${i}, label: 'item-${i}' };`,
).join('\n') + '\n';

// ---------------------------------------------------------------------------
// Patch samples (unified diff format from git_file_diff)
// ---------------------------------------------------------------------------

export const PATCH_SINGLE_HUNK_TS = `diff --git a/src/components/Counter.tsx b/src/components/Counter.tsx
index 1111..2222 100644
--- a/src/components/Counter.tsx
+++ b/src/components/Counter.tsx
@@ -1,9 +1,11 @@
 import { useState } from 'react';

 export function Counter() {
-  const [count, setCount] = useState(0);
+  const [count, setCount] = useState<number>(0);
+  const reset = () => setCount(0);
   return (
     <div className="counter">
       <span>Count: {count}</span>
+      <button onClick={reset}>Reset</button>
       <button onClick={() => setCount(count + 1)}>Increment</button>
     </div>
   );
`;

export const PATCH_ADD_ONLY_TS = `diff --git a/src/lib/new-helper.ts b/src/lib/new-helper.ts
new file mode 100644
index 0000..3333
--- /dev/null
+++ b/src/lib/new-helper.ts
@@ -0,0 +1,5 @@
+export function helper(x: number): number {
+  return x * 2;
+}
+
+export const MAGIC = 42;
`;

export const PATCH_DELETE_ONLY_TS = `diff --git a/src/lib/old-helper.ts b/src/lib/old-helper.ts
deleted file mode 100644
index 4444..0000
--- a/src/lib/old-helper.ts
+++ /dev/null
@@ -1,4 +0,0 @@
-export function legacy() {
-  return 'unused';
-}
-export const STALE = true;
`;

export const PATCH_MULTI_HUNK_TS = `diff --git a/src/services/api.ts b/src/services/api.ts
index 5555..6666 100644
--- a/src/services/api.ts
+++ b/src/services/api.ts
@@ -1,8 +1,9 @@
 import { request } from './request';

 export async function fetchUser(id: string) {
-  const r = await request(\`/users/\${id}\`);
-  return r.json();
+  const r = await request(\`/users/\${encodeURIComponent(id)}\`);
+  if (!r.ok) throw new Error('user fetch failed');
+  return r.json() as Promise<User>;
 }

 export async function fetchUsers() {
@@ -20,5 +21,9 @@ export async function fetchUsers() {
   return r.json();
 }

+export async function deleteUser(id: string) {
+  await request(\`/users/\${encodeURIComponent(id)}\`, { method: 'DELETE' });
+}
+
 export type User = { id: string; name: string };
`;

// ---------------------------------------------------------------------------
// Canned `git_file_diff` response shapes
// ---------------------------------------------------------------------------

export const DIFF_NOT_IN_REPO = { patch: '', baselineRef: '', inRepo: false } as const;

export const DIFF_IN_REPO_NO_CHANGES = {
  patch: '',
  baselineRef: 'HEAD',
  inRepo: true,
} as const;

// ---------------------------------------------------------------------------
// File-load error shapes (read_text_file rejection payloads)
// ---------------------------------------------------------------------------

export const ERR_NOT_FOUND = { kind: 'notFound' };
export const ERR_BINARY = { kind: 'binary' };
export const ERR_TOO_LARGE = { kind: 'tooLarge' };
```

- [ ] **Step 2: Sanity-check the path**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-file-viewer/src/BorgDock.Tauri && npx tsc -p tsconfig.json --noEmit 2>&1 | grep file-viewer | head -10 || echo "tsc clean for file-viewer"
```

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-viewer/__fixtures__/file-viewer-data.ts
git commit -m "$(cat <<'EOF'
storybook: file-viewer fixtures (settings + samples + patches)

Phase 9 fixtures. makeSettings() returns a complete AppSettings
with sensible defaults so stories only override ui fields they
care about. TSX_SAMPLE / PLAIN_TEXT_SAMPLE / LARGE_TS_SAMPLE
cover the content-mode visual axes; PATCH_* cover the diff-mode
shapes (single hunk, add-only, delete-only, multi-hunk). DIFF_*
and ERR_* are stable canned response shapes the harness
dispatches via invokeResponses.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# Phase C — Stories

## Task 3: Stories scaffold + harness

**Files:**
- Create: `src/BorgDock.Tauri/src/components/file-viewer/FileViewerApp.stories.tsx`

- [ ] **Step 1: Write the scaffold (no stories yet)**

Full initial content (stories appended in subsequent tasks):

```tsx
// src/components/file-viewer/FileViewerApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { getControl } from '../../../.storybook/mocks/control';
import {
  DIFF_IN_REPO_NO_CHANGES,
  DIFF_NOT_IN_REPO,
  ERR_BINARY,
  ERR_NOT_FOUND,
  ERR_TOO_LARGE,
  LARGE_TS_SAMPLE,
  PATCH_ADD_ONLY_TS,
  PATCH_DELETE_ONLY_TS,
  PATCH_MULTI_HUNK_TS,
  PATCH_SINGLE_HUNK_TS,
  PLAIN_TEXT_SAMPLE,
  TSX_SAMPLE,
  makeSettings,
} from './__fixtures__/file-viewer-data';
import { FileViewerApp } from './FileViewerApp';
import type { AppSettings } from '@/types/settings';

interface DiffOutput {
  patch: string;
  baselineRef: string;
  inRepo: boolean;
}

interface FileViewerStoryParams {
  /** ?path query-string param. Set to null to omit it. Default: 'src/components/Counter.tsx'. */
  path?: string | null;
  /** ?baseline query-string param. */
  baseline?: 'HEAD' | 'mergeBaseDefault';
  /** Static content OR fn returning content / promise / rejection. */
  contentResponse?:
    | string
    | ((args: { path: string }) => string | Promise<string>);
  /** Custom load_settings response. Defaults to makeSettings(). */
  settings?: AppSettings;
  /** Static diff OR fn keyed on baseline. */
  diffResponse?:
    | DiffOutput
    | ((args: { path: string; baseline: string }) => DiffOutput | Promise<DiffOutput>);
  /** Override save_settings to capture/discard. Default: undefined (no-op resolve). */
  saveSettingsResponse?: unknown | ((args: unknown) => unknown);
}

const ORIGINAL_CLIPBOARD_WRITE_TEXT =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (navigator.clipboard as any)?.writeText?.bind(navigator.clipboard);

function applyParamsBeforeMount(params: FileViewerStoryParams) {
  const ctrl = getControl();

  // Default URL = src/components/Counter.tsx, no baseline override.
  const path = params.path === null ? null : (params.path ?? 'src/components/Counter.tsx');
  const search = new URLSearchParams();
  if (path !== null) search.set('path', path);
  if (params.baseline) search.set('baseline', params.baseline);
  const qs = search.toString();
  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}${qs ? `?${qs}` : ''}`,
  );

  // Canned invoke responses.
  ctrl.invokeResponses.load_settings = params.settings ?? makeSettings();
  ctrl.invokeResponses.save_settings =
    params.saveSettingsResponse !== undefined ? params.saveSettingsResponse : undefined;
  ctrl.invokeResponses.open_in_editor = undefined;

  // read_text_file: default to a simple TSX content. The function form
  // lets a story vary by path; static value is also fine.
  if (params.contentResponse !== undefined) {
    ctrl.invokeResponses.read_text_file = params.contentResponse;
  } else {
    ctrl.invokeResponses.read_text_file = TSX_SAMPLE;
  }

  // git_file_diff: default to "not in a git repo" to keep the surface
  // simple. Stories that exercise diff mode override this.
  if (params.diffResponse !== undefined) {
    ctrl.invokeResponses.git_file_diff = params.diffResponse;
  } else {
    ctrl.invokeResponses.git_file_diff = DIFF_NOT_IN_REPO;
  }

  // navigator.clipboard stub for stories that click "Copy all" — the
  // real Storybook iframe Chrome supports clipboard, but headless test
  // runs on some CI hosts don't. Stub if missing; restore on unmount.
  if (!('clipboard' in navigator) || typeof navigator.clipboard?.writeText !== 'function') {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (_text: string) => {} },
    });
  }
}

function restoreAfterMount() {
  // Reset URL — leave only the pathname.
  window.history.replaceState({}, '', window.location.pathname);
  if (ORIGINAL_CLIPBOARD_WRITE_TEXT) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator.clipboard as any).writeText = ORIGINAL_CLIPBOARD_WRITE_TEXT;
  }
}

function FileViewerHarness({ params }: { params: FileViewerStoryParams }) {
  applyParamsBeforeMount(params);

  useEffect(() => {
    return () => restoreAfterMount();
  }, []);

  return (
    <div style={{ width: 1200, height: 720 }}>
      <FileViewerApp />
    </div>
  );
}

const meta: Meta<typeof FileViewerHarness> = {
  title: 'File Viewer/FileViewerApp',
  component: FileViewerHarness,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<typeof FileViewerHarness>;

function story(params: FileViewerStoryParams = {}): Story {
  return { args: { params } };
}

// Stories appended in subsequent commits.
```

- [ ] **Step 2: Confirm Storybook discovers the scaffold**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-file-viewer/src/BorgDock.Tauri && npx tsc -p tsconfig.json --noEmit 2>&1 | grep -i "FileViewerApp\.stories" | head -5 || echo "tsc clean"
```

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-viewer/FileViewerApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: file-viewer harness scaffold (no stories yet)

Phase 9 setup. FileViewerHarness applies params synchronously
before <FileViewerApp/> mounts (URL rewrite + invokeResponses)
so the production code's URLSearchParams + invoke calls see the
right state on first render. Restores URL + navigator.clipboard
on unmount.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: URL / path axis stories

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-viewer/FileViewerApp.stories.tsx`

- [ ] **Step 1: Append the URL / path axis (3 stories)**

Append at the bottom of the file:

```tsx
// ---------------------------------------------------------------------------
// 1. Path / URL axis (3)
// ---------------------------------------------------------------------------

export const NoPathProvided = story({
  path: null,
  contentResponse: () => Promise.reject(new Error('should not be called')),
  diffResponse: () => Promise.reject(new Error('should not be called')),
});

export const PathTSXFile = story({
  path: 'src/components/Counter.tsx',
  contentResponse: TSX_SAMPLE,
  diffResponse: DIFF_NOT_IN_REPO,
});

export const LongPath = story({
  path:
    'src/very/deeply/nested/folder/structure/that/keeps/going/and/going/' +
    'until/the/path/is/much/longer/than/the/toolbar/can/comfortably/show/' +
    'and/we/want/to/verify/it/truncates/Counter.tsx',
  contentResponse: TSX_SAMPLE,
  diffResponse: DIFF_NOT_IN_REPO,
});
```

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-viewer/FileViewerApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: file-viewer path axis stories (3)

Phase 9 / story group 1. NoPathProvided / PathTSXFile / LongPath
cover the URL-search-param contract: missing ?path triggers the
"No file path supplied" empty state; the long-path variant
verifies the toolbar's path span ellipsizes via CSS.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Content-load axis stories

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-viewer/FileViewerApp.stories.tsx`

- [ ] **Step 1: Append the content-load axis (4 stories)**

```tsx
// ---------------------------------------------------------------------------
// 2. Content-load axis (4)
// ---------------------------------------------------------------------------

export const ContentLoading = story({
  contentResponse: () => new Promise<string>(() => {}),
  diffResponse: () => new Promise<DiffOutput>(() => {}),
});

export const ContentNotFound = story({
  contentResponse: () => Promise.reject(ERR_NOT_FOUND),
  diffResponse: DIFF_NOT_IN_REPO,
});

export const ContentBinary = story({
  contentResponse: () => Promise.reject(ERR_BINARY),
  diffResponse: DIFF_NOT_IN_REPO,
});

export const ContentTooLarge = story({
  contentResponse: () => Promise.reject(ERR_TOO_LARGE),
  diffResponse: DIFF_NOT_IN_REPO,
});
```

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-viewer/FileViewerApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: file-viewer content-load axis stories (4)

Phase 9 / story group 2. ContentLoading / ContentNotFound /
ContentBinary / ContentTooLarge exhaustively cover the four
states of FileViewerApp's content-mode body. Error rejections
use the same {kind} payload shape the production read_text_file
command emits.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Mode-resolution axis stories

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-viewer/FileViewerApp.stories.tsx`

- [ ] **Step 1: Append the mode-resolution axis (3 stories)**

```tsx
// ---------------------------------------------------------------------------
// 3. Mode-resolution axis (3)
// ---------------------------------------------------------------------------

export const NotInRepoPlainContent = story({
  contentResponse: TSX_SAMPLE,
  diffResponse: DIFF_NOT_IN_REPO,
});

export const InRepoNoChangesAutoToContent = story({
  contentResponse: TSX_SAMPLE,
  diffResponse: DIFF_IN_REPO_NO_CHANGES,
});

export const InRepoWithDiffAutoToDiff = story({
  contentResponse: TSX_SAMPLE,
  diffResponse: { patch: PATCH_SINGLE_HUNK_TS, baselineRef: 'HEAD', inRepo: true },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-viewer/FileViewerApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: file-viewer mode-resolution axis stories (3)

Phase 9 / story group 3. NotInRepoPlainContent /
InRepoNoChangesAutoToContent / InRepoWithDiffAutoToDiff cover
the three branches of FileViewerApp's effectiveMode auto
ternary: not-in-repo, in-repo-clean, and in-repo-with-changes.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Diff view-mode axis stories

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-viewer/FileViewerApp.stories.tsx`

- [ ] **Step 1: Append the diff view-mode axis (4 stories)**

```tsx
// ---------------------------------------------------------------------------
// 4. Diff view-mode axis (4)
// ---------------------------------------------------------------------------

export const UnifiedDiff = story({
  contentResponse: TSX_SAMPLE,
  diffResponse: { patch: PATCH_SINGLE_HUNK_TS, baselineRef: 'HEAD', inRepo: true },
});

export const SplitDiff = story({
  contentResponse: TSX_SAMPLE,
  diffResponse: { patch: PATCH_SINGLE_HUNK_TS, baselineRef: 'HEAD', inRepo: true },
  settings: makeSettings({ fileViewerDefaultViewMode: 'split' }),
});

export const UnifiedToSplitToggle: Story = {
  args: {
    params: {
      contentResponse: TSX_SAMPLE,
      diffResponse: { patch: PATCH_SINGLE_HUNK_TS, baselineRef: 'HEAD', inRepo: true },
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent, waitFor, expect } = await import('storybook/test');
    const canvas = within(canvasElement);
    const splitChip = await canvas.findByRole('button', { name: 'Split' });
    await userEvent.click(splitChip);
    await waitFor(() => {
      const ctrl = (window as unknown as {
        __borgdock_storybook_tauri: { invocations: Array<{ command: string; args?: unknown }> };
      }).__borgdock_storybook_tauri;
      const saved = ctrl.invocations.find((i) => i.command === 'save_settings');
      expect(saved).toBeTruthy();
    });
  },
};

export const DiffLoadError = story({
  contentResponse: TSX_SAMPLE,
  diffResponse: () => Promise.reject(new Error('git command failed')),
});
```

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-viewer/FileViewerApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: file-viewer diff view-mode axis stories (4)

Phase 9 / story group 4. UnifiedDiff (default) /
SplitDiff (settings-driven) / UnifiedToSplitToggle (interaction;
asserts save_settings invoked) / DiffLoadError. The toggle's
play function asserts the persistence side-effect, not the DOM
shape — DOM-shape assertions belong in component-level stories.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Baseline axis stories

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-viewer/FileViewerApp.stories.tsx`

- [ ] **Step 1: Append the baseline axis (3 stories)**

```tsx
// ---------------------------------------------------------------------------
// 5. Baseline axis (3)
// ---------------------------------------------------------------------------

export const VsHEADActive = story({
  contentResponse: TSX_SAMPLE,
  diffResponse: { patch: PATCH_SINGLE_HUNK_TS, baselineRef: 'HEAD', inRepo: true },
});

export const VsMergeBaseDefault = story({
  baseline: 'mergeBaseDefault',
  contentResponse: TSX_SAMPLE,
  diffResponse: ({ baseline }) => ({
    patch: baseline === 'mergeBaseDefault' ? PATCH_SINGLE_HUNK_TS : '',
    baselineRef: baseline === 'mergeBaseDefault' ? 'main' : 'HEAD',
    inRepo: true,
  }),
});

export const BaselineSwitchInteraction: Story = {
  args: {
    params: {
      contentResponse: TSX_SAMPLE,
      diffResponse: ({ baseline }) => ({
        patch: PATCH_SINGLE_HUNK_TS,
        baselineRef: baseline === 'mergeBaseDefault' ? 'main' : 'HEAD',
        inRepo: true,
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent, waitFor, expect } = await import('storybook/test');
    const canvas = within(canvasElement);
    // Wait for the diff response to resolve so the chip's label updates from
    // 'vs default' to 'vs main' before we click it.
    const defaultChip = await canvas.findByRole('button', { name: /vs (default|main)/ });
    await userEvent.click(defaultChip);
    await waitFor(() => {
      const ctrl = (window as unknown as {
        __borgdock_storybook_tauri: { invocations: Array<{ command: string; args?: unknown }> };
      }).__borgdock_storybook_tauri;
      const calls = ctrl.invocations.filter(
        (i) =>
          i.command === 'git_file_diff' &&
          (i.args as { baseline?: string } | undefined)?.baseline === 'mergeBaseDefault',
      );
      expect(calls.length).toBeGreaterThan(0);
    });
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-viewer/FileViewerApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: file-viewer baseline axis stories (3)

Phase 9 / story group 5. VsHEADActive (default) /
VsMergeBaseDefault (URL-param-driven; second chip reads
'vs main' from defaultBranchLabel) / BaselineSwitchInteraction
(play: click 'vs default' chip; assert second git_file_diff
invocation with baseline=mergeBaseDefault).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Toolbar action + diff shape + probe stories

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-viewer/FileViewerApp.stories.tsx`

- [ ] **Step 1: Append the remaining 8 stories (toolbar 4 + diff-shape 3 + probe 1)**

```tsx
// ---------------------------------------------------------------------------
// 6. Toolbar action axis (4)
// ---------------------------------------------------------------------------

export const CopyAllSuccess: Story = {
  args: {
    params: {
      contentResponse: TSX_SAMPLE,
      diffResponse: DIFF_NOT_IN_REPO,
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent, waitFor } = await import('storybook/test');
    const canvas = within(canvasElement);
    // Wait for content to load — Copy all is disabled until then.
    const copyBtn = await canvas.findByRole('button', { name: 'Copy all' });
    await waitFor(() => {
      if ((copyBtn as HTMLButtonElement).disabled) throw new Error('not ready');
    });
    await userEvent.click(copyBtn);
    await canvas.findByRole('button', { name: 'Copied' });
  },
};

export const CopyAllDisabled: Story = {
  args: {
    params: {
      contentResponse: () => Promise.reject(ERR_NOT_FOUND),
      diffResponse: DIFF_NOT_IN_REPO,
    },
  },
  play: async ({ canvasElement }) => {
    const { within, waitFor, expect } = await import('storybook/test');
    const canvas = within(canvasElement);
    await waitFor(() => {
      const btn = canvas.getByRole('button', { name: 'Copy all' }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  },
};

export const OpenInEditorClicked: Story = {
  args: {
    params: {
      contentResponse: TSX_SAMPLE,
      diffResponse: DIFF_NOT_IN_REPO,
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent, waitFor, expect } = await import('storybook/test');
    const canvas = within(canvasElement);
    const btn = await canvas.findByRole('button', { name: 'Open in editor' });
    await userEvent.click(btn);
    await waitFor(() => {
      const ctrl = (window as unknown as {
        __borgdock_storybook_tauri: { invocations: Array<{ command: string; args?: unknown }> };
      }).__borgdock_storybook_tauri;
      const call = ctrl.invocations.find((i) => i.command === 'open_in_editor');
      expect(call).toBeTruthy();
      expect((call?.args as { path?: string } | undefined)?.path).toBeTruthy();
    });
  },
};

export const CloseClicked: Story = {
  args: {
    params: {
      contentResponse: TSX_SAMPLE,
      diffResponse: DIFF_NOT_IN_REPO,
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent, waitFor, expect } = await import('storybook/test');
    const canvas = within(canvasElement);
    const closeBtn = await canvas.findByRole('button', { name: /close/i });
    await userEvent.click(closeBtn);
    await waitFor(() => {
      const ctrl = (window as unknown as {
        __borgdock_storybook_tauri: { invocations: Array<{ command: string }> };
      }).__borgdock_storybook_tauri;
      const call = ctrl.invocations.find((i) => i.command === 'window.close');
      expect(call).toBeTruthy();
    });
  },
};

// ---------------------------------------------------------------------------
// 7. Diff content shape axis (3)
// ---------------------------------------------------------------------------

export const DiffAddOnly = story({
  path: 'src/lib/new-helper.ts',
  contentResponse: 'export function helper(x: number) { return x * 2; }\n',
  diffResponse: { patch: PATCH_ADD_ONLY_TS, baselineRef: 'HEAD', inRepo: true },
});

export const DiffDeleteOnly = story({
  path: 'src/lib/old-helper.ts',
  contentResponse: '',
  diffResponse: { patch: PATCH_DELETE_ONLY_TS, baselineRef: 'HEAD', inRepo: true },
});

export const DiffMultiHunk = story({
  path: 'src/services/api.ts',
  contentResponse: LARGE_TS_SAMPLE,
  diffResponse: { patch: PATCH_MULTI_HUNK_TS, baselineRef: 'HEAD', inRepo: true },
});

// ---------------------------------------------------------------------------
// 8. Syntax-highlight probe (1)
// ---------------------------------------------------------------------------

/**
 * The acceptance test for "tree-sitter wasm works in the Storybook iframe".
 * If either the runtime wasm (/web-tree-sitter.wasm) or the grammar wasm
 * (/grammars/tree-sitter-tsx.wasm) fails to load, the highlighter falls
 * back silently to plain spans — every character ends up inside a generic
 * <span>, with no `.hl-*` classes. This play function fails fast in that
 * case by asserting at least one element with a `.hl-*` class is present
 * after the highlighter resolves.
 */
export const ContentTSXSyntaxProbe: Story = {
  args: {
    params: {
      path: 'src/components/Counter.tsx',
      contentResponse: TSX_SAMPLE,
      diffResponse: DIFF_NOT_IN_REPO,
    },
  },
  play: async ({ canvasElement }) => {
    const { waitFor, expect } = await import('storybook/test');
    // The highlighter is async (wasm load + parse). Give it up to ~5s on
    // first run, but typical wall-time is sub-200ms once cached.
    await waitFor(
      () => {
        const hits = canvasElement.querySelectorAll(
          '.hl-keyword, .hl-string, .hl-tag, .hl-property',
        );
        expect(hits.length).toBeGreaterThan(0);
      },
      { timeout: 5000, interval: 100 },
    );
  },
};
```

- [ ] **Step 2: Final story-count assertion**

Verify exactly 25 stories:

```bash
cd /Users/koenvdb/projects/borgdock-storybook-file-viewer/src/BorgDock.Tauri && grep -c "^export const " src/components/file-viewer/FileViewerApp.stories.tsx
```
Expected: `25`.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-viewer/FileViewerApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: file-viewer toolbar + diff-shape + probe stories (8)

Phase 9 / story groups 6-8. Toolbar interactions (CopyAllSuccess /
CopyAllDisabled / OpenInEditorClicked / CloseClicked) cover every
action the toolbar exposes. Diff-shape stories (Add-only /
Delete-only / Multi-hunk) cover patch-shape variations.

ContentTSXSyntaxProbe is THE acceptance test for "tree-sitter wasm
works in Storybook" — its play function fails fast if no `.hl-*`
classes appear in the DOM, catching the silent-fallback regression
that the highlighter's try/catch otherwise hides.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# Phase D — Verification & PR

## Task 10: Vitest pass

**Files:** none

- [ ] **Step 1: Run vitest**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-file-viewer/src/BorgDock.Tauri && npm run test
```
Run with `timeout: 600000`. Expected: all existing tests still pass; no new failures from the fixtures or stories file (vitest doesn't pick up `*.stories.tsx`, so this is mostly a no-regression check).

If failures: investigate before proceeding. Do NOT skip.

---

## Task 11: build-storybook pass + tree-sitter probe verification

**Files:** none

- [ ] **Step 1: Build storybook**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-file-viewer/src/BorgDock.Tauri && npm run build-storybook
```
Run with `timeout: 600000`. Expected: build succeeds, output in `storybook-static/`.

- [ ] **Step 2: Verify the runtime wasm landed in the build output**

```bash
ls /Users/koenvdb/projects/borgdock-storybook-file-viewer/src/BorgDock.Tauri/storybook-static/web-tree-sitter.wasm 2>&1
ls /Users/koenvdb/projects/borgdock-storybook-file-viewer/src/BorgDock.Tauri/storybook-static/grammars/tree-sitter-tsx.wasm 2>&1
```
Both files MUST exist. If either is missing, Task 1's plugin invocation is wrong — investigate before proceeding.

- [ ] **Step 3: Manual probe verification (best-effort)**

Launch `npm run storybook` in the worktree if a browser is available, navigate to **File Viewer → FileViewerApp → ContentTSXSyntaxProbe**, and confirm the rendered code has colored keywords/strings/JSX tags (not plain text). If a browser launch is unavailable in the agent environment, document this verification gap explicitly in the PR description; the story's `play` function still fails fast on regression in CI / test-runner scenarios.

---

## Task 12: Production-tree byte-identical assertion

**Files:** none

- [ ] **Step 1: Diff against `origin/master`, excluding fixtures and stories**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-file-viewer && git diff origin/master...HEAD -- \
  src/BorgDock.Tauri/src/components/file-viewer \
  src/BorgDock.Tauri/src/components/file-palette/FilePaletteCodeView.tsx \
  src/BorgDock.Tauri/src/components/pr-detail/diff \
  src/BorgDock.Tauri/src/services/syntax-highlighter.ts \
  src/BorgDock.Tauri/src/services/diff-parser.ts \
  src/BorgDock.Tauri/src/hooks/useSyntaxHighlight.ts \
  src/BorgDock.Tauri/src/file-viewer-main.tsx \
  ':(exclude)src/BorgDock.Tauri/src/components/file-viewer/__fixtures__' \
  ':(exclude)src/BorgDock.Tauri/src/components/file-viewer/*.stories.tsx'
```
Expected: empty output (zero lines).

- [ ] **Step 2: Confirm the only `.storybook/` change is the viteStaticCopy plugin**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-file-viewer && git diff origin/master...HEAD -- src/BorgDock.Tauri/.storybook
```
Expected: only the `viteStaticCopy` import + push inside `viteFinal`. No alias edits. No mock changes.

---

## Task 13: Update roadmap + open PR

**Files:**
- Modify: `docs/superpowers/specs/storybook-roadmap.md`

- [ ] **Step 1: Claim Task #4 in the team task list**

Use `TaskUpdate(taskId: "4", owner: "viewer-files", status: "in_progress")` to claim. DM peers (`palette-files` and `palette-workitems`) confirming "I'm taking row 7-or-next-available; will edit roadmap.md now". Wait for ack from each peer (or a 60s no-objection window) before editing.

- [ ] **Step 2: Move FileViewerApp from Pending → Done**

Edit `docs/superpowers/specs/storybook-roadmap.md`:
1. Add a row to the "Done" table at the bottom of the existing list:

```
| 7 | File Viewer | `file-viewer-main.tsx` → `components/file-viewer/FileViewerApp.tsx` | `2026-05-06-storybook-phase9-file-viewer-design.md` | `2026-05-06-storybook-phase9-file-viewer.md` | _(filled in after PR opens)_ |
```

(If row 7 has been claimed by a peer between audit and edit time, take the next available number — coordinate via DM.)

2. Remove the `File Viewer` row from the "Pending" table.
3. No new entries in the mock-extensions list (Phase 9 added zero new aliases).

- [ ] **Step 3: Commit roadmap update**

```bash
git add docs/superpowers/specs/storybook-roadmap.md
git commit -m "$(cat <<'EOF'
roadmap: mark File Viewer (phase 9) done

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push branch + open PR**

```bash
gh auth switch --user borght-dev
cd /Users/koenvdb/projects/borgdock-storybook-file-viewer && git push -u origin storybook-phase9-file-viewer
gh pr create --title "storybook phase 9: file viewer catalog" --body "$(cat <<'EOF'
## Summary
- 25 Storybook stories for `FileViewerApp.tsx` covering URL/path, content-load,
  mode-resolution, diff view-mode, baseline, toolbar action, diff-shape, and
  syntax-highlight probe axes.
- Storybook config: added `viteStaticCopy` to `viteFinal` to copy
  `node_modules/web-tree-sitter/web-tree-sitter.wasm` into the iframe output.
  Mirrors the production `vite.config.ts` plugin invocation.
- No new mock aliases. No production code changes.

## Spec / Plan
- `docs/superpowers/specs/2026-05-06-storybook-phase9-file-viewer-design.md`
- `docs/superpowers/plans/2026-05-06-storybook-phase9-file-viewer.md`

## Tree-sitter probe
The `ContentTSXSyntaxProbe` story has a play function that asserts the
DOM contains `.hl-keyword` / `.hl-string` / `.hl-tag` / `.hl-property`
spans after the highlighter runs. If the runtime wasm 404s or the
grammar fails to load, the assertion fails fast — catching the silent
fallback that the highlighter's try/catch otherwise hides.

## Verification
- [x] `npm run test` — all existing tests pass (no new vitest tests; stories aren't picked up by vitest).
- [x] `npm run build-storybook` — succeeds; `storybook-static/web-tree-sitter.wasm` and `storybook-static/grammars/tree-sitter-tsx.wasm` both exist in the output.
- [ ] Visual confirmation in `npm run storybook` (manual): TODO if browser launch is available; otherwise relying on the probe's play assertion.

## Test plan
- [ ] CI: vitest passes
- [ ] CI: build-storybook completes
- [ ] CI: probe story's play function passes (asserts highlighted spans exist)
- [ ] Manual: open `npm run storybook` and verify ContentTSXSyntaxProbe shows colored keywords / strings / JSX tags

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh auth switch --user KvanderBorght_gomocha
```

- [ ] **Step 5: Release Task #4**

Use `TaskUpdate(taskId: "4", status: "completed")` after the roadmap commit lands.

---

## Final verification checklist

- [ ] `git diff origin/master...HEAD -- <production paths>` shows zero lines (Task 12).
- [ ] `npm run test` passes (Task 10).
- [ ] `npm run build-storybook` passes (Task 11).
- [ ] Story count = 25 (Task 9 step 2).
- [ ] Probe story's play function passes either in test-runner CI or manual browser check (Task 11).
- [ ] Roadmap updated, PR opened, gh switched back to enterprise account (Task 13).
- [ ] Tasks #3, #4, and #5 (if claimed) marked completed.
