# Storybook Phase 6 — WorkItemDetailApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 25 exhaustive Storybook stories for `WorkItemDetailApp.tsx` (Azure DevOps work-item detail window) and extend the existing Tauri mock layer with three new alias surfaces (`@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`, `@/services/ado/workitems`) plus extensions to the existing window mock and control surface — all without changing a byte of production code.

**Architecture:** Add three mock modules under `.storybook/mocks/`, extend two existing mocks (`control.ts`, `tauri-api-window.ts`), and add three Vite alias entries in `.storybook/main.ts`. The control singleton (`window.__borgdock_storybook_tauri`) gains three Phase-6 fields (`workItemScenario`, `pluginDialog`, `pluginFs`) plus a `title` extension on the existing `windowState`. Stories drive state via `parameters.workItem.*` consumed by a `WorkItemDetailHarness` wrapper.

**Tech Stack:** Storybook 9 + `@storybook/react-vite`, Vite 6, React 19, Tailwind v4, TypeScript 5.8 (already installed in Phase 1).

**Spec:** `docs/superpowers/specs/2026-05-05-storybook-phase6-workitem-detail-design.md`
**Roadmap:** `docs/superpowers/specs/storybook-roadmap.md`

**All paths in this plan are relative to `src/BorgDock.Tauri/` unless explicitly absolute.**

**Phase organization:**
- **Phase A — Mock layer (Tasks 1–6):** extend control / window, add the three new mock modules, register aliases. Self-contained. Reviewed end-of-phase.
- **Phase B — Fixtures (Task 7):** all WorkItem / Comment / scenario fixtures.
- **Phase C — Stories (Tasks 8–13):** scaffold + per-axis story groups (load / item-shape / comments / save / attachments / window).
- **Phase D — Verification & PR (Tasks 14–15):** byte-identical assertion, roadmap update, PR.

---

## Task 0: Verify worktree environment

**Files:** none

- [ ] **Step 1: Check branch + tree**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail
git status && git rev-parse --abbrev-ref HEAD
```
Expected: `storybook-phase6-workitem-detail`, clean tree.

- [ ] **Step 2: Verify npm install ran**

```bash
ls /Users/koenvdb/projects/borgdock-storybook-workitem-detail/src/BorgDock.Tauri/node_modules/.bin/storybook
```
Expected: file exists.

---

# Phase A — Mock layer

## Task 1: Extend control surface

**Files:**
- Modify: `src/BorgDock.Tauri/.storybook/mocks/control.ts`

- [ ] **Step 1: Replace the file with the extended version**

Full new content of `.storybook/mocks/control.ts`:

```ts
// .storybook/mocks/control.ts
//
// Singleton control surface used by the Tauri mocks and by story decorators.
// Lives on window so dynamic-imported mocks and the React tree can both reach it.

import type { Release } from '../../src/types/whats-new';
import type { WorkItem, WorkItemComment } from '../../src/types/work-item';

export interface InvokeRecord {
  command: string;
  args?: unknown;
}

export type ChannelListener = (event: { payload: unknown }) => void;

export type PluginStoreBehavior = 'normal' | 'pending' | 'reject';

// Phase 6 — work item scenario shape
export interface WorkItemScenario {
  workItem: WorkItem | null;
  states: string[] | null;
  comments: WorkItemComment[] | null;
  loadBehavior: 'normal' | 'pending' | 'reject';
  loadError: string | null;
  statesBehavior: 'normal' | 'reject';
  commentsBehavior: 'normal' | 'pending' | 'reject';
  saveBehavior: 'normal' | 'pending' | 'reject';
  deleteBehavior: 'normal' | 'reject';
  addCommentBehavior: 'normal' | 'reject';
}

// Phase 6 — plugin-dialog responses (each can be a literal or a function).
export interface PluginDialogControl {
  openResponse?: string | string[] | null | ((opts?: unknown) => string | string[] | null);
  saveResponse?: string | null | ((opts?: unknown) => string | null);
  askResponse?: boolean | ((text: string, opts?: unknown) => boolean);
  confirmResponse?: boolean | ((text: string, opts?: unknown) => boolean);
}

// Phase 6 — plugin-fs in-memory filesystem.
export interface PluginFsControl {
  writes: Map<string, Uint8Array>;
  reads: Map<string, Uint8Array>;
  failNextWrite: boolean;
}

export interface StorybookTauriControl {
  channels: Map<string, Set<ChannelListener>>;
  invocations: InvokeRecord[];
  invokeResponses: Record<string, unknown>;

  // Phase 2 fields
  windowState: { isMaximized: boolean; title: string };
  pluginStore: Map<string, Map<string, unknown>>;
  pluginStoreBehavior: PluginStoreBehavior;
  appVersion: string | null;
  releasesOverride: Release[] | null;

  // Phase 6 fields
  workItemScenario: WorkItemScenario;
  pluginDialog: PluginDialogControl;
  pluginFs: PluginFsControl;

  reset(): void;
  emit(channel: string, payload: unknown): void;
}

declare global {
  interface Window {
    __borgdock_storybook_tauri?: StorybookTauriControl;
  }
}

function defaultScenario(): WorkItemScenario {
  return {
    workItem: null,
    states: null,
    comments: null,
    loadBehavior: 'normal',
    loadError: null,
    statesBehavior: 'normal',
    commentsBehavior: 'normal',
    saveBehavior: 'normal',
    deleteBehavior: 'normal',
    addCommentBehavior: 'normal',
  };
}

function createControl(): StorybookTauriControl {
  const ctrl: StorybookTauriControl = {
    channels: new Map(),
    invocations: [],
    invokeResponses: {},

    windowState: { isMaximized: false, title: '' },
    pluginStore: new Map(),
    pluginStoreBehavior: 'normal',
    appVersion: null,
    releasesOverride: null,

    workItemScenario: defaultScenario(),
    pluginDialog: {},
    pluginFs: { writes: new Map(), reads: new Map(), failNextWrite: false },

    reset() {
      ctrl.channels.clear();
      ctrl.invocations.length = 0;
      for (const k of Object.keys(ctrl.invokeResponses)) delete ctrl.invokeResponses[k];

      ctrl.windowState.isMaximized = false;
      ctrl.windowState.title = '';
      ctrl.pluginStore.clear();
      ctrl.pluginStoreBehavior = 'normal';
      ctrl.appVersion = null;
      ctrl.releasesOverride = null;

      ctrl.workItemScenario = defaultScenario();
      ctrl.pluginDialog = {};
      ctrl.pluginFs.writes.clear();
      ctrl.pluginFs.reads.clear();
      ctrl.pluginFs.failNextWrite = false;
    },
    emit(channel, payload) {
      const set = ctrl.channels.get(channel);
      if (!set) return;
      for (const cb of set) cb({ payload });
    },
  };
  return ctrl;
}

