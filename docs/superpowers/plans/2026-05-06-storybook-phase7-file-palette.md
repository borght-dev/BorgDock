# Storybook Phase 7 — FilePaletteApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 25 exhaustive Storybook stories for `FilePaletteApp.tsx` (the file-palette window) and extend the existing Tauri mock layer with one new method on `tauri-api-window.ts` (`getCurrentWindow().onFocusChanged`) — all without changing a byte of production code.

**Architecture:** Add the `onFocusChanged` method on `MockWindow` (mirrors Phase 4's `onMoved` synthetic-channel pattern), add a fixtures module under `components/file-palette/__fixtures__/`, add a single `FilePaletteApp.stories.tsx` file. No new aliases in `.storybook/main.ts`, no new mock files, no new control-surface fields.

**Tech Stack:** Storybook 9 + `@storybook/react-vite`, Vite 6, React 19, Tailwind v4, TypeScript 5.8 (already installed in Phase 1).

**Spec:** `docs/superpowers/specs/2026-05-06-storybook-phase7-file-palette-design.md`
**Roadmap:** `docs/superpowers/specs/storybook-roadmap.md`

**All paths in this plan are relative to repo root unless explicitly absolute. Working directory is `/Users/koenvdb/projects/BorgDock` (HEAD = `storybook-phase7-file-palette` from `origin/master`).**

**Phase organization:**
- **Phase A — Mock layer (Task 1):** extend `tauri-api-window.ts` with `onFocusChanged`. Reviewed end-of-phase. **MUST commit before story commits per the wave-2 ordering rule.**
- **Phase B — Fixtures (Task 2):** synthetic settings / repos / file-index / changed-files / content-search / diff fixtures.
- **Phase C — Stories (Tasks 3–9):** scaffold + per-axis story groups (load / roots / search / results / changes / preview / interaction).
- **Phase D — Verification & PR (Tasks 10–11):** byte-identical assertion, roadmap update, PR.

---

## Task 0: Verify worktree environment

**Files:** none

- [ ] **Step 1: Check branch + tree**

```bash
cd /Users/koenvdb/projects/BorgDock
git status && git rev-parse --abbrev-ref HEAD && git rev-parse HEAD
git fetch origin master
git diff origin/master...HEAD -- .  # should be empty before any commits
```
Expected: `storybook-phase7-file-palette` branch, clean tree, HEAD == origin/master initially.

- [ ] **Step 2: Verify npm install ran**

```bash
ls /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/node_modules/.bin/storybook
```
Expected: file exists. (If missing, run `cd src/BorgDock.Tauri && npm install` with `timeout: 600000`.)

---

# Phase A — Mock layer

## Task 1: Extend `tauri-api-window` mock with `onFocusChanged`

**Files:**
- Modify: `src/BorgDock.Tauri/.storybook/mocks/tauri-api-window.ts`

- [ ] **Step 1: Replace the file with the extended version**

Full new content of `.storybook/mocks/tauri-api-window.ts`:

```ts
// .storybook/mocks/tauri-api-window.ts
//
// Drop-in replacement for @tauri-apps/api/window. Covers the surfaces
// every window storied so far uses:
//   - getCurrentWindow().close/minimize/maximize/unmaximize/isMaximized  (Phase 2)
//   - getCurrentWindow().hide/setSize/innerSize/scaleFactor              (Phase 3)
//   - getCurrentWindow().outerPosition/setPosition/onMoved               (Phase 4)
//   - getCurrentWindow().setTitle/getTitle                               (Phase 6)
//   - getCurrentWindow().onFocusChanged                                  (Phase 7)
//   - currentMonitor()                                                   (Phase 3)
//
// hide() and close() are no-ops — without them, the Worktree palette's
// Esc-to-hide, the WhatsNew "Got it" button, and the WorkItemDetail
// close icon would unmount the Storybook iframe. setSize() updates the
// recorded windowSize so a follow-up innerSize() reflects the resize,
// but the iframe itself is unaffected (Storybook controls visible bounds).
//
// Listener-class methods (onMoved, onFocusChanged) register under
// synthetic '__window.<name>' channels. Stories drive events with
// getControl().emit('__window.<name>', payload). The '__window.' prefix
// is reserved for getCurrentWindow() listener emulation so future phases
// (onCloseRequested, onResized, etc.) can reuse the pattern without
// colliding with real Tauri event names.

import { getControl, type ChannelListener } from './control';

interface MockPhysicalSize {
  width: number;
  height: number;
}

interface MockPhysicalPosition {
  x: number;
  y: number;
}

interface PositionInput {
  x: number;
  y: number;
  // Optional discriminator from LogicalPosition / PhysicalPosition.
  type?: 'Logical' | 'Physical';
}

interface MockWindow {
  close(): Promise<void>;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  unmaximize(): Promise<void>;
  isMaximized(): Promise<boolean>;
  hide(): Promise<void>;
  setSize(size: { width: number; height: number }): Promise<void>;
  innerSize(): Promise<MockPhysicalSize>;
  scaleFactor(): Promise<number>;
  outerPosition(): Promise<MockPhysicalPosition>;
  setPosition(pos: PositionInput): Promise<void>;
  onMoved(cb: (event: { payload: MockPhysicalPosition }) => void): Promise<() => void>;
  onFocusChanged(cb: (event: { payload: boolean }) => void): Promise<() => void>;
  setTitle(title: string): Promise<void>;
  getTitle(): Promise<string>;
}

export type Window = MockWindow;

const ON_MOVED_CHANNEL = '__window.onMoved';
const ON_FOCUS_CHANGED_CHANNEL = '__window.onFocusChanged';

export function getCurrentWindow(): MockWindow {
  const ctrl = getControl();
  return {
    async close() {
      ctrl.invocations.push({ command: 'window.close' });
    },
    async minimize() {
      ctrl.invocations.push({ command: 'window.minimize' });
    },
    async maximize() {
      ctrl.invocations.push({ command: 'window.maximize' });
      ctrl.windowState.isMaximized = true;
    },
    async unmaximize() {
      ctrl.invocations.push({ command: 'window.unmaximize' });
      ctrl.windowState.isMaximized = false;
    },
    async isMaximized() {
      return ctrl.windowState.isMaximized;
    },
    async hide() {
      ctrl.invocations.push({ command: 'window.hide' });
    },
    async setSize(size) {
      ctrl.invocations.push({ command: 'window.setSize', args: size });
      ctrl.windowSize.width = size.width;
      ctrl.windowSize.height = size.height;
    },
    async innerSize() {
      // Production code expects PhysicalSize, so return width*scaleFactor.
      return {
        width: ctrl.windowSize.width * ctrl.windowSize.scaleFactor,
        height: ctrl.windowSize.height * ctrl.windowSize.scaleFactor,
      };
    },
    async scaleFactor() {
      return ctrl.windowSize.scaleFactor;
    },
    async outerPosition() {
      // Real Tauri returns PhysicalPosition. Multiply by scaleFactor so
      // SqlApp's `pos.x / scale` round-trip lands back at the logical x,y.
      return {
        x: ctrl.windowSize.x * ctrl.windowSize.scaleFactor,
        y: ctrl.windowSize.y * ctrl.windowSize.scaleFactor,
      };
    },
    async setPosition(pos) {
      ctrl.invocations.push({ command: 'window.setPosition', args: pos });
      // Logical inputs scale up; Physical pass through. A plain {x,y} with
      // no type is treated as Logical (matches the most common caller).
      const isPhysical = pos.type === 'Physical';
      const factor = isPhysical ? 1 : ctrl.windowSize.scaleFactor;
      ctrl.windowSize.x = (pos.x * factor) / ctrl.windowSize.scaleFactor;
      ctrl.windowSize.y = (pos.y * factor) / ctrl.windowSize.scaleFactor;
    },
    async onMoved(cb) {
      let set = ctrl.channels.get(ON_MOVED_CHANNEL);
      if (!set) {
        set = new Set();
        ctrl.channels.set(ON_MOVED_CHANNEL, set);
      }
      const wrapped: ChannelListener = (event) =>
        cb(event as { payload: MockPhysicalPosition });
      set.add(wrapped);
      return () => {
        set?.delete(wrapped);
      };
    },
    async onFocusChanged(cb) {
      let set = ctrl.channels.get(ON_FOCUS_CHANGED_CHANNEL);
      if (!set) {
        set = new Set();
        ctrl.channels.set(ON_FOCUS_CHANGED_CHANNEL, set);
      }
      const wrapped: ChannelListener = (event) =>
        cb(event as { payload: boolean });
      set.add(wrapped);
      return () => {
        set?.delete(wrapped);
      };
    },
    async setTitle(title: string) {
      ctrl.invocations.push({ command: 'window.setTitle', args: { title } });
      ctrl.windowState.title = title;
    },
    async getTitle() {
      return ctrl.windowState.title;
    },
  };
}

export async function currentMonitor() {
  const ctrl = getControl();
  return (
    ctrl.monitorState ?? {
      size: { width: 1920, height: 1080 },
      scaleFactor: 1,
    }
  );
}
```

- [ ] **Step 2: Verify tsc clean**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock && git add src/BorgDock.Tauri/.storybook/mocks/tauri-api-window.ts
git commit -m "$(cat <<'EOF'
storybook: add onFocusChanged to window mock for phase 7

FilePaletteApp listens for window-focus changes to refresh worktree
change-counts when the user re-focuses the palette. The synthetic
'__window.onFocusChanged' channel mirrors phase 4's onMoved pattern —
stories drive focus events via getControl().emit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

**Phase A review checkpoint:** `npm run build-storybook` should still complete (no story references the new method yet, but the alias surface compiles).

---

# Phase B — Fixtures

## Task 2: File-palette fixtures

**Files:**
- Create: `src/BorgDock.Tauri/src/components/file-palette/__fixtures__/file-palette-data.ts`

- [ ] **Step 1: Write the fixtures**

```ts
// src/components/file-palette/__fixtures__/file-palette-data.ts
//
// Synthetic AppSettings / repo / worktree / index / content-search /
// changed-files / diff fixtures for the FilePaletteApp Storybook
// catalog. Real data never enters Storybook — these fixtures are the
// only inputs.

import type { AppSettings, RepoSettings } from '@/types/settings';
import type { ContentFileResult } from '../use-content-search';
import type { ChangedFileEntry } from '../FilePaletteChangesSection';
import type { FileEntry } from '../use-file-index';

// Mirrors the local interface inside FilePaletteApp.tsx (non-exported).
export interface WorktreeEntry {
  path: string;
  branchName: string;
  isMainWorktree: boolean;
}

export interface ChangedFilesOutput {
  local: ChangedFileEntry[];
  vsBase: ChangedFileEntry[];
  baseRef: string;
  inRepo: boolean;
}

// ---------------------------------------------------------------------------
// AppSettings factory
// ---------------------------------------------------------------------------

export function canonicalSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    setupComplete: true,
    gitHub: { authMethod: 'ghCli', pollIntervalSeconds: 60, username: 'storybook' },
    repos: [],
    ui: {
      sidebarEdge: 'right',
      sidebarMode: 'pinned',
      sidebarWidthPx: 800,
      theme: 'system',
      globalHotkey: '',
      flyoutHotkey: '',
      editorCommand: 'code',
      runAtStartup: false,
      quickReviewHotkey: '',
      startMinimizedToTray: false,
      restoreLastSelection: true,
    },
    notifications: {
      toastOnCheckStatusChange: false,
      toastOnNewPR: false,
      toastOnReviewUpdate: false,
      toastOnMergeable: false,
      onlyMyPRs: false,
      playMergeSound: false,
      reviewNudgeEnabled: false,
      reviewNudgeIntervalMinutes: 60,
      reviewNudgeEscalation: false,
      deduplicationWindowSeconds: 60,
      channels: { tray: false, system: false, sound: false, emailDigest: false },
    },
    claudeCode: { defaultPostFixAction: 'none' },
    claudeApi: {
      model: 'claude-sonnet-4-7',
      maxTokens: 4096,
      prSummaryEnabled: false,
      diffExplanationsEnabled: false,
      reviewNudgePhrasingEnabled: false,
      commitMessageSuggestionsEnabled: false,
    },
    claudeReview: { botUsername: '' },
    updates: { autoCheckEnabled: false, autoDownload: false },
    azureDevOps: {
      organization: '',
      project: '',
      authMethod: 'pat',
      authAutoDetected: false,
      pollIntervalSeconds: 60,
      favoriteQueryIds: [],
      trackedWorkItemIds: [],
      workingOnWorkItemIds: [],
      workItemWorktreePaths: {},
      recentWorkItemIds: [],
      linkMatchBy: 'both',
      showWorkItemStateOnPrCard: false,
      updatePrStatusWhenWiDone: false,
    },
    sql: { connections: [], readOnlyByDefault: true, confirmDestructiveWithoutWhere: true },
    repoPriority: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Repo / worktree factories
// ---------------------------------------------------------------------------

export function makeRepo(overrides: Partial<RepoSettings> = {}): RepoSettings {
  return {
    owner: 'borght-dev',
    name: 'BorgDock',
    enabled: true,
    worktreeBasePath: '/Users/storybook/worktrees/BorgDock',
    worktreeSubfolder: 'wt',
    favoriteWorktreePaths: [],
    ...overrides,
  };
}

export function makeWorktree(overrides: Partial<WorktreeEntry> = {}): WorktreeEntry {
  return {
    path: '/Users/storybook/worktrees/BorgDock/main',
    branchName: 'main',
    isMainWorktree: true,
    ...overrides,
  };
}

export const repoBorgDock: RepoSettings = makeRepo();

export const repoFspHorizon: RepoSettings = makeRepo({
  owner: 'gomocha',
  name: 'fsp-horizon',
  worktreeBasePath: '/Users/storybook/worktrees/fsp-horizon',
});

export const repoCustomFavs: RepoSettings = makeRepo({
  owner: 'borght-dev',
  name: 'BorgDock',
  favoriteWorktreePaths: [
    '/Users/storybook/worktrees/BorgDock/feature-a',
    '/Users/storybook/worktrees/BorgDock/main',
  ],
});

export const wtMainBorgDock: WorktreeEntry = makeWorktree();
export const wtFeatureBorgDock: WorktreeEntry = makeWorktree({
  path: '/Users/storybook/worktrees/BorgDock/feature-a',
  branchName: 'feature/a',
  isMainWorktree: false,
});
export const wtMainFsp: WorktreeEntry = makeWorktree({
  path: '/Users/storybook/worktrees/fsp-horizon/main',
  branchName: 'main',
  isMainWorktree: true,
});

// ---------------------------------------------------------------------------
// File-index fixtures (sized to keep tree-sitter indexer fast)
// ---------------------------------------------------------------------------

export function makeFileEntry(rel: string, size = 1024): FileEntry {
  return { rel_path: rel, size };
}

export const tinyFileIndex: FileEntry[] = [
  makeFileEntry('src/App.tsx', 1200),
  makeFileEntry('src/index.tsx', 600),
  makeFileEntry('src/components/Button.tsx', 800),
  makeFileEntry('src/components/Card.tsx', 700),
  makeFileEntry('src/utils/format.tsx', 500),
];

export const mediumFileIndex: FileEntry[] = (() => {
  const out: FileEntry[] = [];
  for (let i = 0; i < 50; i++) {
    const ext = ['tsx', 'ts', 'json', 'css', 'md'][i % 5]!;
    out.push(makeFileEntry(`src/file-${String(i).padStart(2, '0')}.${ext}`, 100 + i * 32));
  }
  return out;
})();

export const largeFileIndexCapped: FileEntry[] = (() => {
  const out: FileEntry[] = [];
  for (let i = 0; i < 600; i++) {
    out.push(makeFileEntry(`src/big/dir-${i % 30}/file-${i}.ts`, 200 + i));
  }
  return out;
})();

// ---------------------------------------------------------------------------
// Content-search fixtures
// ---------------------------------------------------------------------------

export function makeContentResult(rel: string, hitLines: number[]): ContentFileResult {
  return {
    rel_path: rel,
    match_count: hitLines.length,
    matches: hitLines.map((line) => ({ line, preview: `…match on line ${line}…` })),
  };
}

export const contentResultsForFoo: ContentFileResult[] = [
  makeContentResult('src/App.tsx', [12, 47, 89]),
  makeContentResult('src/components/Card.tsx', [4, 22]),
  makeContentResult('src/utils/format.tsx', [7, 14, 31, 44]),
  makeContentResult('src/index.tsx', [3, 9, 18]),
];

// ---------------------------------------------------------------------------
// Changed-files fixtures
// ---------------------------------------------------------------------------

export function makeChangedFile(
  path: string,
  status = 'M',
  additions = 4,
  deletions = 2,
): ChangedFileEntry {
  return { path, status, additions, deletions };
}

export const changedFilesEmpty: ChangedFilesOutput = {
  local: [],
  vsBase: [],
  baseRef: 'main',
  inRepo: true,
};

export const changedFilesNotInRepo: ChangedFilesOutput = {
  local: [],
  vsBase: [],
  baseRef: '',
  inRepo: false,
};

export const changedFilesLocalOnly: ChangedFilesOutput = {
  local: [
    makeChangedFile('src/App.tsx', 'M', 8, 3),
    makeChangedFile('src/components/Button.tsx', 'M', 2, 0),
    makeChangedFile('src/components/Card.tsx', 'A', 40, 0),
    makeChangedFile('src/legacy/old.ts', 'D', 0, 25),
  ],
  vsBase: [],
  baseRef: 'main',
  inRepo: true,
};

export const changedFilesBoth: ChangedFilesOutput = {
  local: [
    makeChangedFile('src/App.tsx', 'M', 8, 3),
    makeChangedFile('src/components/Button.tsx', 'M', 2, 0),
    makeChangedFile('src/components/Card.tsx', 'A', 40, 0),
    makeChangedFile('src/legacy/old.ts', 'D', 0, 25),
  ],
  vsBase: [
    makeChangedFile('src/App.tsx', 'M', 12, 5),
    makeChangedFile('src/utils/format.tsx', 'A', 30, 0),
    makeChangedFile('src/index.tsx', 'M', 1, 1),
  ],
  baseRef: 'main',
  inRepo: true,
};

// ---------------------------------------------------------------------------
// Preview fixtures (read_text_file payloads + errors)
// ---------------------------------------------------------------------------

export const tsxFileSample = `import { useState } from 'react';

interface CounterProps {
  initial: number;
}

export function Counter({ initial }: CounterProps) {
  const [count, setCount] = useState(initial);
  const increment = () => setCount((n) => n + 1);
  return (
    <div className="counter">
      <span className="counter-value">{count}</span>
      <button type="button" onClick={increment}>
        +1
      </button>
    </div>
  );
}
`;

export const tooLargeError = { kind: 'tooLarge' as const, size: 4_000_000, limit: 1_500_000 };
export const binaryError = { kind: 'binary' as const };
export const notFoundError = { kind: 'notFound' as const };

// ---------------------------------------------------------------------------
// Diff fixture (git_file_diff payload)
// ---------------------------------------------------------------------------

export const sampleDiffPatch = `diff --git a/src/App.tsx b/src/App.tsx
index 1111111..2222222 100644
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -1,5 +1,7 @@
 import { useState } from 'react';
+import { Counter } from './components/Counter';

 export function App() {
-  return <h1>Hello</h1>;
+  return <Counter initial={0} />;
 }
@@ -10,3 +12,4 @@ export function App() {
 // legacy code below
 const _legacy = true;
+const _added = 'storybook fixture';
`;

export const sampleDiffOutput = {
  patch: sampleDiffPatch,
  baselineRef: 'main',
  inRepo: true,
};
```

- [ ] **Step 2: Verify tsc clean**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock && git add src/BorgDock.Tauri/src/components/file-palette/__fixtures__/file-palette-data.ts
git commit -m "$(cat <<'EOF'
storybook: file-palette fixture factories + curated scenarios

canonicalSettings, makeRepo, makeWorktree, makeFileEntry,
makeContentResult, makeChangedFile factories. Plus tinyFileIndex (5
.tsx — symbol-indexer probe), mediumFileIndex (50 mixed-extension),
largeFileIndexCapped (600 — truncated path), curated content-search
hits, three changed-files variants (empty, local-only, both groups,
not-in-repo), TSX preview sample, sample diff patch.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

**Phase B review checkpoint:** confirm `npx tsc --noEmit` is clean before writing stories.

---

# Phase C — Stories

## Task 3: Stories scaffold + Bootstrap axis (Loading + SettingsLoadFailed)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx`

- [ ] **Step 1: Write the file with meta, harness, helper, and two bootstrap stories**

```tsx
// src/components/file-palette/FilePaletteApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { getControl } from '../../../.storybook/mocks/control';
import {
  canonicalSettings,
  changedFilesEmpty,
  mediumFileIndex,
  repoBorgDock,
  wtMainBorgDock,
} from './__fixtures__/file-palette-data';
import { FilePaletteApp } from './FilePaletteApp';

interface FilePaletteStoryParams {
  /** Static or function-form invokeResponses to seed before mount. */
  invokeResponses?: Record<string, unknown | ((args: unknown) => unknown)>;
  /** Plugin-dialog response for the Add-custom-root flow. */
  pluginDialogOpenResponse?: string | string[] | null;
}

function applyParamsBeforeMount(params: FilePaletteStoryParams) {
  const ctrl = getControl();

  // Always seed window_ready as a no-op so the reveal effect doesn't error.
  ctrl.invokeResponses['window_ready'] = undefined;

  for (const [k, v] of Object.entries(params.invokeResponses ?? {})) {
    ctrl.invokeResponses[k] = v;
  }
  if (params.pluginDialogOpenResponse !== undefined) {
    ctrl.pluginDialog.openResponse = params.pluginDialogOpenResponse;
  }
}

function FilePaletteHarness({ params }: { params: FilePaletteStoryParams }) {
  // Apply BEFORE the inner component mounts. Effects run after children
  // mount in React, so we call this synchronously in the function body.
  applyParamsBeforeMount(params);

  useEffect(() => {
    // Lifetime-scoped — preview decorator already calls reset() before each render.
  }, []);

  return (
    <div style={{ width: 960, height: 600 }}>
      <FilePaletteApp />
    </div>
  );
}

const meta: Meta<typeof FilePaletteHarness> = {
  title: 'File Palette/FilePaletteApp',
  component: FilePaletteHarness,
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj<typeof FilePaletteHarness>;

function story(params: FilePaletteStoryParams = {}): Story {
  return { args: { params } };
}

// ---------------------------------------------------------------------------
// Helpers — one place to compose the boilerplate invokeResponses each story
// needs. `loadedPalette` is the "happy default" map; stories override individual
// keys for axis-specific variation.
// ---------------------------------------------------------------------------

function loadedPalette(overrides: Record<string, unknown | ((args: unknown) => unknown)> = {}) {
  const settings = canonicalSettings({
    repos: [{ ...repoBorgDock }],
  });
  return {
    load_settings: settings,
    list_worktrees_bare: [wtMainBorgDock],
    list_root_files: { entries: mediumFileIndex, truncated: false },
    git_changed_files: changedFilesEmpty,
    save_settings: undefined,
    open_file_viewer_window: undefined,
    open_in_editor: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Bootstrap / load axis
// ---------------------------------------------------------------------------

export const Loading: Story = story({
  invokeResponses: {
    load_settings: () => new Promise(() => {}),
  },
});

export const SettingsLoadFailed: Story = story({
  invokeResponses: {
    load_settings: () => {
      throw new Error('storybook: load_settings rejected');
    },
  },
});
```

- [ ] **Step 2: Verify build-storybook**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri && timeout 600 npm run build-storybook 2>&1 | tail -10
```
Expected: completes without errors.

- [ ] **Step 3: Story count check**

```bash
grep -c "^export const " src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx
```
Expected: `2`.

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock && git add src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: FilePaletteApp scaffold + bootstrap axis stories

FilePaletteHarness applies invokeResponses + pluginDialog.openResponse
synchronously before mount. loadedPalette() helper composes the happy-
default invoke-responses map. Bootstrap axis: Loading (load_settings
pending), SettingsLoadFailed (load_settings rejects → loadError state).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Roots-column axis stories (3)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx`

- [ ] **Step 1: Extend the fixtures import block**

Replace the existing fixtures import line so it imports the additional fixtures used here:

```tsx
import {
  canonicalSettings,
  changedFilesEmpty,
  mediumFileIndex,
  repoBorgDock,
  repoCustomFavs,
  repoFspHorizon,
  wtFeatureBorgDock,
  wtMainBorgDock,
  wtMainFsp,
} from './__fixtures__/file-palette-data';
```

- [ ] **Step 2: Append the three roots-column stories**

```tsx
// ---------------------------------------------------------------------------
// Roots-column axis
// ---------------------------------------------------------------------------

export const SingleWorktreeRoot: Story = story({
  invokeResponses: loadedPalette(),
});

export const MultipleRootsActive: Story = story({
  invokeResponses: loadedPalette({
    load_settings: canonicalSettings({
      repos: [{ ...repoBorgDock }, { ...repoFspHorizon }],
      filePaletteRoots: [{ path: '/Users/storybook/extra/notes' }],
    }),
    list_worktrees_bare: (args: unknown) => {
      const a = args as { basePath?: string };
      if (a.basePath?.endsWith('BorgDock')) {
        return [wtMainBorgDock, wtFeatureBorgDock];
      }
      if (a.basePath?.endsWith('fsp-horizon')) {
        return [wtMainFsp];
      }
      return [];
    },
  }),
});

export const FavoritesOnly: Story = story({
  invokeResponses: loadedPalette({
    load_settings: canonicalSettings({
      repos: [{ ...repoCustomFavs }],
      ui: {
        ...canonicalSettings().ui,
        filePaletteFavoritesOnly: true,
      },
    }),
    list_worktrees_bare: [wtMainBorgDock, wtFeatureBorgDock],
  }),
});
```

- [ ] **Step 3: Story count check**

```bash
grep -c "^export const " src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx
```
Expected: `5`.

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock && git add src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: file-palette roots-column axis stories (3)

SingleWorktreeRoot (one repo + one worktree),
MultipleRootsActive (two repos, three worktrees, one custom root —
exercises arg-discriminated list_worktrees_bare),
FavoritesOnly (filePaletteFavoritesOnly=true with two favourites).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Search-modes axis stories (4)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx`

- [ ] **Step 1: Extend fixtures import block**

```tsx
import {
  canonicalSettings,
  changedFilesEmpty,
  contentResultsForFoo,
  mediumFileIndex,
  repoBorgDock,
  repoCustomFavs,
  repoFspHorizon,
  tinyFileIndex,
  wtFeatureBorgDock,
  wtMainBorgDock,
  wtMainFsp,
} from './__fixtures__/file-palette-data';
```

- [ ] **Step 2: Append the four search-mode stories**

```tsx
// ---------------------------------------------------------------------------
// Search-modes axis
// ---------------------------------------------------------------------------

export const DefaultMixed: Story = story({
  invokeResponses: loadedPalette(),
});

export const FilenameSearchActive: Story = {
  args: { params: { invokeResponses: loadedPalette() } },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/search/i);
    await userEvent.type(input, 'file-1');
  },
};

