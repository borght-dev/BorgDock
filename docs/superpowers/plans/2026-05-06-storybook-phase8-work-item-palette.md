# Storybook Phase 8 — Work Item Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 24 Storybook stories for `WorkItemPaletteApp.tsx` (Azure DevOps work-item palette window) and extend the existing Tauri mock layer with `getCurrentWindow().startDragging()`, a `WebviewWindow` class export, and scenario-driven impls for the four palette-relevant `services-ado-workitems` functions — all without changing a byte of production code.

**Architecture:** Extend four existing files under `.storybook/mocks/` (`control.ts`, `tauri-api-window.ts`, `tauri-api-webviewWindow.ts`, `services-ado-workitems.ts`). No new mock files. No new alias entries in `.storybook/main.ts`. The control singleton (`window.__borgdock_storybook_tauri`) gains two Phase-8 fields (`workItemPaletteScenario`, `webviewWindowsCreated`). Stories drive state via `parameters.workItemPalette.*` consumed by a `WorkItemPaletteHarness` wrapper.

**Tech Stack:** Storybook 9 + `@storybook/react-vite`, Vite 6, React 19, Tailwind v4, TypeScript 5.8 (already installed).

**Spec:** `docs/superpowers/specs/2026-05-06-storybook-phase8-work-item-palette-design.md`
**Roadmap:** `docs/superpowers/specs/storybook-roadmap.md`

**All paths in this plan are relative to `src/BorgDock.Tauri/` unless explicitly absolute.**

**Phase organization:**
- **Phase A — Mock layer (Tasks 1–4):** extend control / window / webviewWindow / workitems. Self-contained.
- **Phase B — Fixtures (Task 5):** all WorkItem fixtures + scenario presets + canonicalSettings helper.
- **Phase C — Stories (Tasks 6–12):** scaffold + per-axis story groups (browse / sections / search-state / search-content / search-failure / interaction / lifecycle).
- **Phase D — Verification & PR (Tasks 13–14):** byte-identical assertion, roadmap update, PR.

---

## Task 0: Verify worktree environment

**Files:** none

- [ ] **Step 1: Check branch + tree**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette
git status && git rev-parse --abbrev-ref HEAD
```
Expected: `storybook-phase8-work-item-palette`, clean tree.

- [ ] **Step 2: Verify branch HEAD = origin/master**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette
git rev-parse HEAD && git rev-parse origin/master
```
Expected: identical SHAs.

- [ ] **Step 3: Verify npm install ran**

```bash
ls /Users/koenvdb/projects/borgdock-storybook-work-item-palette/src/BorgDock.Tauri/node_modules/.bin/storybook
```
Expected: file exists.

---

# Phase A — Mock layer

## Task 1: Extend control surface for Phase 8

**Files:**
- Modify: `src/BorgDock.Tauri/.storybook/mocks/control.ts`

- [ ] **Step 1: Add the Phase-8 interfaces and fields**

Open the file. Below the existing `PluginFsControl` interface (around the existing `// Phase 6 — plugin-fs in-memory filesystem.` block), append:

```ts
// Phase 8 — work-item palette scenario shape
export interface WorkItemPaletteScenario {
  workItems: import('../../src/types/work-item').WorkItem[];
  assignedToMe: import('../../src/types/work-item').WorkItem[];
  searchPool: import('../../src/types/work-item').WorkItem[];
  browseBehavior: 'normal' | 'pending' | 'reject';
  assignedToMeBehavior: 'normal' | 'pending' | 'reject';
  searchBehavior: 'normal' | 'pending' | 'reject';
}

// Phase 8 — record of WebviewWindow constructions during a story.
export interface WebviewWindowRecord {
  label: string;
  options: Record<string, unknown>;
}
```

In `StorybookTauriControl`, after the existing `pluginFs` field, add:

```ts
  // Phase 8 fields
  workItemPaletteScenario: WorkItemPaletteScenario;
  webviewWindowsCreated: WebviewWindowRecord[];
```

Add a default-factory helper alongside `defaultScenario`:

```ts
function defaultPaletteScenario(): WorkItemPaletteScenario {
  return {
    workItems: [],
    assignedToMe: [],
    searchPool: [],
    browseBehavior: 'normal',
    assignedToMeBehavior: 'normal',
    searchBehavior: 'normal',
  };
}
```

In `createControl()`, initialize the new fields alongside the existing Phase-6 ones:

```ts
    workItemScenario: defaultScenario(),
    pluginDialog: {},
    pluginFs: { writes: new Map(), reads: new Map(), failNextWrite: false },
    workItemPaletteScenario: defaultPaletteScenario(),
    webviewWindowsCreated: [],
```

Inside `reset()`, after the existing Phase-6 resets, add:

```ts
      ctrl.workItemPaletteScenario = defaultPaletteScenario();
      ctrl.webviewWindowsCreated.length = 0;
```

- [ ] **Step 2: Verify tsc clean**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette/src/BorgDock.Tauri && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette && git add src/BorgDock.Tauri/.storybook/mocks/control.ts
git commit -m "$(cat <<'EOF'
storybook: extend control surface for phase 8 (work-item palette)

Adds workItemPaletteScenario (browse / assignedToMe / searchPool with
per-call behaviors) and webviewWindowsCreated (records every
new WebviewWindow(...) construction during a story). reset() wipes both.
Foundation for the Work Item Palette catalog and any future window that
opens a child WebviewWindow.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `startDragging()` to `tauri-api-window` mock

**Files:**
- Modify: `src/BorgDock.Tauri/.storybook/mocks/tauri-api-window.ts`

- [ ] **Step 1: Add `startDragging` to the `MockWindow` interface and impl**

In `MockWindow` (after `getTitle`), add the new method signature:

```ts
  startDragging(): Promise<void>;
```

In `getCurrentWindow()`'s return object (after the existing `getTitle` impl), add:

```ts
    async startDragging() {
      ctrl.invocations.push({ command: 'window.startDragging' });
    },
```

Update the file's leading comment block to mention Phase 8 in the surfaces list:

Replace the existing comment line:
```
//   - getCurrentWindow().setTitle/getTitle                               (Phase 6)
```
with:
```
//   - getCurrentWindow().setTitle/getTitle                               (Phase 6)
//   - getCurrentWindow().startDragging                                   (Phase 8)
```

- [ ] **Step 2: Verify tsc clean**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette/src/BorgDock.Tauri && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette && git add src/BorgDock.Tauri/.storybook/mocks/tauri-api-window.ts
git commit -m "$(cat <<'EOF'
storybook: add startDragging to window mock (phase 8 prep)