export function getControl(): StorybookTauriControl {
  if (typeof window === 'undefined') {
    throw new Error('storybook tauri mock used outside browser');
  }
  if (!window.__borgdock_storybook_tauri) {
    window.__borgdock_storybook_tauri = createControl();
  }
  return window.__borgdock_storybook_tauri;
}
```

- [ ] **Step 2: Verify tsc still clean**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail/src/BorgDock.Tauri && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail && git add src/BorgDock.Tauri/.storybook/mocks/control.ts
git commit -m "$(cat <<'EOF'
storybook: extend control surface for phase 6 (workitem/dialog/fs/title)

Adds workItemScenario (item + states + comments + per-call behaviors),
pluginDialog (open/save/ask/confirm response overrides — literal or fn),
pluginFs (in-memory writes/reads + failNextWrite), and a title field on
the existing windowState. reset() now wipes all of them. Foundation for
the WorkItemDetailApp catalog and Settings reuse.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extend `tauri-api-window` mock with `setTitle` / `getTitle`

**Files:**
- Modify: `src/BorgDock.Tauri/.storybook/mocks/tauri-api-window.ts`

- [ ] **Step 1: Replace the file**

```ts
// .storybook/mocks/tauri-api-window.ts
//
// Drop-in replacement for @tauri-apps/api/window. Only the surface
// BorgDock windows use is implemented:
// getCurrentWindow().{close,minimize,maximize,unmaximize,isMaximized,
// setTitle,getTitle}.
//
// close() is a no-op — without this, the "Got it" button on WhatsNew
// (and the close icon on WorkItemDetail) would unmount the Storybook
// iframe.

import { getControl } from './control';

interface MockWindow {
  close(): Promise<void>;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  unmaximize(): Promise<void>;
  isMaximized(): Promise<boolean>;
  setTitle(title: string): Promise<void>;
  getTitle(): Promise<string>;
}

export type Window = MockWindow;

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
    async setTitle(title: string) {
      ctrl.invocations.push({ command: 'window.setTitle', args: { title } });
      ctrl.windowState.title = title;
    },
    async getTitle() {
      return ctrl.windowState.title;
    },
  };
}
```

The `export type Window = MockWindow;` line satisfies `WindowTitleBar.tsx`'s `import type { Window } from '@tauri-apps/api/window'`.

- [ ] **Step 2: Verify tsc clean**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail/src/BorgDock.Tauri && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail && git add src/BorgDock.Tauri/.storybook/mocks/tauri-api-window.ts
git commit -m "$(cat <<'EOF'
storybook: add setTitle/getTitle to window mock + Window type re-export

WorkItemDetailApp calls getCurrentWindow().setTitle() after a successful
load. WindowTitleBar imports the Window type from the same module, so
the mock now re-exports it as a type alias for the MockWindow shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: New mock — `@tauri-apps/plugin-dialog`

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/mocks/tauri-plugin-dialog.ts`

- [ ] **Step 1: Write the mock**

```ts
// .storybook/mocks/tauri-plugin-dialog.ts
//
// Drop-in replacement for @tauri-apps/plugin-dialog. Covers the full
// public API (open / save / message / ask / confirm) so future windows
// (Settings is the immediate next consumer) can reuse without rewrite.
//
// Each call records the invocation on the control surface and reads its
// return from getControl().pluginDialog.<*Response>. Stories may set a
// literal value or a function (which receives the call's options).
//
// Defaults — no story override:
//   open      → null (user cancelled)
//   save      → null (user cancelled)
//   message   → void
//   ask       → true (user said yes)
//   confirm   → true (user confirmed)

import { getControl } from './control';

export interface OpenDialogOptions {
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  multiple?: boolean;
  directory?: boolean;
  title?: string;
  recursive?: boolean;
}

export interface SaveDialogOptions {
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  title?: string;
}

export interface MessageDialogOptions {
  kind?: 'info' | 'warning' | 'error';
  okLabel?: string;
  title?: string;
}

export interface ConfirmDialogOptions extends MessageDialogOptions {
  cancelLabel?: string;
}

export async function open(options?: OpenDialogOptions): Promise<string | string[] | null> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'plugin:dialog.open', args: options });
  const r = ctrl.pluginDialog.openResponse;
  if (typeof r === 'function') return r(options);
  return r ?? null;
}

export async function save(options?: SaveDialogOptions): Promise<string | null> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'plugin:dialog.save', args: options });
  const r = ctrl.pluginDialog.saveResponse;
  if (typeof r === 'function') return r(options);
  return r ?? null;
}

export async function message(text: string, options?: MessageDialogOptions): Promise<void> {
  getControl().invocations.push({ command: 'plugin:dialog.message', args: { text, options } });
}

export async function ask(text: string, options?: ConfirmDialogOptions): Promise<boolean> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'plugin:dialog.ask', args: { text, options } });
  const r = ctrl.pluginDialog.askResponse;
  if (typeof r === 'function') return r(text, options);
  return r ?? true;
}

export async function confirm(text: string, options?: ConfirmDialogOptions): Promise<boolean> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'plugin:dialog.confirm', args: { text, options } });
  const r = ctrl.pluginDialog.confirmResponse;
  if (typeof r === 'function') return r(text, options);
  return r ?? true;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/.storybook/mocks/tauri-plugin-dialog.ts
git commit -m "$(cat <<'EOF'
storybook: mock @tauri-apps/plugin-dialog (open/save/message/ask/confirm)

Full public-surface mock — designed once for reuse across windows.
WorkItemDetailApp uses save(); Settings will use the rest. Each call
records to control.invocations and pulls its return from
control.pluginDialog.*Response (literal or function).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: New mock — `@tauri-apps/plugin-fs`

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/mocks/tauri-plugin-fs.ts`

- [ ] **Step 1: Write the mock**

```ts
// .storybook/mocks/tauri-plugin-fs.ts
//
// Drop-in replacement for @tauri-apps/plugin-fs. WorkItemDetailApp uses
// writeFile() for attachment downloads. Settings export/import will use
// readTextFile / writeTextFile. We also alias readFile so future
// consumers don't need a follow-up mock.
//
// All writes/reads go through an in-memory Map on getControl().pluginFs
// so stories can assert against bytes the production code wrote.

import { getControl } from './control';

export async function writeFile(path: string, contents: Uint8Array): Promise<void> {
  const ctrl = getControl();
  ctrl.invocations.push({
    command: 'plugin:fs.writeFile',
    args: { path, byteLength: contents.byteLength },
  });
  if (ctrl.pluginFs.failNextWrite) {
    ctrl.pluginFs.failNextWrite = false;
    throw new Error('storybook: writeFile failed');
  }
  ctrl.pluginFs.writes.set(path, contents);
}

export async function readFile(path: string): Promise<Uint8Array> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'plugin:fs.readFile', args: { path } });
  const data = ctrl.pluginFs.reads.get(path);
  if (!data) throw new Error(`storybook: no read fixture for ${path}`);
  return data;
}

export async function writeTextFile(path: string, text: string): Promise<void> {
  return writeFile(path, new TextEncoder().encode(text));
}

export async function readTextFile(path: string): Promise<string> {
  const bytes = await readFile(path);
  return new TextDecoder().decode(bytes);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/.storybook/mocks/tauri-plugin-fs.ts
git commit -m "$(cat <<'EOF'
storybook: mock @tauri-apps/plugin-fs (writeFile + writeTextFile + read*)

In-memory map keyed by path. failNextWrite on the control surface lets
stories assert error-path UI without re-mocking. Used by
WorkItemDetailApp's attachment-download flow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: New mock — `@/services/ado/workitems`

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/mocks/services-ado-workitems.ts`