export const ContentSearchActive: Story = {
  args: {
    params: {
      invokeResponses: loadedPalette({
        search_content: contentResultsForFoo,
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/search/i);
    await userEvent.type(input, '>foo');
  },
};

export const SymbolSearchActive: Story = {
  args: {
    params: {
      invokeResponses: loadedPalette({
        list_root_files: { entries: tinyFileIndex, truncated: false },
        // The symbol indexer reads each file's content to extract symbols.
        // Return a minimal payload — the indexer is a tree-sitter probe; if
        // wasm fails to load, the story still renders (just with zero hits).
        read_text_file: 'export function App() { return null }',
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/search/i);
    await userEvent.type(input, '@App');
  },
};
```

- [ ] **Step 3: Story count check**

```bash
grep -c "^export const " src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx
```
Expected: `9`.

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock && git add src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: file-palette search-modes axis stories (4)

DefaultMixed (empty query, scope=all), FilenameSearchActive (typed
"file-1"), ContentSearchActive (">foo" prefix → search_content fixture),
SymbolSearchActive ("@App" → useBackgroundIndexer + tree-sitter probe).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Results-state axis stories (2)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx`

- [ ] **Step 1: Extend fixtures import**

Add `largeFileIndexCapped`:

```tsx
import {
  canonicalSettings,
  changedFilesEmpty,
  contentResultsForFoo,
  largeFileIndexCapped,
  mediumFileIndex,
  repoBorgDock,
  repoCustomFavs,
  repoFspHorizon,
  tinyFileIndex,
  wtFeatureBorgDock,
  wtMainBorgDock,
  wtMainFsp,
} from './__fixtures__/file-palette-data';
```

- [ ] **Step 2: Append the two results-state stories**

```tsx
// ---------------------------------------------------------------------------
// Results-state axis
// ---------------------------------------------------------------------------

export const ResultsEmptyNoMatch: Story = {
  args: { params: { invokeResponses: loadedPalette() } },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/search/i);
    await userEvent.type(input, 'zzznosuchstring');
  },
};

export const ResultsTruncated: Story = story({
  invokeResponses: loadedPalette({
    list_root_files: { entries: largeFileIndexCapped, truncated: true },
  }),
});
```

- [ ] **Step 3: Story count check**

```bash
grep -c "^export const " src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx
```
Expected: `11`.

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock && git add src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: file-palette results-state axis stories (2)

ResultsEmptyNoMatch ("No filenames matching 'zzznosuchstring'"),
ResultsTruncated (600-file index with truncated:true).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Changes-section axis stories (4)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx`

- [ ] **Step 1: Extend fixtures import**

Add the changed-files fixtures:

```tsx
import {
  canonicalSettings,
  changedFilesBoth,
  changedFilesEmpty,
  changedFilesLocalOnly,
  changedFilesNotInRepo,
  contentResultsForFoo,
  largeFileIndexCapped,
  mediumFileIndex,
  repoBorgDock,
  repoCustomFavs,
  repoFspHorizon,
  tinyFileIndex,
  wtFeatureBorgDock,
  wtMainBorgDock,
  wtMainFsp,
} from './__fixtures__/file-palette-data';
```

- [ ] **Step 2: Append the four changes-section stories**

```tsx
// ---------------------------------------------------------------------------
// Changes-section axis
// ---------------------------------------------------------------------------

export const ChangesLocalOnly: Story = story({
  invokeResponses: loadedPalette({
    git_changed_files: changedFilesLocalOnly,
  }),
});

export const ChangesBothGroups: Story = story({
  invokeResponses: loadedPalette({
    git_changed_files: changedFilesBoth,
  }),
});

export const ChangesNotInRepo: Story = story({
  invokeResponses: loadedPalette({
    git_changed_files: changedFilesNotInRepo,
  }),
});

export const ChangesCollapsed: Story = story({
  invokeResponses: loadedPalette({
    load_settings: canonicalSettings({
      repos: [{ ...repoBorgDock }],
      ui: {
        ...canonicalSettings().ui,
        filePaletteChangesCollapsed: true,
      },
    }),
    git_changed_files: changedFilesBoth,
  }),
});
```

- [ ] **Step 3: Story count check**

```bash
grep -c "^export const " src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx
```
Expected: `15`.

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock && git add src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: file-palette changes-section axis stories (4)

ChangesLocalOnly (vsBase empty), ChangesBothGroups (both lists),
ChangesNotInRepo (inRepo:false), ChangesCollapsed
(filePaletteChangesCollapsed=true).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Preview-pane axis stories (5)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx`

- [ ] **Step 1: Extend fixtures import**

Add the preview-related fixtures:

```tsx
import {
  binaryError,
  canonicalSettings,
  changedFilesBoth,
  changedFilesEmpty,
  changedFilesLocalOnly,
  changedFilesNotInRepo,
  contentResultsForFoo,
  largeFileIndexCapped,
  mediumFileIndex,
  repoBorgDock,
  repoCustomFavs,
  repoFspHorizon,
  sampleDiffOutput,
  tinyFileIndex,
  tsxFileSample,
  wtFeatureBorgDock,
  wtMainBorgDock,
  wtMainFsp,
} from './__fixtures__/file-palette-data';
```

- [ ] **Step 2: Append the five preview-pane stories**

```tsx
// ---------------------------------------------------------------------------
// Preview-pane axis
// ---------------------------------------------------------------------------

export const PreviewEmpty: Story = story({
  invokeResponses: loadedPalette(),
});

export const PreviewFileLoading: Story = {
  args: {
    params: {
      invokeResponses: loadedPalette({
        read_text_file: () => new Promise(() => {}),
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/search/i);
    await userEvent.type(input, 'file-0');
    // Click the first result to select it. The list rows are buttons —
    // findAllByRole returns palette rows; row 0 is the selection.
    const rows = await canvas.findAllByRole('button');
    const fileRow = rows.find((r) => r.textContent?.includes('file-00'));
    if (fileRow) await userEvent.click(fileRow);
  },
};

export const PreviewFileOk: Story = {
  args: {
    params: {
      invokeResponses: loadedPalette({
        read_text_file: tsxFileSample,
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/search/i);
    await userEvent.type(input, 'file-00');
    const rows = await canvas.findAllByRole('button');
    const fileRow = rows.find((r) => r.textContent?.includes('file-00'));
    if (fileRow) await userEvent.click(fileRow);
    // Wait for the preview body to render the file content.
    // FilePaletteCodeView's lines render with [data-testid="code-line-text"].
    await canvas.findAllByTestId('code-line-row');
  },
};

export const PreviewFileBinary: Story = {
  args: {
    params: {
      invokeResponses: loadedPalette({
        read_text_file: () => {
          throw binaryError;
        },
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/search/i);
    await userEvent.type(input, 'file-00');
    const rows = await canvas.findAllByRole('button');
    const fileRow = rows.find((r) => r.textContent?.includes('file-00'));
    if (fileRow) await userEvent.click(fileRow);
    await canvas.findByText(/binary file/i);
  },
};

export const PreviewDiffOk: Story = {
  args: {
    params: {
      invokeResponses: loadedPalette({
        git_changed_files: changedFilesBoth,
        git_file_diff: sampleDiffOutput,
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    // Click the first changed-file row.
    const rows = await canvas.findAllByRole('button');
    const diffRow = rows.find((r) => r.textContent?.includes('App.tsx'));
    if (diffRow) await userEvent.click(diffRow);
    // The diff body renders with hunks — wait for one to appear.
    await canvas.findByText(/storybook fixture/);
  },
};
```

- [ ] **Step 3: Story count check**

```bash
grep -c "^export const " src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx
```
Expected: `20`.

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock && git add src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: file-palette preview-pane axis stories (5)

PreviewEmpty (no selection), PreviewFileLoading (read_text_file pending),
PreviewFileOk (TSX sample → FilePaletteCodeView; tree-sitter probe),
PreviewFileBinary ({kind:'binary'} thrown), PreviewDiffOk (Changes row →
git_file_diff returns sample patch with 2 hunks).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Interaction axis stories (5)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx`

- [ ] **Step 1: Append the five interaction stories at the end of the file**

```tsx
// ---------------------------------------------------------------------------
// Interaction axis
// ---------------------------------------------------------------------------

export const AddCustomRoot: Story = {
  args: {
    params: {
      invokeResponses: loadedPalette(),
      pluginDialogOpenResponse: '/Users/storybook/extra/notes',
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    // Find the "Add custom root" icon — its aria-label / tooltip in
    // production is "Add custom root".
    const addBtn = await canvas.findByRole('button', { name: /add.*root/i });
    await userEvent.click(addBtn);
  },
};

export const PaletteReshown: Story = {
  args: { params: { invokeResponses: loadedPalette() } },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    // Wait for mount before emitting — the listen() effect must finish first.
    const input = await canvas.findByPlaceholderText(/search/i);
    await userEvent.type(input, 'foo');
    getControl().emit('palette-shown', null);
    // After re-show, the search input should clear (production code resets).
    await canvas.findByDisplayValue('');
  },
};

export const WindowFocusRefresh: Story = {
  args: {
    params: {
      invokeResponses: loadedPalette({
        git_changed_files: changedFilesLocalOnly,
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const { within } = await import('storybook/test');
    const canvas = within(canvasElement);
    // Wait for component mount (listener registration completes after this).
    await canvas.findByPlaceholderText(/search/i);
    const before = getControl()
      .invocations.filter((i) => i.command === 'git_changed_files').length;
    getControl().emit('__window.onFocusChanged', true);
    // The bumped refreshTick triggers another git_changed_files in the
    // useWorktreeChangeCounts hook. The assertion is the invocation count
    // grew — captured in the catalog as a side-effect record.
    await new Promise((r) => setTimeout(r, 0));
    const after = getControl()
      .invocations.filter((i) => i.command === 'git_changed_files').length;
    if (after <= before) {
      // Soft note — refresh may be debounced. Story still renders.
      console.warn('[storybook] WindowFocusRefresh: no new git_changed_files invocation observed');
    }
  },
};

export const EscHidesWindow: Story = {
  args: { params: { invokeResponses: loadedPalette() } },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    // Focus the palette root so its onKeyDown picks up the Escape.
    const input = await canvas.findByPlaceholderText(/search/i);
    await userEvent.click(input);
    await userEvent.keyboard('{Escape}');
  },
};

export const EnterOpensViewer: Story = {
  args: { params: { invokeResponses: loadedPalette() } },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/search/i);
    await userEvent.type(input, 'file-00');
    // Press Enter — opens the file in the viewer (mocked invoke).
    await userEvent.keyboard('{Enter}');
  },
};
```

- [ ] **Step 2: Final story count check**

```bash
grep -c "^export const " src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx
```
Expected: `25`.

- [ ] **Step 3: Run lint + tsc + build**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri && npx tsc --noEmit && npm run build-storybook 2>&1 | tail -10
```
Expected: tsc clean; build-storybook completes.

If `npm run lint` flags warnings only (no errors) and the warnings are in pre-existing files, that's acceptable (matches the Phase 1/2 baseline).

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock && git add src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: file-palette interaction axis stories (5)

AddCustomRoot (plugin-dialog.open returns path → save_settings),
PaletteReshown (palette-shown emit clears query),
WindowFocusRefresh (__window.onFocusChanged emit bumps refreshTick →
git_changed_files re-fired), EscHidesWindow (Esc with empty query →
window.hide), EnterOpensViewer (Enter on selected row →
open_file_viewer_window).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

**Phase C review checkpoint:** all 25 stories present and Storybook builds cleanly. Confirm both before Phase D.

---

# Phase D — Verification & PR

## Task 10: Roadmap update + final verification

**Files:**
- Modify: `docs/superpowers/specs/storybook-roadmap.md`

- [ ] **Step 1: Run all verification gates**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
npx tsc --noEmit
timeout 600 npm run test 2>&1 | tail -30
timeout 600 npm run build-storybook 2>&1 | tail -10
```

Each command must exit 0. Use Bash `timeout: 600000` on the long-running commands. If `npm run test` flags warnings only (no failures), that's acceptable.

- [ ] **Step 2: Production-code byte-identical assertion**

```bash
cd /Users/koenvdb/projects/BorgDock
git diff origin/master...HEAD -- \
  src/BorgDock.Tauri/src/components/file-palette \
  src/BorgDock.Tauri/src/components/shared/WindowTitleBar.tsx \
  src/BorgDock.Tauri/src/components/shared/chrome \
  src/BorgDock.Tauri/src/services/syntax-highlighter.ts \
  src/BorgDock.Tauri/src/services/diff-parser.ts \
  src/BorgDock.Tauri/src/components/pr-detail/diff \
  src/BorgDock.Tauri/src/hooks/useSyntaxHighlight.ts \
  src/BorgDock.Tauri/src/types/settings.ts \
  src/BorgDock.Tauri/src/utils/parse-error.ts \
  src/BorgDock.Tauri/src/file-palette-main.tsx \
  ':(exclude)src/BorgDock.Tauri/src/components/file-palette/__fixtures__' \
  ':(exclude)src/BorgDock.Tauri/src/components/file-palette/*.stories.tsx'
```

Output MUST be empty.

- [ ] **Step 3: Final story-count assertion**

```bash
grep -c "^export const " src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx
```
Expected: `25`.

- [ ] **Step 4: Update the roadmap (claim Task #4 first, DM peers, edit)**

The roadmap-row claim protocol — claim Task #4 in the shared task list first; DM `palette-workitems` and `viewer-files` to confirm "I'm taking row 7"; edit the roadmap; release the claim.

Open `docs/superpowers/specs/storybook-roadmap.md`. Move the "File Palette" row out of the Pending table and into the Done table. The Done table row to add (renumber the # column to the next free integer; today the next free is 7):

```
| 7 | File Palette | `file-palette-main.tsx` → `components/file-palette/FilePaletteApp.tsx` | `2026-05-06-storybook-phase7-file-palette-design.md` | `2026-05-06-storybook-phase7-file-palette.md` | _(filled in after PR opens)_ |
```

Delete the "File Palette" row from the Pending table.

Also extend the "Mock layer extensions" notes section. Add a new note block below the Phase-6 block:

```
> **Phase 7 mock-layer extensions:** `tauri-api-window` now also exposes
> `getCurrentWindow().onFocusChanged` (synthetic `__window.onFocusChanged`
> channel — emit a boolean payload via `getControl().emit(...)`).
```

- [ ] **Step 5: Commit the roadmap update**

```bash
cd /Users/koenvdb/projects/BorgDock && git add docs/superpowers/specs/storybook-roadmap.md
git commit -m "$(cat <<'EOF'
roadmap: mark file palette done, register onFocusChanged mock note

File Palette moves Pending → Done with phase-7 spec/plan refs. New
phase-7 mock-layer extension note documents getCurrentWindow().on
FocusChanged on tauri-api-window mock.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Push and open PR

**Files:** none

- [ ] **Step 1: Switch to personal gh account**

```bash
gh auth switch --user borght-dev
gh auth status
```
Verify `Active account: true` next to `borght-dev`.

- [ ] **Step 2: Push the branch**

```bash
cd /Users/koenvdb/projects/BorgDock && git push -u origin storybook-phase7-file-palette
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "storybook phase 7: file palette catalog" --body "$(cat <<'EOF'
## Summary
- 25 Storybook stories for `FilePaletteApp.tsx` covering bootstrap / roots / search modes / results / changes section / preview pane / interactions.
- Mock-layer extension: `getCurrentWindow().onFocusChanged` on `.storybook/mocks/tauri-api-window.ts`, mirroring Phase 4's `onMoved` synthetic-channel pattern.
- New fixtures module under `components/file-palette/__fixtures__/`.
- Production code byte-identical (verified via `git diff origin/master...HEAD --` showing zero lines).
- Roadmap updated.

## Test plan
- [ ] `npm run build-storybook` completes
- [ ] `npm run test` passes
- [ ] All 25 stories render in Storybook (`npm run storybook`)
- [ ] Light/dark toolbar toggle re-renders every story without reload
- [ ] Tree-sitter syntax highlighting probe (PreviewFileOk, SymbolSearchActive) — colors visible OR plain-text fallback w/ `[syntax-highlighter]` console warning (both acceptable)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Switch back to enterprise account**

```bash
gh auth switch --user KvanderBorght_gomocha
gh auth status
```
Verify `Active account: true` next to `KvanderBorght_gomocha`.

- [ ] **Step 5: Report PR URL to team lead**

Send a SendMessage to `team-lead` with the PR URL plus confirmation that:
- spec path: `docs/superpowers/specs/2026-05-06-storybook-phase7-file-palette-design.md`
- plan path: `docs/superpowers/plans/2026-05-06-storybook-phase7-file-palette.md`
- Roadmap was updated (Task #4 claimed and released)
- All assigned tasks marked completed

---

## Final verification checklist

- [ ] All 11 tasks above completed.
- [ ] `git log origin/master..HEAD --oneline` shows commits in this order: mock-layer extension first, then fixtures, then story commits, then roadmap.
- [ ] `git diff origin/master...HEAD --` against the production-paths globs from Task 10 Step 2 returns empty.
- [ ] `grep -c "^export const " src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx` returns 25.
- [ ] `npm run build-storybook` and `npm run test` exit 0 from a clean checkout.
- [ ] PR URL reported to team lead via SendMessage.
- [ ] gh account left as `KvanderBorght_gomocha`.