WorkItemPaletteApp's drag handle calls getCurrentWindow().startDragging()
on mousedown. The mock records the invocation; the iframe is unaffected
(Storybook controls visible bounds). No-op surface available for future
palette-shaped windows.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `WebviewWindow` class to `tauri-api-webviewWindow` mock

**Files:**
- Modify: `src/BorgDock.Tauri/.storybook/mocks/tauri-api-webviewWindow.ts`

- [ ] **Step 1: Replace the file**

Full new content of `.storybook/mocks/tauri-api-webviewWindow.ts`:

```ts
// .storybook/mocks/tauri-api-webviewWindow.ts
//
// Drop-in replacement for @tauri-apps/api/webviewWindow. Covers:
//   - getCurrentWebviewWindow()    (Phase 5 — Agent Overview titlebar)
//   - WebviewWindow class          (Phase 8 — palette opens child windows)
//
// close() is a no-op — without it, clicking the title-bar X would
// unmount the Storybook iframe. Constructing a WebviewWindow records
// the construction on getControl().webviewWindowsCreated so stories can
// assert "the user just opened a detail window".

import { getControl } from './control';

interface MockWebviewWindow {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
}

export function getCurrentWebviewWindow(): MockWebviewWindow {
  const ctrl = getControl();
  return {
    async minimize() {
      ctrl.invocations.push({ command: 'webviewWindow.minimize' });
    },
    async toggleMaximize() {
      ctrl.invocations.push({ command: 'webviewWindow.toggleMaximize' });
    },
    async close() {
      ctrl.invocations.push({ command: 'webviewWindow.close' });
    },
  };
}

// Loose-typed options bag — the real plugin's option type has many keys
// and not every consumer passes the same shape. We forward whatever was
// passed.
export interface WebviewWindowOptions {
  url?: string;
  title?: string;
  width?: number;
  height?: number;
  center?: boolean;
  decorations?: boolean;
  resizable?: boolean;
  focus?: boolean;
  skipTaskbar?: boolean;
  visible?: boolean;
  [key: string]: unknown;
}

export class WebviewWindow {
  readonly label: string;
  readonly options: WebviewWindowOptions;

  constructor(label: string, options?: WebviewWindowOptions) {
    this.label = label;
    this.options = options ?? {};
    const ctrl = getControl();
    ctrl.webviewWindowsCreated.push({
      label,
      options: { ...this.options },
    });
    ctrl.invocations.push({
      command: 'webviewWindow.new',
      args: { label, options: { ...this.options } },
    });
  }

  async close() {
    getControl().invocations.push({ command: 'webviewWindow.close', args: { label: this.label } });
  }
  async hide() {
    getControl().invocations.push({ command: 'webviewWindow.hide', args: { label: this.label } });
  }
  async show() {
    getControl().invocations.push({ command: 'webviewWindow.show', args: { label: this.label } });
  }
  async setFocus() {
    getControl().invocations.push({ command: 'webviewWindow.setFocus', args: { label: this.label } });
  }
}
```

- [ ] **Step 2: Verify tsc clean**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette/src/BorgDock.Tauri && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette && git add src/BorgDock.Tauri/.storybook/mocks/tauri-api-webviewWindow.ts
git commit -m "$(cat <<'EOF'
storybook: add WebviewWindow class to webviewWindow mock (phase 8 prep)

WorkItemPaletteApp's selectAndClose dynamically imports
@tauri-apps/api/webviewWindow and constructs new WebviewWindow(label, opts)
to open a detail window. The mock records every construction on
getControl().webviewWindowsCreated so stories can assert opener flow.
Instance close/hide/show/setFocus are no-ops that record invocations.
Available for Settings / Pr Detail / Main when those phases land.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Implement palette-shaped functions in `services-ado-workitems` mock

**Files:**
- Modify: `src/BorgDock.Tauri/.storybook/mocks/services-ado-workitems.ts`

- [ ] **Step 1: Replace the four palette-relevant stub-throws with real impls**

Open the file. Replace the entire block that begins with the comment `// --- Symbols re-exported as stubs so stories that accidentally import` (and ends just before `// Pure helper — safe to re-export from the real module (no Tauri deps).`) with the new scenario-driven impls below.

Locate this existing block (around the bottom half of the file):

```ts
// --- Symbols re-exported as stubs so stories that accidentally import
// them via this alias fail loudly instead of silently calling the real
// HTTP-backed module. Add real mock impls if a future story needs them.

export async function getWorkItems(): Promise<WorkItem[]> {
  return [];
}
export async function createWorkItem(): Promise<WorkItem> {
  throw new Error('storybook: createWorkItem not mocked');
}
export async function downloadAttachment(): Promise<Blob> {
  throw new Error('storybook: downloadAttachment not mocked');
}
export async function getCurrentUserDisplayName(): Promise<string | null> {
  return null;
}
export async function searchWorkItemsByIdPrefix(): Promise<WorkItem[]> {
  return [];
}
export async function searchWorkItemsByText(): Promise<WorkItem[]> {
  return [];
}
export async function getAssignedToMe(): Promise<WorkItem[]> {
  return [];
}
```

Replace it with:

```ts
// --- Phase 8 — Work Item Palette consumers.
// The four palette-relevant functions read from
// getControl().workItemPaletteScenario instead of the HTTP-backed module.
// Every call records on invocations so stories can assert search shape
// (numeric prefix vs free text), browse fan-out, etc.

export async function getWorkItems(_client: unknown, ids: number[]): Promise<WorkItem[]> {
  const ctrl = getControl();
  const s = ctrl.workItemPaletteScenario;
  ctrl.invocations.push({ command: 'workitems.getWorkItems', args: { ids } });
  if (s.browseBehavior === 'pending') return new Promise(() => {});
  if (s.browseBehavior === 'reject') throw new Error('storybook: getWorkItems failed');
  const byId = new Map(s.workItems.map((w) => [w.id, w] as const));
  return ids.map((id) => byId.get(id)).filter((w): w is WorkItem => Boolean(w));
}

export async function getAssignedToMe(_client: unknown): Promise<WorkItem[]> {
  const ctrl = getControl();
  const s = ctrl.workItemPaletteScenario;
  ctrl.invocations.push({ command: 'workitems.getAssignedToMe' });
  if (s.assignedToMeBehavior === 'pending') return new Promise(() => {});
  if (s.assignedToMeBehavior === 'reject') throw new Error('storybook: getAssignedToMe failed');
  return s.assignedToMe;
}

export async function searchWorkItemsByIdPrefix(
  _client: unknown,
  prefix: string,
): Promise<WorkItem[]> {
  const ctrl = getControl();
  const s = ctrl.workItemPaletteScenario;
  ctrl.invocations.push({ command: 'workitems.searchWorkItemsByIdPrefix', args: { prefix } });
  if (s.searchBehavior === 'pending') return new Promise(() => {});
  if (s.searchBehavior === 'reject') throw new Error('storybook: search failed');
  return s.searchPool.filter((w) => String(w.id).startsWith(prefix));
}

export async function searchWorkItemsByText(
  _client: unknown,
  text: string,
): Promise<WorkItem[]> {
  const ctrl = getControl();
  const s = ctrl.workItemPaletteScenario;
  ctrl.invocations.push({ command: 'workitems.searchWorkItemsByText', args: { text } });
  if (s.searchBehavior === 'pending') return new Promise(() => {});
  if (s.searchBehavior === 'reject') throw new Error('storybook: search failed');
  const lower = text.toLowerCase();
  return s.searchPool.filter((w) => {
    const titleField = w.fields['System.Title'];
    const title = typeof titleField === 'string' ? titleField : '';
    const assignedField = w.fields['System.AssignedTo'];
    const assigned =
      typeof assignedField === 'string'
        ? assignedField
        : (assignedField as { displayName?: string } | undefined)?.displayName ?? '';
    return title.toLowerCase().includes(lower) || assigned.toLowerCase().includes(lower);
  });
}

// --- Stubs preserved for future windows. Stories that accidentally hit
// these fail loudly so the gap is obvious.

export async function createWorkItem(): Promise<WorkItem> {
  throw new Error('storybook: createWorkItem not mocked');
}
export async function downloadAttachment(): Promise<Blob> {
  throw new Error('storybook: downloadAttachment not mocked');
}
export async function getCurrentUserDisplayName(): Promise<string | null> {
  return null;
}
```

- [ ] **Step 2: Verify tsc clean**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette/src/BorgDock.Tauri && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Verify Phase 6 detail stories don't depend on the changed functions**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette/src/BorgDock.Tauri && \
  grep -n "getWorkItems\|getAssignedToMe\|searchWorkItemsByIdPrefix\|searchWorkItemsByText" \
  src/components/work-items/__fixtures__/work-item-data.ts \
  src/components/work-items/WorkItemDetailApp.stories.tsx 2>/dev/null
```
Expected: no matches (confirming no Phase 6 regression).

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette && git add src/BorgDock.Tauri/.storybook/mocks/services-ado-workitems.ts
git commit -m "$(cat <<'EOF'
storybook: replace workitems palette stubs with scenario-driven impls

Phase 6 left getWorkItems / getAssignedToMe / searchWorkItemsByIdPrefix /
searchWorkItemsByText as stub-throws (returning [] or throwing) so the
next consumer would replace them. The Work Item Palette is that
consumer. The four functions now read from
control.workItemPaletteScenario:

- getWorkItems(client, ids) — filters scenario.workItems by id.
- getAssignedToMe(client) — returns scenario.assignedToMe.
- searchWorkItemsByIdPrefix(client, prefix) — filters scenario.searchPool
  by String(id).startsWith(prefix).
- searchWorkItemsByText(client, text) — filters scenario.searchPool by
  Title/AssignedTo substring (case-insensitive).

Each call records on invocations and respects browseBehavior /
assignedToMeBehavior / searchBehavior ('normal' / 'pending' / 'reject').
createWorkItem / downloadAttachment / getCurrentUserDisplayName remain
stubs — future windows will replace them.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# Phase B — Fixtures

## Task 5: Author the fixture file

**Files:**
- Create: `src/BorgDock.Tauri/src/components/work-item-palette/__fixtures__/work-item-palette-data.ts`

- [ ] **Step 1: Write the fixture file**

```ts
// src/components/work-item-palette/__fixtures__/work-item-palette-data.ts
//
// Storybook-only fixtures for WorkItemPaletteApp. Production code never
// imports this file — verified by greping production paths in the plan's
// final verification step.

import type { AppSettings } from '@/types/settings';
import type { WorkItem } from '@/types/work-item';

export function canonicalSettings(overrides?: Partial<AppSettings>): AppSettings {
  const base: AppSettings = {
    pollIntervalMs: 30000,
    repos: [],
    showAvatars: true,
    notificationsEnabled: false,
    minimizeToTray: false,
    autoStartOnLogin: false,
    badgeAlwaysVisible: false,
    badgeAutoHideMs: null,
    pinnedRepos: [],
    excludedAuthors: [],
    grouping: 'repository',
    sortBy: 'updatedAt',
    sortDirection: 'desc',
    filters: {
      author: 'all',
      mergeability: 'all',
      reviewState: 'all',
      checkState: 'all',
      label: 'all',
      draft: 'all',
    },
    columnWidth: 360,
    rememberWindowState: true,
    enabledExtensions: [],
    disabledExtensions: [],
    extensionSettings: {},
    azureDevOps: {
      organization: 'storybook-org',
      project: 'storybook-project',
      personalAccessToken: 'storybook-pat',
      authMethod: 'pat',
      authAutoDetected: true,
      recentWorkItemIds: [],
      workingOnWorkItemIds: [],
    },
    ui: {
      theme: 'system',
      density: 'comfortable',
    },
    sql: {
      connections: [],
      activeConnectionId: null,
    },
    agentOverview: {
      enabled: false,
    },
  } as unknown as AppSettings;
  return {
    ...base,
    ...(overrides ?? {}),
    azureDevOps: { ...base.azureDevOps, ...(overrides?.azureDevOps ?? {}) },
    ui: { ...base.ui, ...(overrides?.ui ?? {}) },
  } as AppSettings;
}

export function makePaletteWorkItem(overrides: Partial<WorkItem> & { id: number }): WorkItem {
  const base: WorkItem = {
    id: overrides.id,
    rev: 1,
    fields: {
      'System.Title': `Item #${overrides.id}`,
      'System.State': 'Active',
      'System.WorkItemType': 'User Story',
      'System.AssignedTo': { displayName: 'Pat Maintainer', uniqueName: 'pat@example.com' },
    },
    url: `https://dev.azure.com/storybook-org/_apis/wit/workItems/${overrides.id}`,
    htmlUrl: `https://dev.azure.com/storybook-org/_workitems/edit/${overrides.id}`,
    relations: [],
  };
  return {
    ...base,
    ...overrides,
    fields: { ...base.fields, ...(overrides.fields ?? {}) },
  };
}

// --- Curated browse pool: spans multiple states / types / assignees.