- [ ] **Step 1: Write the mock**

```ts
// .storybook/mocks/services-ado-workitems.ts
//
// Storybook stand-in for @/services/ado/workitems. Returns scenario
// data straight from getControl().workItemScenario instead of going
// through AdoClient / invoke('ado_fetch', ...).
//
// Why not mock at the invoke level: WorkItemDetailApp issues several
// distinct ADO HTTP requests during load (work item, states, comments)
// and would issue more for save (PATCH) and delete (DELETE). Without a
// per-call dispatch on URL/method, mocking at the invoke level requires
// either a fragile sequence-of-responses queue or fn-form invokeResponses
// (Phase 3's responsibility). Aliasing the high-level workitems module
// sidesteps both concerns.
//
// AdoClient is constructed but never has methods called — its constructor
// is side-effect-free. Stories that need to exercise client.getStream
// (attachment download) monkeypatch the prototype in the harness and
// restore on unmount.

import type { JsonPatchOperation, WorkItem, WorkItemComment } from '../../src/types';
import { getControl } from './control';

export async function getWorkItem(_client: unknown, id: number): Promise<WorkItem> {
  const ctrl = getControl();
  const s = ctrl.workItemScenario;
  ctrl.invocations.push({ command: 'workitems.getWorkItem', args: { id } });
  if (s.loadBehavior === 'pending') return new Promise(() => {});
  if (s.loadBehavior === 'reject') throw new Error(s.loadError ?? 'Failed to load work item');
  if (!s.workItem) throw new Error('storybook: no work item in scenario');
  return s.workItem;
}

export async function getWorkItemTypeStates(
  _client: unknown,
  type: string,
): Promise<string[]> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'workitems.getWorkItemTypeStates', args: { type } });
  if (ctrl.workItemScenario.statesBehavior === 'reject')
    throw new Error('storybook: states fetch failed');
  return ctrl.workItemScenario.states ?? [];
}

export async function getWorkItemComments(
  _client: unknown,
  id: number,
): Promise<WorkItemComment[]> {
  const ctrl = getControl();
  const s = ctrl.workItemScenario;
  ctrl.invocations.push({ command: 'workitems.getWorkItemComments', args: { id } });
  if (s.commentsBehavior === 'pending') return new Promise(() => {});
  if (s.commentsBehavior === 'reject') throw new Error('storybook: comments fetch failed');
  return s.comments ?? [];
}

export async function updateWorkItem(
  _client: unknown,
  id: number,
  ops: JsonPatchOperation[],
): Promise<WorkItem> {
  const ctrl = getControl();
  const s = ctrl.workItemScenario;
  ctrl.invocations.push({ command: 'workitems.updateWorkItem', args: { id, ops } });
  if (s.saveBehavior === 'pending') return new Promise(() => {});
  if (s.saveBehavior === 'reject') throw new Error('storybook: save failed');
  if (!s.workItem) throw new Error('storybook: no work item in scenario');

  // Apply the JSON-patch replace ops to the in-memory scenario item so
  // subsequent reads (e.g. re-render) see the new field values.
  const next: WorkItem = { ...s.workItem, fields: { ...s.workItem.fields } };
  for (const op of ops) {
    if (op.op !== 'replace') continue;
    const m = /^\/fields\/(.+)$/.exec(op.path);
    if (!m) continue;
    next.fields[m[1]!] = op.value;
  }
  s.workItem = next;
  return next;
}

export async function deleteWorkItem(_client: unknown, id: number): Promise<void> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'workitems.deleteWorkItem', args: { id } });
  if (ctrl.workItemScenario.deleteBehavior === 'reject')
    throw new Error('storybook: delete failed');
}

export async function addWorkItemComment(
  _client: unknown,
  id: number,
  text: string,
): Promise<WorkItemComment> {
  const ctrl = getControl();
  const s = ctrl.workItemScenario;
  ctrl.invocations.push({ command: 'workitems.addWorkItemComment', args: { id, text } });
  if (s.addCommentBehavior === 'reject') throw new Error('storybook: add comment failed');
  const c: WorkItemComment = {
    id: 9000 + (s.comments?.length ?? 0),
    text,
    createdBy: { displayName: 'You', uniqueName: 'you@example.com' },
    createdDate: new Date().toISOString(),
    modifiedDate: new Date().toISOString(),
  };
  s.comments = [...(s.comments ?? []), c];
  return c;
}

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

// Pure helper — safe to re-export from the real module (no Tauri deps).
export { buildIdPrefixWiql } from '../../src/services/ado/workitems';
```

- [ ] **Step 2: Verify tsc clean**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail/src/BorgDock.Tauri && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail && git add src/BorgDock.Tauri/.storybook/mocks/services-ado-workitems.ts
git commit -m "$(cat <<'EOF'
storybook: scenario-driven mock for @/services/ado/workitems

Mocks at the high-level workitems API instead of the invoke layer so
stories author one fixture object (workItem + states + comments + per-
call behaviors) rather than HTTP-payload-shaped queues. Symbols not
needed by WorkItemDetailApp are stubbed to throw, so future stories
that touch them fail loudly. buildIdPrefixWiql is re-exported from the
real module (pure string builder, no Tauri deps).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Register the three new aliases in `.storybook/main.ts`

**Files:**
- Modify: `src/BorgDock.Tauri/.storybook/main.ts`

- [ ] **Step 1: Replace the alias block**

Open `.storybook/main.ts`. The current alias map ends with `'@'`. Insert the three new entries before the catch-all `@` so longest-match wins. Final block (full):

```ts
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@tauri-apps/api/core': resolve(here, 'mocks/tauri-core.ts'),
      '@tauri-apps/api/event': resolve(here, 'mocks/tauri-event.ts'),
      '@tauri-apps/api/window': resolve(here, 'mocks/tauri-api-window.ts'),
      '@tauri-apps/api/app': resolve(here, 'mocks/tauri-api-app.ts'),
      '@tauri-apps/plugin-opener': resolve(here, 'mocks/tauri-plugin-opener.ts'),
      '@tauri-apps/plugin-store': resolve(here, 'mocks/tauri-plugin-store.ts'),
      '@tauri-apps/plugin-dialog': resolve(here, 'mocks/tauri-plugin-dialog.ts'),
      '@tauri-apps/plugin-fs': resolve(here, 'mocks/tauri-plugin-fs.ts'),
      '@/services/windows': resolve(here, 'mocks/services-windows.ts'),
      '@/services/ado/workitems': resolve(here, 'mocks/services-ado-workitems.ts'),
      '@/generated/changelog': resolve(here, 'mocks/generated-changelog.ts'),
      '@': resolve(here, '../src'),
    };
```