export const browsePoolMixed: WorkItem[] = [
  makePaletteWorkItem({
    id: 101,
    fields: {
      'System.Title': 'Wire OAuth refresh token rotation',
      'System.State': 'Active',
      'System.WorkItemType': 'User Story',
      'System.AssignedTo': { displayName: 'Pat Maintainer', uniqueName: 'pat@example.com' },
    },
  }),
  makePaletteWorkItem({
    id: 102,
    fields: {
      'System.Title': 'Investigate intermittent CI flake on macOS',
      'System.State': 'New',
      'System.WorkItemType': 'Bug',
      'System.AssignedTo': { displayName: 'Alex Reviewer', uniqueName: 'alex@example.com' },
    },
  }),
  makePaletteWorkItem({
    id: 103,
    fields: {
      'System.Title': 'Document Storybook mock layer aliases',
      'System.State': 'Closed',
      'System.WorkItemType': 'Task',
      'System.AssignedTo': { displayName: 'Pat Maintainer', uniqueName: 'pat@example.com' },
    },
  }),
  makePaletteWorkItem({
    id: 200,
    fields: {
      'System.Title': 'Migrate work item palette to React 19 transitions',
      'System.State': 'Active',
      'System.WorkItemType': 'User Story',
      'System.AssignedTo': { displayName: 'Sam Engineer', uniqueName: 'sam@example.com' },
    },
  }),
  makePaletteWorkItem({
    id: 201,
    fields: {
      'System.Title': 'Auth-method auto-detect for ADO',
      'System.State': 'Resolved',
      'System.WorkItemType': 'User Story',
      'System.AssignedTo': { displayName: 'Pat Maintainer', uniqueName: 'pat@example.com' },
    },
  }),
];

export const assignedToMePool: WorkItem[] = [
  makePaletteWorkItem({
    id: 301,
    fields: {
      'System.Title': 'Auth-flow regression triage',
      'System.State': 'Active',
      'System.WorkItemType': 'Bug',
      'System.AssignedTo': { displayName: 'You', uniqueName: 'you@example.com' },
    },
  }),
  makePaletteWorkItem({
    id: 302,
    fields: {
      'System.Title': 'Wire WorkItemPalette stories',
      'System.State': 'Active',
      'System.WorkItemType': 'Task',
      'System.AssignedTo': { displayName: 'You', uniqueName: 'you@example.com' },
    },
  }),
  makePaletteWorkItem({
    id: 303,
    fields: {
      'System.Title': 'Sync ADO PAT scopes with org policy',
      'System.State': 'New',
      'System.WorkItemType': 'User Story',
      'System.AssignedTo': { displayName: 'You', uniqueName: 'you@example.com' },
    },
  }),
];

export const recentIds: number[] = [103, 201, 200];
export const workingOnIds: number[] = [101, 200];

// --- Curated search pool: diverse IDs / titles / assignees.

export const searchPoolMixed: WorkItem[] = [
  makePaletteWorkItem({
    id: 12,
    fields: {
      'System.Title': 'Login form auth validation',
      'System.State': 'Active',
      'System.WorkItemType': 'User Story',
      'System.AssignedTo': { displayName: 'Alex Reviewer', uniqueName: 'alex@example.com' },
    },
  }),
  makePaletteWorkItem({
    id: 120,
    fields: {
      'System.Title': 'Auth header refresh on 401',
      'System.State': 'Active',
      'System.WorkItemType': 'Bug',
      'System.AssignedTo': { displayName: 'Pat Maintainer', uniqueName: 'pat@example.com' },
    },
  }),
  makePaletteWorkItem({
    id: 124,
    fields: {
      'System.Title': 'Improve auth-error toast copy',
      'System.State': 'New',
      'System.WorkItemType': 'Task',
      'System.AssignedTo': { displayName: 'Sam Engineer', uniqueName: 'sam@example.com' },
    },
  }),
  makePaletteWorkItem({
    id: 50,
    fields: {
      'System.Title': 'Onboarding wizard polish',
      'System.State': 'Active',
      'System.WorkItemType': 'User Story',
      'System.AssignedTo': { displayName: 'Alex Reviewer', uniqueName: 'alex@example.com' },
    },
  }),
  makePaletteWorkItem({
    id: 51,
    fields: {
      'System.Title': 'Self-test diagnostics overhaul',
      'System.State': 'New',
      'System.WorkItemType': 'Task',
      'System.AssignedTo': { displayName: 'Pat Maintainer', uniqueName: 'pat@example.com' },
    },
  }),
];

// --- Scenario presets

import type { WorkItemPaletteScenario } from '../../../.storybook/mocks/control';

export function emptyBrowseScenario(): WorkItemPaletteScenario {
  return {
    workItems: [],
    assignedToMe: [],
    searchPool: [],
    browseBehavior: 'normal',
    assignedToMeBehavior: 'normal',
    searchBehavior: 'normal',
  };
}

export function fullBrowseScenario(): WorkItemPaletteScenario {
  return {
    workItems: browsePoolMixed,
    assignedToMe: assignedToMePool,
    searchPool: searchPoolMixed,
    browseBehavior: 'normal',
    assignedToMeBehavior: 'normal',
    searchBehavior: 'normal',
  };
}

export function loadingBrowseScenario(): WorkItemPaletteScenario {
  return {
    ...fullBrowseScenario(),
    browseBehavior: 'pending',
    assignedToMeBehavior: 'pending',
  };
}

export function searchPendingScenario(): WorkItemPaletteScenario {
  return {
    ...fullBrowseScenario(),
    searchBehavior: 'pending',
  };
}

export function searchRejectScenario(): WorkItemPaletteScenario {
  return {
    ...fullBrowseScenario(),
    searchBehavior: 'reject',
  };
}
```

- [ ] **Step 2: Verify tsc clean**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette/src/BorgDock.Tauri && npx tsc --noEmit
```
Expected: no errors. If `AppSettings` shape rejects any field, adjust the cast — the harness only relies on `azureDevOps.*` and `ui.theme`.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette && git add src/BorgDock.Tauri/src/components/work-item-palette/__fixtures__/work-item-palette-data.ts
git commit -m "$(cat <<'EOF'
storybook: add work-item-palette fixtures + scenario presets

Adds canonicalSettings (full AppSettings with ADO + theme defaults),
makePaletteWorkItem (synthetic WorkItem builder), curated browsePoolMixed
+ assignedToMePool + searchPoolMixed, and scenario presets used by the
upcoming WorkItemPaletteApp.stories.tsx.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# Phase C — Stories

## Task 6: Scaffold `WorkItemPaletteApp.stories.tsx`

**Files:**
- Create: `src/BorgDock.Tauri/src/components/work-item-palette/WorkItemPaletteApp.stories.tsx`

- [ ] **Step 1: Write the scaffold + 4 browse-state stories**

```tsx
// src/components/work-item-palette/WorkItemPaletteApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { fireEvent, screen, userEvent, waitFor, within } from '@storybook/test';
import { useEffect, useMemo } from 'react';
import { WorkItemPaletteApp } from './WorkItemPaletteApp';
import { getControl } from '../../../.storybook/mocks/control';
import type { WorkItemPaletteScenario } from '../../../.storybook/mocks/control';
import {
  canonicalSettings,
  emptyBrowseScenario,
  fullBrowseScenario,
  loadingBrowseScenario,
  searchPendingScenario,
  searchRejectScenario,
  searchPoolMixed,
  recentIds,
  workingOnIds,
} from './__fixtures__/work-item-palette-data';

interface PaletteParams {
  scenario: WorkItemPaletteScenario;
  recentWorkItemIds?: number[];
  workingOnWorkItemIds?: number[];
  organization?: string;
  theme?: 'light' | 'dark' | 'system';
}

function WorkItemPaletteHarness({ params }: { params: PaletteParams }) {
  // Apply scenario / settings BEFORE first render so the hook's mount
  // effect sees the canned load_settings response.
  useMemo(() => {
    const ctrl = getControl();
    ctrl.reset();
    localStorage.removeItem('borgdock-palette-position');
    ctrl.workItemPaletteScenario = params.scenario;
    ctrl.invokeResponses['load_settings'] = canonicalSettings({
      ui: { theme: params.theme ?? 'system' },
      azureDevOps: {
        organization: params.organization ?? 'storybook-org',
        project: 'storybook-project',
        personalAccessToken: 'storybook-pat',
        authMethod: 'pat',
        authAutoDetected: true,
        recentWorkItemIds: params.recentWorkItemIds ?? [],
        workingOnWorkItemIds: params.workingOnWorkItemIds ?? [],
      },
    } as never);
    ctrl.invokeResponses['save_settings'] = undefined;
    ctrl.invokeResponses['window_ready'] = undefined;
  }, [params]);

  useEffect(() => {
    return () => {
      // No-op: the global preview decorator handles reset on next mount.
    };
  }, []);

  return (
    <div style={{ width: 480, height: 600, position: 'relative' }}>
      <WorkItemPaletteApp />
    </div>
  );
}

const meta: Meta<typeof WorkItemPaletteHarness> = {
  title: 'Windows/WorkItemPaletteApp',
  component: WorkItemPaletteHarness,
};

export default meta;
type Story = StoryObj<typeof WorkItemPaletteHarness>;

function story(params: PaletteParams, extra?: Partial<Story>): Story {
  return {
    args: { params },
    ...extra,
  };
}

// --- Browse-state axis (4)

export const EmptyBrowse: Story = story({
  scenario: emptyBrowseScenario(),
});

export const LoadingBrowse: Story = story({
  scenario: loadingBrowseScenario(),
  recentWorkItemIds: recentIds,
  workingOnWorkItemIds: workingOnIds,
});

export const BrowseFullSections: Story = story({
  scenario: fullBrowseScenario(),
  recentWorkItemIds: recentIds,
  workingOnWorkItemIds: workingOnIds,
});

export const BrowsePartialSections: Story = story({
  scenario: {
    ...fullBrowseScenario(),
  },
  recentWorkItemIds: recentIds,
  workingOnWorkItemIds: [], // no Working On section
});
```

- [ ] **Step 2: Verify Storybook compiles + 4 stories visible**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette/src/BorgDock.Tauri && npx tsc --noEmit
```

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette/src/BorgDock.Tauri && grep -c "^export const " src/components/work-item-palette/WorkItemPaletteApp.stories.tsx
```
Expected: `4`.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette && git add src/BorgDock.Tauri/src/components/work-item-palette/WorkItemPaletteApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: workitem-palette scaffold + browse-state axis stories (4)

Adds the WorkItemPaletteHarness wrapper, story() helper, and the four
browse-state stories: EmptyBrowse, LoadingBrowse, BrowseFullSections,
BrowsePartialSections.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Section-shape axis (4 stories)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/work-item-palette/WorkItemPaletteApp.stories.tsx`

- [ ] **Step 1: Append the four section-shape stories at the end of the file**

```tsx
// --- Section-shape axis (4)

export const OnlyWorkingOn: Story = story({
  scenario: fullBrowseScenario(),
  workingOnWorkItemIds: [101], // matches browsePoolMixed[0]
  recentWorkItemIds: [],
});

export const OnlyAssignedToMe: Story = story({
  scenario: fullBrowseScenario(),
  workingOnWorkItemIds: [],
  recentWorkItemIds: [],
});

export const OnlyRecent: Story = story({
  scenario: {
    ...fullBrowseScenario(),
    assignedToMe: [], // suppress assigned-to-me so only Recent renders
  },
  workingOnWorkItemIds: [],
  recentWorkItemIds: [103, 201, 200],
});

export const DedupAcrossSections: Story = story({
  // 200 is in both workingOn AND recentIds; it should only appear under Working On
  scenario: fullBrowseScenario(),
  workingOnWorkItemIds: [101, 200],
  recentWorkItemIds: [103, 201, 200],
});
```

- [ ] **Step 2: Verify story count**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette/src/BorgDock.Tauri && grep -c "^export const " src/components/work-item-palette/WorkItemPaletteApp.stories.tsx
```
Expected: `8`.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette && git add src/BorgDock.Tauri/src/components/work-item-palette/WorkItemPaletteApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: workitem-palette section-shape axis stories (4)

OnlyWorkingOn / OnlyAssignedToMe / OnlyRecent verify each browse section
renders standalone. DedupAcrossSections verifies the cross-section dedup
branch in the browseSections memo (id 200 appears in both Working On and
Recent; it should only render under Working On).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Search-state axis (5 stories)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/work-item-palette/WorkItemPaletteApp.stories.tsx`

- [ ] **Step 1: Append the five search-state stories**

```tsx
// --- Search-state axis (5)

export const SearchTypeTooShortText: Story = story(
  { scenario: fullBrowseScenario() },
  {
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const input = await canvas.findByPlaceholderText('Search by ID, title, or assigned to...');
      await userEvent.type(input, 'a');
      await waitFor(() => {
        const text = canvasElement.textContent ?? '';
        if (!text.includes('Type at least 2 characters')) {
          throw new Error('expected too-short-text status');
        }
      });
    },
  },
);