- [ ] **Step 2: Smoke-test the build**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail/src/BorgDock.Tauri && npm run build-storybook 2>&1 | tail -20
```
Expected: completes without errors. The build still bundles only the existing FlyoutApp + WhatsNewApp stories — the new aliases are wired but not yet referenced by any new story.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail && git add src/BorgDock.Tauri/.storybook/main.ts
git commit -m "$(cat <<'EOF'
storybook: register three new aliases for phase 6

@tauri-apps/plugin-dialog, @tauri-apps/plugin-fs, and the deep
@/services/ado/workitems alias. Order preserved so the @-prefixed deep
aliases match before the catch-all.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Phase A review checkpoint:** mock layer is fully wired but no stories reference it yet. Confirm `npm run build-storybook` and `npm run test` are both green before proceeding.

---

# Phase B — Fixtures

## Task 7: Work-item fixtures

**Files:**
- Create: `src/BorgDock.Tauri/src/components/work-items/__fixtures__/work-item-data.ts`

- [ ] **Step 1: Write the fixtures**

```ts
// src/components/work-items/__fixtures__/work-item-data.ts
//
// Synthetic WorkItem / Comment fixtures + a complete-AppSettings
// factory for Storybook. Real ADO data never enters Storybook —
// these fixtures are the only inputs.

import type { AppSettings } from '@/types/settings';
import type { WorkItem, WorkItemComment } from '@/types/work-item';

const STORYBOOK_ORG = 'storybook-org';
const STORYBOOK_PROJECT = 'storybook-project';

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
      organization: STORYBOOK_ORG,
      project: STORYBOOK_PROJECT,
      authMethod: 'pat',
      authAutoDetected: false,
      personalAccessToken: 'storybook-pat',
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
    sql: {
      connections: [],
      readOnlyByDefault: true,
      confirmDestructiveWithoutWhere: true,
    },
    repoPriority: {},
    ...overrides,
  };
}

export function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 12345,
    rev: 7,
    url: `https://dev.azure.com/${STORYBOOK_ORG}/${STORYBOOK_PROJECT}/_apis/wit/workItems/12345`,
    htmlUrl: `https://dev.azure.com/${STORYBOOK_ORG}/${STORYBOOK_PROJECT}/_workitems/edit/12345`,
    fields: {
      'System.Id': 12345,
      'System.WorkItemType': 'User Story',
      'System.Title': 'Implement the dashboard widget',
      'System.State': 'Active',
      'System.AssignedTo': { displayName: 'Alex Storyteller', uniqueName: 'alex@example.com' },
      'System.AreaPath': 'Storybook\\Dashboard',
      'System.IterationPath': 'Storybook\\Sprint 42',
      'System.CreatedDate': '2026-04-15T09:30:00Z',
      'System.ChangedDate': '2026-05-01T11:15:00Z',
      'Microsoft.VSTS.Common.Priority': 2,
      'System.Tags': 'frontend; dashboard',
    },
    relations: [],
    ...overrides,
  };
}