export const SearchTypeTooShortNumeric: Story = story(
  { scenario: fullBrowseScenario() },
  {
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const input = await canvas.findByPlaceholderText('Search by ID, title, or assigned to...');
      await userEvent.type(input, '5');
      await waitFor(() => {
        const text = canvasElement.textContent ?? '';
        if (!text.includes('Type at least 2 digits')) {
          throw new Error('expected too-short-numeric status');
        }
      });
    },
  },
);

export const SearchInFlight: Story = story(
  { scenario: searchPendingScenario() },
  {
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const input = await canvas.findByPlaceholderText('Search by ID, title, or assigned to...');
      await userEvent.type(input, 'auth');
      await waitFor(
        () => {
          const text = canvasElement.textContent ?? '';
          if (!text.includes('Searching')) {
            throw new Error('expected Searching status');
          }
        },
        { timeout: 2000 },
      );
    },
  },
);

export const SearchNoResults: Story = story(
  {
    scenario: {
      ...fullBrowseScenario(),
      searchPool: [], // empty pool → no matches for any query
    },
  },
  {
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const input = await canvas.findByPlaceholderText('Search by ID, title, or assigned to...');
      await userEvent.type(input, 'missing');
      await waitFor(
        () => {
          const text = canvasElement.textContent ?? '';
          if (!text.includes('No results')) {
            throw new Error('expected No results status');
          }
        },
        { timeout: 2000 },
      );
    },
  },
);

export const SearchOneResult: Story = story(
  {
    scenario: {
      ...fullBrowseScenario(),
      searchPool: [searchPoolMixed[0]!], // exactly one match for 'login'
    },
  },
  {
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const input = await canvas.findByPlaceholderText('Search by ID, title, or assigned to...');
      await userEvent.type(input, 'login');
      await waitFor(
        () => {
          const text = canvasElement.textContent ?? '';
          if (!text.includes('1 result')) {
            throw new Error('expected 1 result status');
          }
        },
        { timeout: 2000 },
      );
    },
  },
);
```

- [ ] **Step 2: Verify story count**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette/src/BorgDock.Tauri && grep -c "^export const " src/components/work-item-palette/WorkItemPaletteApp.stories.tsx
```
Expected: `13`.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette && git add src/BorgDock.Tauri/src/components/work-item-palette/WorkItemPaletteApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: workitem-palette search-state axis stories (5)

SearchTypeTooShortText / Numeric verify the type-at-least-N branch.
SearchInFlight uses searchPendingScenario to assert the spinner +
"Searching..." status. SearchNoResults / SearchOneResult cover the
0-result and 1-result paths.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Search-content axis (3 stories)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/work-item-palette/WorkItemPaletteApp.stories.tsx`

- [ ] **Step 1: Append the three search-content stories**

```tsx
// --- Search-content axis (3)

export const SearchByIdPrefix: Story = story(
  { scenario: fullBrowseScenario() },
  {
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const input = await canvas.findByPlaceholderText('Search by ID, title, or assigned to...');
      await userEvent.type(input, '12');
      await waitFor(
        () => {
          const text = canvasElement.textContent ?? '';
          // searchPoolMixed has ids 12, 120, 124 starting with "12"
          if (!text.includes('3 results')) {
            throw new Error(`expected 3 results, saw: ${text.slice(0, 200)}`);
          }
        },
        { timeout: 2000 },
      );
    },
  },
);

export const SearchByTextTitle: Story = story(
  { scenario: fullBrowseScenario() },
  {
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const input = await canvas.findByPlaceholderText('Search by ID, title, or assigned to...');
      await userEvent.type(input, 'auth');
      await waitFor(
        () => {
          const text = canvasElement.textContent ?? '';
          // 3 items in searchPoolMixed have "auth" in their title
          if (!text.includes('3 results')) {
            throw new Error(`expected 3 results, saw: ${text.slice(0, 200)}`);
          }
        },
        { timeout: 2000 },
      );
    },
  },
);

export const SearchByTextAssignee: Story = story(
  { scenario: fullBrowseScenario() },
  {
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const input = await canvas.findByPlaceholderText('Search by ID, title, or assigned to...');
      await userEvent.type(input, 'alex');
      await waitFor(
        () => {
          const text = canvasElement.textContent ?? '';
          // 2 items in searchPoolMixed are assigned to "Alex Reviewer"
          if (!text.includes('2 results')) {
            throw new Error(`expected 2 results, saw: ${text.slice(0, 200)}`);
          }
        },
        { timeout: 2000 },
      );
    },
  },
);
```

- [ ] **Step 2: Verify story count**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette/src/BorgDock.Tauri && grep -c "^export const " src/components/work-item-palette/WorkItemPaletteApp.stories.tsx
```
Expected: `16`.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette && git add src/BorgDock.Tauri/src/components/work-item-palette/WorkItemPaletteApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: workitem-palette search-content axis stories (3)

SearchByIdPrefix verifies the numeric branch (ids 12/120/124 share a
"12" prefix). SearchByTextTitle / SearchByTextAssignee verify the text
branch's case-insensitive substring match against Title and AssignedTo.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Search-failure axis (2 stories)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/work-item-palette/WorkItemPaletteApp.stories.tsx`

- [ ] **Step 1: Append the two search-failure stories**

```tsx
// --- Search-failure axis (2)

export const SearchFailed: Story = story(
  { scenario: searchRejectScenario() },
  {
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const input = await canvas.findByPlaceholderText('Search by ID, title, or assigned to...');
      await userEvent.type(input, 'work');
      await waitFor(
        () => {
          const text = canvasElement.textContent ?? '';
          if (!text.includes('Search failed')) {
            throw new Error(`expected Search failed, saw: ${text.slice(0, 200)}`);
          }
        },
        { timeout: 2000 },
      );
    },
  },
);

export const AdoNotConfigured: Story = story(
  {
    scenario: fullBrowseScenario(),
    organization: '', // empty org → AdoClient still constructs but server-side calls would 404; we only need the visible status path
  },
  {
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const input = await canvas.findByPlaceholderText('Search by ID, title, or assigned to...');
      await userEvent.type(input, 'work');
      // Empty organization doesn't trigger getClient() === null in production
      // (AdoClient constructs unconditionally). Best the story can assert is
      // that some non-error status appears within the debounce window.
      await waitFor(
        () => {
          const text = canvasElement.textContent ?? '';
          if (!text.match(/result|Search/)) {
            throw new Error(`expected post-debounce status, saw: ${text.slice(0, 200)}`);
          }
        },
        { timeout: 2000 },
      );
    },
  },
);
```

- [ ] **Step 2: Verify story count**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette/src/BorgDock.Tauri && grep -c "^export const " src/components/work-item-palette/WorkItemPaletteApp.stories.tsx
```
Expected: `18`.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette && git add src/BorgDock.Tauri/src/components/work-item-palette/WorkItemPaletteApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: workitem-palette search-failure axis stories (2)

SearchFailed uses searchRejectScenario to assert the "Search failed"
status. AdoNotConfigured covers the empty-org settings path.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Interaction axis (4 stories)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/work-item-palette/WorkItemPaletteApp.stories.tsx`

- [ ] **Step 1: Append the four interaction stories**

```tsx
// --- Interaction axis (4)

export const HoverHighlightsRow: Story = story(
  {
    scenario: fullBrowseScenario(),
    workingOnWorkItemIds: [101, 200],
    recentWorkItemIds: [103, 201, 200],
  },
  {
    play: async ({ canvasElement }) => {
      const rows = await waitFor(
        () => {
          const found = canvasElement.querySelectorAll('[data-palette-row]');
          if (found.length < 2) throw new Error('expected ≥2 rows');
          return found;
        },
        { timeout: 2000 },
      );
      await userEvent.hover(rows[1] as Element);
      await waitFor(() => {
        const cls = (rows[1] as HTMLElement).className;
        if (!cls.includes('accent-subtle')) {
          throw new Error('hover did not promote selection class');
        }
      });
    },
  },
);

export const EnterOpensDetailWindow: Story = story(
  {
    scenario: fullBrowseScenario(),
    workingOnWorkItemIds: [101],
    recentWorkItemIds: [],
  },
  {
    play: async ({ canvasElement }) => {
      const input = await within(canvasElement).findByPlaceholderText(
        'Search by ID, title, or assigned to...',
      );
      // Wait for browse data to land + initial selection.
      await waitFor(
        () => {
          if (canvasElement.querySelectorAll('[data-palette-row]').length === 0)
            throw new Error('rows not yet rendered');
        },
        { timeout: 2000 },
      );
      input.focus();
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      await waitFor(
        () => {
          const created = getControl().webviewWindowsCreated;
          if (created.length === 0) throw new Error('no detail window opened');
          if (!created.some((w) => w.label.startsWith('workitem-detail-'))) {
            throw new Error(`unexpected label: ${created[0]?.label}`);
          }
        },
        { timeout: 2000 },
      );
    },
  },
);

export const EscapeHidesPalette: Story = story(
  { scenario: emptyBrowseScenario() },
  {
    play: async ({ canvasElement }) => {
      // Wait for input to mount so the global keydown listener is wired.
      await within(canvasElement).findByPlaceholderText('Search by ID, title, or assigned to...');
      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(
        () => {
          const found = getControl().invocations.some((i) => i.command === 'window.hide');
          if (!found) throw new Error('window.hide not invoked');
        },
        { timeout: 2000 },
      );
    },
  },
);

export const DragHandleStartsDrag: Story = story(
  { scenario: emptyBrowseScenario() },
  {
    play: async ({ canvasElement }) => {
      await within(canvasElement).findByPlaceholderText('Search by ID, title, or assigned to...');
      const handle = canvasElement.querySelector('[data-tauri-drag-region]') as HTMLElement;
      if (!handle) throw new Error('drag handle not found');
      fireEvent.mouseDown(handle, { button: 0 });
      await waitFor(
        () => {
          const found = getControl().invocations.some((i) => i.command === 'window.startDragging');
          if (!found) throw new Error('window.startDragging not invoked');
        },
        { timeout: 2000 },
      );
    },
  },
);
```

- [ ] **Step 2: Verify story count**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette/src/BorgDock.Tauri && grep -c "^export const " src/components/work-item-palette/WorkItemPaletteApp.stories.tsx
```
Expected: `22`.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette && git add src/BorgDock.Tauri/src/components/work-item-palette/WorkItemPaletteApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: workitem-palette interaction axis stories (4)

HoverHighlightsRow asserts the accent-subtle class promotion. Enter
OpensDetailWindow exercises the full selectAndClose flow and asserts on
webviewWindowsCreated. EscapeHidesPalette asserts window.hide.
DragHandleStartsDrag asserts window.startDragging.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Lifecycle axis (2 stories)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/work-item-palette/WorkItemPaletteApp.stories.tsx`

- [ ] **Step 1: Append the two lifecycle stories**

```tsx
// --- Lifecycle axis (2)

export const WindowReadyOnMount: Story = story(
  { scenario: emptyBrowseScenario() },
  {
    play: async ({ canvasElement }) => {
      await within(canvasElement).findByPlaceholderText('Search by ID, title, or assigned to...');
      await waitFor(
        () => {
          const found = getControl().invocations.some((i) => i.command === 'window_ready');
          if (!found) throw new Error('window_ready was not invoked on mount');
        },
        { timeout: 2000 },
      );
    },
  },
);

export const PaletteShownEventResetsState: Story = story(
  { scenario: fullBrowseScenario() },
  {
    play: async ({ canvasElement }) => {
      const input = (await within(canvasElement).findByPlaceholderText(
        'Search by ID, title, or assigned to...',
      )) as HTMLInputElement;
      await userEvent.type(input, 'abc');
      await waitFor(() => {
        if (input.value !== 'abc') throw new Error('input did not accept text');
      });
      // Emit palette-shown to trigger the production reset effect.
      getControl().emit('palette-shown', undefined);
      await waitFor(
        () => {
          if (input.value !== '') throw new Error('input was not cleared');
        },
        { timeout: 2000 },
      );
    },
  },
);
```

- [ ] **Step 2: Verify final story count**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette/src/BorgDock.Tauri && grep -c "^export const " src/components/work-item-palette/WorkItemPaletteApp.stories.tsx
```
Expected: `24`.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette && git add src/BorgDock.Tauri/src/components/work-item-palette/WorkItemPaletteApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: workitem-palette lifecycle axis stories (2)

WindowReadyOnMount asserts window_ready invocation after mount.
PaletteShownEventResetsState verifies the listener that clears
searchText and selection when the Rust toggle re-shows the palette.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# Phase D — Verification & PR

## Task 13: Final verification

**Files:** none

- [ ] **Step 1: Run the full lint + tsc + build-storybook + vitest sweep**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette/src/BorgDock.Tauri
npx tsc --noEmit
```

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette/src/BorgDock.Tauri && npm run lint
```

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette/src/BorgDock.Tauri && npm run test
```
Each command must exit 0. Use `timeout: 600000` on the npm calls.

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette/src/BorgDock.Tauri && npm run build-storybook
```
Must exit 0. Use `timeout: 600000`.

- [ ] **Step 2: Production-code byte-identical assertion**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette
git diff origin/master...HEAD -- \
  src/BorgDock.Tauri/src/components/work-item-palette \
  src/BorgDock.Tauri/src/hooks/useWorkItemPaletteSearch.ts \
  src/BorgDock.Tauri/src/services/ado \
  src/BorgDock.Tauri/src/types \
  ':(exclude)src/BorgDock.Tauri/src/components/work-item-palette/__fixtures__' \
  ':(exclude)src/BorgDock.Tauri/src/components/work-item-palette/*.stories.tsx'
```
Output MUST be empty.