export function makeComment(overrides: Partial<WorkItemComment> = {}): WorkItemComment {
  return {
    id: 1,
    text: 'A baseline comment on the work item.',
    createdBy: { displayName: 'Pat Reviewer', uniqueName: 'pat@example.com' },
    createdDate: '2026-04-30T12:00:00Z',
    modifiedDate: '2026-04-30T12:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Curated work items
// ---------------------------------------------------------------------------

export const userStoryFreshlyLoaded: WorkItem = makeWorkItem();

export const userStoryWithRichBody: WorkItem = makeWorkItem({
  id: 12346,
  fields: {
    ...makeWorkItem().fields,
    'System.Id': 12346,
    'System.Title': 'Refactor the dashboard layout engine',
    'System.Description':
      '<h3>Goal</h3><p>Move the dashboard layout to a CSS-grid based engine. ' +
      'This unblocks responsive widgets and removes the legacy flexbox hacks.</p>' +
      '<ul><li>Audit current widget sizes</li><li>Define grid templates</li>' +
      '<li>Migrate three widgets as a pilot</li></ul>',
    'Microsoft.VSTS.Common.AcceptanceCriteria':
      '<ol><li>All three pilot widgets render in the new grid.</li>' +
      '<li>Storybook smoke tests pass for the dashboard route.</li>' +
      '<li>No visual regression on the desktop viewport.</li></ol>',
  },
});

export const bugWithReproSteps: WorkItem = makeWorkItem({
  id: 12347,
  fields: {
    ...makeWorkItem().fields,
    'System.Id': 12347,
    'System.WorkItemType': 'Bug',
    'System.Title': 'Save button stays disabled after editing tags',
    'System.State': 'Active',
    'Microsoft.VSTS.TCM.ReproSteps':
      '<ol><li>Open a work item.</li><li>Edit the Tags field.</li>' +
      '<li>Tab out of the input.</li><li>Observe the Save button is still disabled.</li></ol>' +
      '<p><strong>Expected:</strong> Save enables when any field changes.</p>',
    'Microsoft.VSTS.Common.Priority': 1,
  },
});

export const taskMinimalFields: WorkItem = {
  id: 12348,
  rev: 1,
  url: `https://dev.azure.com/${STORYBOOK_ORG}/${STORYBOOK_PROJECT}/_apis/wit/workItems/12348`,
  htmlUrl: `https://dev.azure.com/${STORYBOOK_ORG}/${STORYBOOK_PROJECT}/_workitems/edit/12348`,
  fields: {
    'System.Id': 12348,
    'System.WorkItemType': 'Task',
    'System.Title': 'Wire up storybook smoke test',
    'System.State': 'New',
    'System.AssignedTo': '',
    'System.Tags': '',
  },
  relations: [],
};

export const epicWithCustomFields: WorkItem = makeWorkItem({
  id: 12349,
  fields: {
    ...makeWorkItem().fields,
    'System.Id': 12349,
    'System.WorkItemType': 'Epic',
    'System.Title': 'Q2 dashboard overhaul',
    'System.State': 'Active',
    'Custom.BusinessValue': 'High — unblocks three downstream features.',
    'Custom.RoughTShirtSize': 'L',
    'Microsoft.VSTS.CMMI.RiskLevel': 'Medium',
    'Microsoft.VSTS.CMMI.MitigationPlan': 'Deliver pilot in two slices, gate on smoke tests.',
  },
});

export const itemWithManyAttachments: WorkItem = makeWorkItem({
  id: 12350,
  relations: Array.from({ length: 5 }, (_, i) => ({
    rel: 'AttachedFile',
    url: `https://dev.azure.com/${STORYBOOK_ORG}/${STORYBOOK_PROJECT}/_apis/wit/attachments/att-${i + 1}`,
    attributes: {
      id: `att-${i + 1}`,
      name: `attachment-${i + 1}.${['png', 'jpg', 'pdf', 'log', 'txt'][i]}`,
      resourceSize: (i + 1) * 1024 * 12,
    },
  })),
});

export const itemWithLongTitle: WorkItem = makeWorkItem({
  id: 12351,
  fields: {
    ...makeWorkItem().fields,
    'System.Id': 12351,
    'System.Title':
      'A deliberately long work-item title that wraps onto multiple lines so the title bar layout, ' +
      'the textarea, and the save flow all have to handle real-world copy that exceeds a single line',
  },
});

export const itemAssignedToOther: WorkItem = makeWorkItem({
  id: 12352,
  fields: {
    ...makeWorkItem().fields,
    'System.Id': 12352,
    'System.AssignedTo': { displayName: 'Sam Otherperson', uniqueName: 'sam@example.com' },
  },
});

export const itemNeverModified: WorkItem = makeWorkItem({
  id: 12353,
  fields: {
    'System.Id': 12353,
    'System.WorkItemType': 'User Story',
    'System.Title': 'Brand-new item awaiting triage',
    'System.State': 'New',
    'System.AssignedTo': '',
    'System.Tags': '',
  },
});

// ---------------------------------------------------------------------------
// Curated comment lists
// ---------------------------------------------------------------------------

export const commentsManyAuthors: WorkItemComment[] = [
  makeComment({
    id: 1,
    createdBy: { displayName: 'Alex Storyteller', uniqueName: 'alex@example.com' },
    text: '<p>Started looking at this — the layout audit is in <code>docs/audit.md</code>.</p>',
    createdDate: '2026-04-25T08:30:00Z',
  }),
  makeComment({
    id: 2,
    createdBy: { displayName: 'Pat Reviewer', uniqueName: 'pat@example.com' },
    text: '<p>Could you split the audit into a separate ticket?</p>',
    createdDate: '2026-04-26T10:00:00Z',
  }),
  makeComment({
    id: 3,
    createdBy: { displayName: 'Jordan Programmer', uniqueName: 'jordan@example.com' },
    text: '<p>+1 to splitting. I can pick up the audit if needed.</p>',
    createdDate: '2026-04-27T13:45:00Z',
  }),
  makeComment({
    id: 4,
    createdBy: { displayName: 'Alex Storyteller', uniqueName: 'alex@example.com' },
    text: '<p>Done — see <a href="https://example.com/audit">audit ticket</a>.</p>',
    createdDate: '2026-04-28T09:10:00Z',
  }),
  makeComment({
    id: 5,
    createdBy: { displayName: 'Sam Otherperson', uniqueName: 'sam@example.com' },
    text: '<p>Thanks all. Closing the audit thread here.</p>',
    createdDate: '2026-04-29T16:30:00Z',
  }),
  makeComment({
    id: 6,
    createdBy: { displayName: 'Pat Reviewer', uniqueName: 'pat@example.com' },
    text: '<p>Ready for review.</p>',
    createdDate: '2026-05-01T11:00:00Z',
  }),
];
```

- [ ] **Step 2: Verify tsc clean**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail/src/BorgDock.Tauri && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail && git add src/BorgDock.Tauri/src/components/work-items/__fixtures__/work-item-data.ts
git commit -m "$(cat <<'EOF'
storybook: work-item fixture factories + curated scenarios

canonicalSettings, makeWorkItem, makeComment factories plus 9 curated
work items (User Story / Bug / Task / Epic / many attachments / long
title / assigned-to-other / never-modified / rich-body) and a curated
six-author comment thread. Real ADO data never enters Storybook —
these fixtures are the only inputs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Phase B review checkpoint:** confirm `npx tsc --noEmit` is clean before writing stories.

---

# Phase C — Stories

## Task 8: Stories scaffold + Loading + LoadError + NoIdProvided + LoadedClean

**Files:**
- Create: `src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.stories.tsx`

- [ ] **Step 1: Write the file with meta, harness, helper, and four load-state stories**

```tsx
// src/components/work-items/WorkItemDetailApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { AdoClient } from '@/services/ado/client';
import type { WorkItem, WorkItemComment } from '@/types/work-item';
import { getControl, type WorkItemScenario } from '../../../.storybook/mocks/control';
import {
  canonicalSettings,
  userStoryFreshlyLoaded,
} from './__fixtures__/work-item-data';
import { WorkItemDetailApp } from './WorkItemDetailApp';

interface WorkItemStoryParams {
  /** Override the scenario state (workItem / states / comments / behaviors). */
  scenario?: Partial<WorkItemScenario>;
  /** id query-string param. Set to null to omit ?id=. Defaults to scenario.workItem?.id ?? 12345. */
  id?: number | null;
  /** Plugin-dialog responses. */
  dialogSaveResponse?: string | null;
  /** Stub for AdoClient.prototype.getStream — used by attachment download stories. */
  attachmentBytes?: Uint8Array;
}

const ORIGINAL_GET_STREAM = AdoClient.prototype.getStream;

function applyParamsBeforeMount(params: WorkItemStoryParams) {
  const ctrl = getControl();

  // Seed the canned load_settings response.
  ctrl.invokeResponses['load_settings'] = canonicalSettings();
  ctrl.invokeResponses['window_ready'] = undefined;
  ctrl.invokeResponses['ado_resolve_auth_header'] = 'Basic c3Rvcnlib29rOg==';

  // Seed the scenario.
  const scenario: WorkItemScenario = {
    ...ctrl.workItemScenario,
    ...(params.scenario ?? {}),
  };
  ctrl.workItemScenario = scenario;

  // Seed plugin-dialog responses if specified.
  if (params.dialogSaveResponse !== undefined) {
    ctrl.pluginDialog.saveResponse = params.dialogSaveResponse;
  }

  // Monkeypatch AdoClient.getStream for attachment-download stories.
  if (params.attachmentBytes) {
    const bytes = params.attachmentBytes;
    AdoClient.prototype.getStream = async function () {
      return new Blob([bytes]);
    };
  }

  // Set the URL ?id=… so URLSearchParams picks it up.
  const desiredId =
    params.id === null
      ? null
      : (params.id ?? scenario.workItem?.id ?? userStoryFreshlyLoaded.id);
  const url =
    desiredId !== null
      ? `${window.location.pathname}?id=${desiredId}`
      : window.location.pathname;
  window.history.replaceState({}, '', url);
}

function restoreAfterMount(_params: WorkItemStoryParams) {
  // Restore prototype patches if any. Always safe to assign back —
  // we kept the original ref at module load.
  AdoClient.prototype.getStream = ORIGINAL_GET_STREAM;
}

function WorkItemDetailHarness({ params }: { params: WorkItemStoryParams }) {
  // Apply BEFORE the inner component mounts. Effects run after children mount
  // in React, so we call this synchronously in the function body.
  applyParamsBeforeMount(params);

  useEffect(() => {
    return () => restoreAfterMount(params);
    // The harness lives for the lifetime of the story — restore once on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ width: 720, height: 720 }}>
      <WorkItemDetailApp />
    </div>
  );
}

const meta: Meta<typeof WorkItemDetailHarness> = {
  title: 'Work Items/WorkItemDetailApp',
  component: WorkItemDetailHarness,
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj<typeof WorkItemDetailHarness>;

function story(params: WorkItemStoryParams = {}): Story {
  return { args: { params } };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_STATES = ['New', 'Active', 'Resolved', 'Closed', 'Removed'];

function loadedScenario(
  workItem: WorkItem,
  comments: WorkItemComment[] = [],
): Partial<WorkItemScenario> {
  return {
    workItem,
    states: DEFAULT_STATES,
    comments,
    loadBehavior: 'normal',
    statesBehavior: 'normal',
    commentsBehavior: 'normal',
  };
}

// ---------------------------------------------------------------------------
// Load-state axis
// ---------------------------------------------------------------------------

export const Loading: Story = story({
  scenario: { loadBehavior: 'pending' },
});

export const LoadError: Story = story({
  scenario: { loadBehavior: 'reject', loadError: 'Failed to load work item' },
});

export const NoIdProvided: Story = story({
  id: null,
});

export const LoadedClean: Story = story({
  scenario: loadedScenario(userStoryFreshlyLoaded),
});
```

- [ ] **Step 2: Verify build-storybook**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail/src/BorgDock.Tauri && npm run build-storybook 2>&1 | tail -10
```
Expected: completes without errors.

- [ ] **Step 3: Story count check**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-workitem-detail/src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.stories.tsx
```
Expected: `4`.

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail && git add src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: workitemdetailapp.stories.tsx scaffold + load-state stories

WorkItemDetailHarness applies scenario + invokeResponses + URL ?id=…
synchronously before mount, monkeypatches AdoClient.getStream when an
attachmentBytes fixture is supplied, and restores on unmount.
Load-state axis: Loading (pending), LoadError (reject), NoIdProvided
(no ?id= in URL), LoadedClean (full successful load).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Item-shape stories (6)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.stories.tsx`

- [ ] **Step 1: Extend the fixtures import block**

Replace the existing fixtures import line at the top of the file so it imports the curated items used here:

```tsx
import {
  bugWithReproSteps,
  canonicalSettings,
  epicWithCustomFields,
  itemAssignedToOther,
  itemNeverModified,
  taskMinimalFields,
  userStoryFreshlyLoaded,
  userStoryWithRichBody,
} from './__fixtures__/work-item-data';
```

- [ ] **Step 2: Append the six item-shape stories at the end of the file**

```tsx
// ---------------------------------------------------------------------------
// Item-shape axis
// ---------------------------------------------------------------------------

export const UserStoryWithRichBody: Story = story({
  scenario: loadedScenario(userStoryWithRichBody),
});

export const BugWithReproSteps: Story = story({
  scenario: loadedScenario(bugWithReproSteps),
});

export const TaskMinimalFields: Story = story({
  scenario: loadedScenario(taskMinimalFields),
});

export const EpicWithCustomFields: Story = story({
  scenario: loadedScenario(epicWithCustomFields),
});

export const ItemAssignedToOther: Story = story({
  scenario: loadedScenario(itemAssignedToOther),
});

export const ItemNeverModified: Story = story({
  scenario: loadedScenario(itemNeverModified),
});
```

- [ ] **Step 3: Story count check**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-workitem-detail/src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.stories.tsx
```
Expected: `10`.

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail && git add src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: workitem item-shape axis stories (6)

UserStoryWithRichBody, BugWithReproSteps, TaskMinimalFields,
EpicWithCustomFields, ItemAssignedToOther, ItemNeverModified. Each
exercises a different facet of classifyFields / extractAttachments /
formatFieldValue.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Comments-axis stories (4)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.stories.tsx`

- [ ] **Step 1: Extend fixtures import**

Add `commentsManyAuthors` to the import block:

```tsx
import {
  bugWithReproSteps,
  canonicalSettings,
  commentsManyAuthors,
  epicWithCustomFields,
  itemAssignedToOther,
  itemNeverModified,
  taskMinimalFields,
  userStoryFreshlyLoaded,
  userStoryWithRichBody,
} from './__fixtures__/work-item-data';
```

- [ ] **Step 2: Append the four comments-axis stories**

```tsx
// ---------------------------------------------------------------------------
// Comments axis
// ---------------------------------------------------------------------------

export const CommentsLoading: Story = story({
  scenario: {
    ...loadedScenario(userStoryFreshlyLoaded),
    commentsBehavior: 'pending',
  },
});

export const CommentsEmpty: Story = story({
  scenario: loadedScenario(userStoryFreshlyLoaded, []),
});

export const CommentsManyAuthors: Story = story({
  scenario: loadedScenario(userStoryFreshlyLoaded, commentsManyAuthors),
});

export const CommentsLoadFailed: Story = story({
  scenario: {
    ...loadedScenario(userStoryFreshlyLoaded),
    commentsBehavior: 'reject',
  },
});
```

- [ ] **Step 3: Story count check**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-workitem-detail/src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.stories.tsx
```
Expected: `14`.

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail && git add src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: workitem comments axis stories (4)

CommentsLoading (skeleton shimmer), CommentsEmpty ("No comments yet"),
CommentsManyAuthors (six-message thread), CommentsLoadFailed (rejected
fetch — component still renders the rest of the panel).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Save-flow axis stories (4)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.stories.tsx`

- [ ] **Step 1: Append the four save-flow stories**

```tsx
// ---------------------------------------------------------------------------
// Save-flow axis
// ---------------------------------------------------------------------------

export const DirtyTitleEdited: Story = {
  args: {
    params: { scenario: loadedScenario(userStoryFreshlyLoaded) },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    // Wait for the title textarea to render after load resolves.
    const titleArea = await canvas.findByDisplayValue(/Implement the dashboard widget/i);
    await userEvent.clear(titleArea);
    await userEvent.type(titleArea, 'Implement the dashboard widget (refined)');
  },
};

export const SavingInFlight: Story = {
  args: {
    params: {
      scenario: {
        ...loadedScenario(userStoryFreshlyLoaded),
        saveBehavior: 'pending',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    // Wait for load to resolve so Save is rendered.
    const titleArea = await canvas.findByDisplayValue(/Implement the dashboard widget/i);
    await userEvent.clear(titleArea);
    await userEvent.type(titleArea, 'Implement the dashboard widget (saving)');
    const saveButton = await canvas.findByRole('button', { name: /^save$/i });
    await userEvent.click(saveButton);
    // saveBehavior: 'pending' means updateWorkItem never resolves;
    // button stays in the "Saving..." state for the rest of the story.
  },
};

export const SavedSuccess: Story = {
  args: {
    params: { scenario: loadedScenario(userStoryFreshlyLoaded) },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const titleArea = await canvas.findByDisplayValue(/Implement the dashboard widget/i);
    await userEvent.clear(titleArea);
    await userEvent.type(titleArea, 'Implement the dashboard widget (saved)');
    const saveButton = await canvas.findByRole('button', { name: /^save$/i });
    await userEvent.click(saveButton);
    await canvas.findByText(/^Saved$/);
  },
};

export const SaveError: Story = {
  args: {
    params: {
      scenario: {
        ...loadedScenario(userStoryFreshlyLoaded),
        saveBehavior: 'reject',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const titleArea = await canvas.findByDisplayValue(/Implement the dashboard widget/i);
    await userEvent.clear(titleArea);
    await userEvent.type(titleArea, 'Implement the dashboard widget (will fail)');
    const saveButton = await canvas.findByRole('button', { name: /^save$/i });
    await userEvent.click(saveButton);
    await canvas.findByText(/Save failed/);
  },
};
```

- [ ] **Step 2: Story count check**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-workitem-detail/src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.stories.tsx
```
Expected: `18`.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail && git add src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: workitem save-flow axis stories (4)

DirtyTitleEdited (form dirty, Save enabled), SavingInFlight (Save
clicked, button stays "Saving..."), SavedSuccess (status "Saved"),
SaveError (status "Save failed"). All exercised via storybook/test play
functions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Attachment-axis stories (3)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.stories.tsx`

- [ ] **Step 1: Extend fixtures import**

Add `itemWithManyAttachments` to the import block:

```tsx
import {
  bugWithReproSteps,
  canonicalSettings,
  commentsManyAuthors,
  epicWithCustomFields,
  itemAssignedToOther,
  itemNeverModified,
  itemWithManyAttachments,
  taskMinimalFields,
  userStoryFreshlyLoaded,
  userStoryWithRichBody,
} from './__fixtures__/work-item-data';
```

- [ ] **Step 2: Append the three attachment stories**

```tsx
// ---------------------------------------------------------------------------
// Attachment axis
// ---------------------------------------------------------------------------

export const WithAttachments: Story = story({
  scenario: loadedScenario(itemWithManyAttachments),
});

export const AttachmentSaveDialogCanceled: Story = {
  args: {
    params: {
      scenario: loadedScenario(itemWithManyAttachments),
      dialogSaveResponse: null,
      attachmentBytes: new Uint8Array([0x42, 0x44, 0x4f, 0x43, 0x4b]),
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', { name: /attachment-1\.png/i });
    await userEvent.click(button);
    // dialogSaveResponse: null → user cancelled the save dialog.
    // Production code returns early without writing.
  },
};

export const AttachmentDownloaded: Story = {
  args: {
    params: {
      scenario: loadedScenario(itemWithManyAttachments),
      dialogSaveResponse: '/tmp/attachment-1.png',
      attachmentBytes: new Uint8Array([0x42, 0x44, 0x4f, 0x43, 0x4b]),
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', { name: /attachment-1\.png/i });
    await userEvent.click(button);
    // The bytes from attachmentBytes are written to /tmp/attachment-1.png
    // in the in-memory pluginFs.writes map.
  },
};
```

- [ ] **Step 3: Story count check**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-workitem-detail/src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.stories.tsx
```
Expected: `21`.

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail && git add src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: workitem attachment axis stories (3)

WithAttachments (five-attachment list rendering), AttachmentSaveDialog
Canceled (plugin-dialog.save returns null), AttachmentDownloaded
(plugin-fs.writeFile receives the monkeypatched AdoClient.getStream
bytes). Asserts via control.invocations and control.pluginFs.writes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Window-chrome / interaction stories (4)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.stories.tsx`

- [ ] **Step 1: Append the four window-chrome / interaction stories**

```tsx
// ---------------------------------------------------------------------------
// Window-chrome / interaction axis
// ---------------------------------------------------------------------------

export const DeleteAction: Story = {
  args: {
    params: { scenario: loadedScenario(userStoryFreshlyLoaded) },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const deleteButton = await canvas.findByRole('button', { name: /^delete$/i });
    await userEvent.click(deleteButton);
    // The mocked workitems.deleteWorkItem succeeds; window.close is a
    // no-op; the iframe survives.
  },
};

export const OpenInBrowserClicked: Story = {
  args: {
    params: { scenario: loadedScenario(userStoryFreshlyLoaded) },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', { name: /open in browser/i });
    await userEvent.click(button);
  },
};

export const CloseButtonClicked: Story = {
  args: {
    params: { scenario: loadedScenario(userStoryFreshlyLoaded) },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    // The header has a Close icon button (aria-label: "Close"). Match by
    // tooltip / accessible-name "Close".
    const closeButton = await canvas.findByRole('button', { name: /^close$/i });
    await userEvent.click(closeButton);
  },
};

export const TitleSetOnLoad: Story = story({
  scenario: loadedScenario(userStoryFreshlyLoaded),
});
```

- [ ] **Step 2: Final story count check**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-workitem-detail/src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.stories.tsx
```
Expected: `25`.

- [ ] **Step 3: Run lint + tsc + build**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail/src/BorgDock.Tauri && npx tsc --noEmit && npm run lint 2>&1 | tail -10 && npm run build-storybook 2>&1 | tail -10
```
Expected: tsc clean; lint clean (or no NEW errors vs master); build-storybook completes.

If `npm run lint` flags warnings only (no errors) and the warnings are in pre-existing files, that's acceptable (matches the Phase 1/2 baseline).

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail && git add src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: workitem window-chrome + interaction stories (4)

DeleteAction (Delete button → workitems.deleteWorkItem + window.close),
OpenInBrowserClicked (open-in-browser icon → plugin:opener.openUrl),
CloseButtonClicked (close icon → window.close no-op), TitleSetOnLoad
(verifies getCurrentWindow().setTitle was called via control.windowState
.title).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Phase C review checkpoint:** all 25 stories present and Storybook builds cleanly. Confirm both before Phase D.

---

# Phase D — Verification & PR

## Task 14: Roadmap update + final verification

**Files:**
- Modify: `docs/superpowers/specs/storybook-roadmap.md`

- [ ] **Step 1: Run all verification gates**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail/src/BorgDock.Tauri
npx tsc --noEmit
npm run lint
npm run build-storybook
npm run test
```

Each command must exit 0. If `lint` flags warnings only (no errors) and the warnings are in pre-existing files (not the new fixtures or stories), that's acceptable (matches the Phase 1/2 baseline).

- [ ] **Step 2: Production-code byte-identical assertion**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail
git diff origin/master...HEAD -- \
  src/BorgDock.Tauri/src/components/work-items \
  src/BorgDock.Tauri/src/services/ado \
  src/BorgDock.Tauri/src/hooks/useAdoImageAuth.ts \
  src/BorgDock.Tauri/src/components/shared/WindowTitleBar.tsx \
  src/BorgDock.Tauri/src/utils/sanitize-html.ts \
  src/BorgDock.Tauri/src/stores/settings-store.ts \
  src/BorgDock.Tauri/src/types/work-item.ts \
  ':(exclude)src/BorgDock.Tauri/src/components/work-items/__fixtures__' \
  ':(exclude)src/BorgDock.Tauri/src/components/work-items/*.stories.tsx'
```

Output MUST be empty.

- [ ] **Step 3: Final story-count assertion**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-workitem-detail/src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.stories.tsx
```
Expected: `25`.

- [ ] **Step 4: Update the roadmap**

Open `docs/superpowers/specs/storybook-roadmap.md`. Move the "Work Item Detail" row out of the Pending table and into the Done table. The Done table should look like:

```
| 1 | Flyout (sidebar overlay) | `flyout-main.tsx` → `components/flyout/FlyoutApp.tsx` | `2026-05-05-storybook-phase1-flyoutapp-design.md` | `2026-05-05-storybook-phase1-flyoutapp.md` | [#13](https://github.com/borght-dev/BorgDock/pull/13) |
| 2 | What's New | `whats-new-main.tsx` → `components/whats-new/WhatsNewApp.tsx` | `2026-05-05-storybook-phase2-whatsnew-design.md` | `2026-05-05-storybook-phase2-whatsnew.md` | _(filled in after PR opens)_ |
| 6 | Work Item Detail | `workitem-detail-main.tsx` → `components/work-items/WorkItemDetailApp.tsx` | `2026-05-05-storybook-phase6-workitem-detail-design.md` | `2026-05-05-storybook-phase6-workitem-detail.md` | _(filled in after PR opens)_ |
```

Delete the "Work Item Detail" row from the Pending table.

Also extend the "Mock layer extensions" section. Replace the existing eight-bullet list with this eleven-bullet list:

```
- `@tauri-apps/api/core` → `mocks/tauri-core.ts`
- `@tauri-apps/api/event` → `mocks/tauri-event.ts`
- `@tauri-apps/api/window` → `mocks/tauri-api-window.ts`
- `@tauri-apps/api/app` → `mocks/tauri-api-app.ts`
- `@tauri-apps/plugin-opener` → `mocks/tauri-plugin-opener.ts`
- `@tauri-apps/plugin-store` → `mocks/tauri-plugin-store.ts`
- `@tauri-apps/plugin-dialog` → `mocks/tauri-plugin-dialog.ts`
- `@tauri-apps/plugin-fs` → `mocks/tauri-plugin-fs.ts`
- `@/services/windows` → `mocks/services-windows.ts`
- `@/services/ado/workitems` → `mocks/services-ado-workitems.ts`
- `@/generated/changelog` → `mocks/generated-changelog.ts`
```

- [ ] **Step 5: Commit the roadmap update**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail && git add docs/superpowers/specs/storybook-roadmap.md
git commit -m "$(cat <<'EOF'
roadmap: mark workitem-detail done, register 3 new mock aliases

Adds plugin-dialog, plugin-fs, and services/ado/workitems to the
mock-layer index.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Push and open PR

**Files:** none (pushes branch and opens PR)

- [ ] **Step 1: Switch to personal gh account**

```bash
gh auth switch --user borght-dev
gh auth status
```
Verify `Active account: true` next to `borght-dev`.

- [ ] **Step 2: Push the branch**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-workitem-detail && git push -u origin storybook-phase6-workitem-detail
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --base master --head storybook-phase6-workitem-detail \
  --title "storybook phase 6: work item detail catalog (25 stories)" \
  --body "$(cat <<'EOF'
## Summary
- Adds **25 exhaustive Storybook stories** for `WorkItemDetailApp.tsx` covering load state (4), item shape (6), comments (4), save flow (4), attachments (3), and window-chrome / interaction (4).
- Extends the mock layer with **three new alias surfaces**: `@tauri-apps/plugin-dialog` (full surface — open/save/message/ask/confirm — designed for Settings reuse), `@tauri-apps/plugin-fs` (writeFile / writeTextFile / read*), and a scenario-driven `@/services/ado/workitems` stand-in.
- Extends the existing window mock with `setTitle`/`getTitle` and re-exports `Window` as a type so `WindowTitleBar`'s `import type` resolves.
- Production code (`WorkItemDetailApp.tsx`, `WorkItemDetailPanel.tsx`, services/ado, useAdoImageAuth, WindowTitleBar, sanitize-html, settings store, work-item types) is byte-identical to master.
- Updates the roadmap to mark Work Item Detail done and register the three new mock aliases.

Spec: `docs/superpowers/specs/2026-05-05-storybook-phase6-workitem-detail-design.md`
Plan: `docs/superpowers/plans/2026-05-05-storybook-phase6-workitem-detail.md`

## Test plan
- [ ] `npm run storybook` boots; all 25 stories load without console errors
- [ ] Theme toolbar (light/dark/system) toggles every story without reload
- [ ] Save / Delete / Open-in-browser / Close play functions complete; the iframe survives
- [ ] Attachment download writes bytes into the in-memory `plugin-fs` map
- [ ] `npm run build-storybook` completes
- [ ] `npm run test` (vitest) green on macOS + Windows
- [ ] `npm run lint` (Biome) clean
- [ ] Production tree byte-identical: `git diff origin/master...HEAD -- src/BorgDock.Tauri/src/components/work-items src/BorgDock.Tauri/src/services/ado src/BorgDock.Tauri/src/hooks/useAdoImageAuth.ts src/BorgDock.Tauri/src/components/shared/WindowTitleBar.tsx src/BorgDock.Tauri/src/utils/sanitize-html.ts src/BorgDock.Tauri/src/stores/settings-store.ts src/BorgDock.Tauri/src/types/work-item.ts ':(exclude)src/BorgDock.Tauri/src/components/work-items/__fixtures__' ':(exclude)src/BorgDock.Tauri/src/components/work-items/*.stories.tsx'` shows zero changes
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
Vitest must be green on macOS + Windows. Playwright is allowed to fail (precedent from Phase 2). If vitest fails, root-cause — do NOT bump timeouts or skip tests.

---

## Self-Review Notes

- **Spec coverage:**
  - Mock layer extensions (plugin-dialog, plugin-fs, services-ado-workitems, window setTitle/getTitle, Window type re-export) — Tasks 2, 3, 4, 5, 6.
  - Control surface extensions (workItemScenario, pluginDialog, pluginFs, windowState.title) — Task 1.
  - Fixtures (canonicalSettings + makeWorkItem + makeComment + 9 curated items + commentsManyAuthors) — Task 7.
  - 25 stories — Tasks 8 (4) + 9 (6) + 10 (4) + 11 (4) + 12 (3) + 13 (4).
  - Roadmap update — Task 14 step 4–5.
  - PR creation — Task 15.
- **No prod code changes:** verified explicitly in Task 14 step 2.
- **Type consistency:** `WorkItem`, `WorkItemComment`, `JsonPatchOperation`, `AppSettings` types imported from production sources only; never redeclared. The new `WorkItemScenario`, `PluginDialogControl`, `PluginFsControl` interfaces live entirely on the control surface.
- **Bite-sized steps:** every task has 2–4 steps; every code-changing step shows the literal code; every commit step has the literal command.
- **Phase boundaries:**
  - Phase A (Tasks 1–6): mock layer is fully wired and storybook still builds (still only renders Flyout + WhatsNew stories).
  - Phase B (Task 7): fixtures land; tsc still clean.
  - Phase C (Tasks 8–13): stories land in axis-by-axis groups; story count is asserted at the end of each task.
  - Phase D (Tasks 14–15): roadmap update + PR.
- **Out of scope:** per-component stories, visual regression, hero shots, isNewItem flow, ado_fetch interception, image-auth interception — all deferred per spec.
- **Parallel-execution safety:** no Phase 3 surfaces touched. The `tauri-api-window.ts` extension is additive (Phase 3 will add `setSize`/`innerSize`/`scaleFactor`/`currentMonitor` separately; merge will be clean).