- [ ] **Step 3: Final story-count assertion**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-work-item-palette/src/BorgDock.Tauri/src/components/work-item-palette/WorkItemPaletteApp.stories.tsx
```
Expected: `24`.

- [ ] **Step 4: Update the roadmap**

Open `docs/superpowers/specs/storybook-roadmap.md`. Move the "Work Item Palette" row out of the Pending table and into the Done table (row 7 — the next available number after row 6 / WorkItemDetail). The Done table should have a new row appended:

```
| 7 | Work Item Palette | `work-item-palette-main.tsx` → `components/work-item-palette/WorkItemPaletteApp.tsx` | `2026-05-06-storybook-phase8-work-item-palette-design.md` | `2026-05-06-storybook-phase8-work-item-palette.md` | _(filled in after PR opens)_ |
```

Delete the "Work Item Palette" row from the Pending table.

- [ ] **Step 5: Commit the roadmap update**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette && git add docs/superpowers/specs/storybook-roadmap.md
git commit -m "$(cat <<'EOF'
roadmap: mark work-item-palette done (phase 8)

Phase 8 added scenario-driven impls for the four palette-relevant
services-ado-workitems functions, a WebviewWindow class export, and
window.startDragging — all extensions to existing mock files. No new
mock aliases.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Push and open PR

**Files:** none (pushes branch and opens PR)

- [ ] **Step 1: Switch to personal gh account**

```bash
gh auth switch --user borght-dev
gh auth status
```
Verify `Active account: true` next to `borght-dev`.

- [ ] **Step 2: Push the branch**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-work-item-palette && git push -u origin storybook-phase8-work-item-palette
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --base master --head storybook-phase8-work-item-palette \
  --title "storybook phase 8: work item palette catalog" \
  --body "$(cat <<'EOF'
## Summary
- Adds **24 Storybook stories** for `WorkItemPaletteApp.tsx` covering browse-state (4), section-shape (4), search-state (5), search-content (3), search-failure (2), interaction (4), and lifecycle (2).
- Extends the mock layer with **`getCurrentWindow().startDragging()`** and a **`WebviewWindow` class export** on `tauri-api-webviewWindow`. Both are additive on existing files (no new alias entries).
- Replaces the four palette-relevant `services-ado-workitems` stub-throws (`getWorkItems`, `getAssignedToMe`, `searchWorkItemsByIdPrefix`, `searchWorkItemsByText`) with scenario-driven impls reading from a new `workItemPaletteScenario` field on the control surface.
- Production code (`WorkItemPaletteApp.tsx`, `WorkItemPaletteRow.tsx`, `useWorkItemPaletteSearch.ts`, `services/ado`, `types`) is byte-identical to master.
- Updates the roadmap to mark Work Item Palette done.

Spec: `docs/superpowers/specs/2026-05-06-storybook-phase8-work-item-palette-design.md`
Plan: `docs/superpowers/plans/2026-05-06-storybook-phase8-work-item-palette.md`

## Test plan
- [ ] `npm run storybook` boots; all 24 stories load without console errors
- [ ] Theme toolbar (light/dark/system) toggles every story without reload
- [ ] Search / Enter / Escape / Drag play functions complete; the iframe survives
- [ ] `npm run build-storybook` completes
- [ ] `npm run test` (vitest) green on macOS + Windows
- [ ] `npm run lint` (Biome) clean
- [ ] Production tree byte-identical: `git diff origin/master...HEAD -- src/BorgDock.Tauri/src/components/work-item-palette src/BorgDock.Tauri/src/hooks/useWorkItemPaletteSearch.ts src/BorgDock.Tauri/src/services/ado src/BorgDock.Tauri/src/types ':(exclude)src/BorgDock.Tauri/src/components/work-item-palette/__fixtures__' ':(exclude)src/BorgDock.Tauri/src/components/work-item-palette/*.stories.tsx'` shows zero changes
EOF
)"
```

- [ ] **Step 4: Switch gh back to enterprise account**

```bash
gh auth switch --user KvanderBorght_gomocha
gh auth status
```
Verify `KvanderBorght_gomocha` is active again.

- [ ] **Step 5: Watch CI**

```bash
gh pr checks <PR-URL> --watch
```
Vitest must be green on macOS + Windows. Playwright is allowed to fail (precedent from earlier phases).

---

## Self-Review Notes

- **Spec coverage:**
  - Mock layer extensions (control fields, startDragging, WebviewWindow class, four scenario-driven workitems impls) — Tasks 1, 2, 3, 4.
  - Fixtures (canonicalSettings + makePaletteWorkItem + 5 browse + 3 assigned + 5 search items + 5 scenario presets) — Task 5.
  - 24 stories — Tasks 6 (4) + 7 (4) + 8 (5) + 9 (3) + 10 (2) + 11 (4) + 12 (2).
  - Roadmap update — Task 13 step 4–5.
  - PR creation — Task 14.
- **No prod code changes:** verified explicitly in Task 13 step 2.
- **Type consistency:** `WorkItem`, `AppSettings` types imported from production sources only; never redeclared. The new `WorkItemPaletteScenario` and `WebviewWindowRecord` interfaces live entirely on the control surface.
- **Bite-sized steps:** every task has 2–4 steps; every code-changing step shows the literal code; every commit step has the literal command.
- **Phase boundaries:**
  - Phase A (Tasks 1–4): mock layer fully wired; storybook still builds (still only renders prior phases' stories).
  - Phase B (Task 5): fixtures land; tsc still clean.
  - Phase C (Tasks 6–12): stories land in axis-by-axis groups; story count asserted at the end of each task.
  - Phase D (Tasks 13–14): verification + roadmap + PR.
- **Out of scope:** per-component stories, visual regression, hero shots, child-window mount coverage, ado_fetch interception — all deferred per spec.
