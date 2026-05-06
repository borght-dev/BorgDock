# Storybook Phase 6 — WorkItemDetailApp

**Status:** design approved, plan pending
**Scope:** add an exhaustive Storybook catalog for `src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.tsx` (the Azure DevOps work-item detail window). Extends the existing mock layer with a new `@tauri-apps/plugin-dialog` alias, a new `@tauri-apps/plugin-fs` alias, a Storybook stand-in for `@/services/ado/workitems` (scenario-driven), and `setTitle` on the existing window mock. Production code stays byte-identical.

## Why

Per `docs/superpowers/specs/storybook-roadmap.md`, this is the sixth window to be storied. WorkItemDetailApp is a deliberate Phase 6 pick because:

- **Save-flow surface area.** The window owns a non-trivial dirty/save/saved/error state machine that's invisible in Phase 1–2's read-only screens. Storying it forces the catalog to cover each intermediate state, exhaustively.
- **Net-new mock alias: `plugin-dialog`.** Settings (Phase 11+) will inherit this exact mock, so we design it now to cover every entry point Settings will use (`open` / `save` / `message` / `ask` / `confirm`), not just `save`.
- **Net-new mock alias: `plugin-fs`.** WorkItemDetailApp's attachment-save flow chains `plugin-dialog.save()` into `plugin-fs.writeFile()`. We add a minimal mock for `writeFile`/`readFile` that records the call and stores the bytes in memory, so future windows that touch the filesystem (File Viewer, settings export/import) can reuse it.
- **HTTP-via-`invoke` is the right mock seam.** Production code reaches Azure DevOps through `AdoClient` which calls `invoke('ado_fetch', ...)`. We do NOT mock at the `invoke` level (there's no per-call dispatch on URL/method without Phase 3's fn-form `invokeResponses`). Instead we alias the high-level `@/services/ado/workitems` module — the same pattern Phase 1 used for `@/services/windows`. This keeps stories scenario-driven (one fixture object per story = one work item plus states plus comments) instead of HTTP-payload-shaped.
- **Window chrome reuse.** The window renders `WindowTitleBar` (same as What's New); it also calls `getCurrentWindow().setTitle(...)`. The existing window mock is missing `setTitle` — we extend it (no breaking change to Phase 2 stories).
- **Validates the multi-section dynamic-fields renderer.** Stories cover rich-text fields (sanitized HTML), standard fields, custom fields, and attachments — exercising the full `classifyFields` / `formatFieldValue` / `extractAttachments` pipeline.

## Non-Goals

- Per-component stories for `WorkItemDetailPanel`, `WorkItemCard`, `WorkItemList`, `WorkItemFilterBar`, `QueryBrowser`, `WorkItemsSection` — deferred to the cross-cutting "component-level stories" phase noted in the roadmap.
- Visual regression integration / Chromatic / Storybook test-runner — still deferred.
- Hero-shot pipeline integration — later phase.
- Storying the *creation* (`isNewItem: true`) flow. The WorkItemDetailApp entry only renders existing items (the URL must contain `?id=...`); the new-item flow is reached via `WorkItemsSection` and will be storied with that screen.
- Interception at the `ado_fetch` invoke level. Without Phase 3's fn-form `invokeResponses[command]`, we cannot dispatch by URL/method — and even with it, scenario fixtures are easier to author than HTTP-payload fixtures. We alias `@/services/ado/workitems` instead. (If a future spec wants to cover the `AdoClient` retry / 401-refresh path, it will need fn-form invokeResponses and should be sequenced after Phase 3 lands.)
- Mocking `services/logger`, `attachConsoleBridge()`, `disableDefaultContextMenu()` — those run from `workitem-detail-main.tsx` (the Tauri entry), which the stories do NOT render. Stories render `<WorkItemDetailApp />` directly.
- Touching any production file under `src/components/work-items/`, `src/services/ado/`, `src/hooks/useAdoImageAuth.ts`, `src/components/shared/WindowTitleBar.tsx`, `src/utils/sanitize-html.ts`, `src/stores/settings-store.ts`, or `src/types/work-item.ts`.
- Storying ADO image-auth (`useAdoImageAuth`). The hook fetches images with the PAT auth header; in Storybook we leave the `<img>` tags pointing at their original (unauthenticated) URLs. They render broken-image icons — that's acceptable backdrop for the catalog because the layout doesn't depend on the image actually loading. A future Image-Auth phase can add a fetch interceptor if needed.

## Constraints

- **No production code changes.** Verified via `git diff origin/master...storybook-phase6-workitem-detail -- src/BorgDock.Tauri/src/components/work-items src/BorgDock.Tauri/src/services/ado src/BorgDock.Tauri/src/hooks/useAdoImageAuth.ts src/BorgDock.Tauri/src/components/shared/WindowTitleBar.tsx src/BorgDock.Tauri/src/utils/sanitize-html.ts src/BorgDock.Tauri/src/stores/settings-store.ts src/BorgDock.Tauri/src/types/work-item.ts ':(exclude)src/BorgDock.Tauri/src/components/work-items/__fixtures__' ':(exclude)src/BorgDock.Tauri/src/components/work-items/*.stories.tsx'` showing zero changes.
- Storybook 9 + React-Vite + Tailwind v4 setup from Phase 1 stays as-is. Only additive changes to `.storybook/`.
- The control surface (`window.__borgdock_storybook_tauri`) gets two new fields (`workItemScenario`, `pluginDialog`, `pluginFs`) and one extension (`windowState.title`). The existing `reset()` is extended to wipe them.
- The `tauri-api-window.ts` mock gains two new methods on the `MockWindow` returned by `getCurrentWindow()`: `setTitle(title: string)` and `setSize(_size: unknown)` — the second is harmless future-proofing for the upcoming Worktree palette and SQL phases. Phase 2's stories continue to work because they don't call these.
- Real `AdoClient` and `AdoApiError`/`AdoAuthError` types are not exercised in stories. Stories never construct an `AdoClient`; the aliased `@/services/ado/workitems` module returns scenario fixtures directly.
- **Parallel-execution safety.** Phase 3 (Worktree palette, in-flight) is the only phase touching the same central files (`.storybook/main.ts`, `.storybook/mocks/control.ts`). We add aliases / fields **additively** — Phase 3 will add its own behind/before us at merge time, and `git` will resolve. We do NOT pre-implement Phase 3's fn-form `invokeResponses`, `setSize` / `innerSize` / `scaleFactor` / `currentMonitor` (beyond the trivial `setSize` no-op already covered by the Phase 2 mock surface), or the `windowSize` / `monitorState` control fields. Phase 4 (SQL) and Phase 5 (Agent Overview) don't overlap our surfaces.

## Architecture

### File layout

```
src/BorgDock.Tauri/
├── .storybook/
│   ├── main.ts                                   # extend resolve.alias with 3 new entries
│   └── mocks/
│       ├── control.ts                            # extend with workItemScenario + pluginDialog + pluginFs; setTitle in windowState
│       ├── tauri-api-window.ts                   # extend MockWindow with setTitle + getTitle
│       ├── tauri-plugin-dialog.ts                # NEW
│       ├── tauri-plugin-fs.ts                    # NEW
│       └── services-ado-workitems.ts             # NEW — scenario-driven stand-in for @/services/ado/workitems
└── src/components/work-items/
    ├── __fixtures__/
    │   └── work-item-data.ts                     # synthetic WorkItem / scenarios
    └── WorkItemDetailApp.stories.tsx             # ~25 stories
```

### Mock additions

#### `tauri-plugin-dialog.ts` (NEW — designed for Settings reuse)

Stand-in for the **entire public surface** of `@tauri-apps/plugin-dialog`, not just `save()`. Settings will eventually call every entry point — let's do it once and right.

```ts
import { getControl } from './control';

// Subset of the real plugin's option types — kept loose so future windows
// can pass anything without a cast.
export interface OpenDialogOptions {
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  multiple?: boolean;
  directory?: boolean;
  title?: string;
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
  return typeof r === 'function' ? r(options) : (r ?? null);
}

export async function save(options?: SaveDialogOptions): Promise<string | null> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'plugin:dialog.save', args: options });
  const r = ctrl.pluginDialog.saveResponse;
  return typeof r === 'function' ? r(options) : (r ?? null);
}

export async function message(text: string, options?: MessageDialogOptions): Promise<void> {
  getControl().invocations.push({ command: 'plugin:dialog.message', args: { text, options } });
}

export async function ask(text: string, options?: ConfirmDialogOptions): Promise<boolean> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'plugin:dialog.ask', args: { text, options } });
  const r = ctrl.pluginDialog.askResponse;
  return typeof r === 'function' ? r(text, options) : (r ?? true);
}

export async function confirm(text: string, options?: ConfirmDialogOptions): Promise<boolean> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'plugin:dialog.confirm', args: { text, options } });
  const r = ctrl.pluginDialog.confirmResponse;
  return typeof r === 'function' ? r(text, options) : (r ?? true);
}
```

`getControl().pluginDialog` shape:

```ts
interface PluginDialogControl {
  // Each *Response can be either a literal value (returned as-is) OR a
  // function that takes the call's options and returns the value. Stories
  // pick whichever's easier.
  openResponse?: string | string[] | null | ((opts?: OpenDialogOptions) => string | string[] | null);
  saveResponse?: string | null | ((opts?: SaveDialogOptions) => string | null);
  askResponse?: boolean | ((text: string, opts?: ConfirmDialogOptions) => boolean);
  confirmResponse?: boolean | ((text: string, opts?: ConfirmDialogOptions) => boolean);
}
```

`reset()` clears every `*Response` field on `pluginDialog`. Defaults are sensible: `open`/`save` default to `null` (cancelled), `ask`/`confirm` default to `true` (user said yes). Stories override to test the cancellation path.

#### `tauri-plugin-fs.ts` (NEW)

Stand-in for the subset of `@tauri-apps/plugin-fs` that BorgDock currently calls. Today that's `writeFile` (attachment download) — but we mock `readTextFile` and `writeTextFile` too because Settings (export/import) will pick them up.

```ts
import { getControl } from './control';

export async function writeFile(path: string, contents: Uint8Array): Promise<void> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'plugin:fs.writeFile', args: { path, byteLength: contents.byteLength } });
  ctrl.pluginFs.writes.set(path, contents);
  if (ctrl.pluginFs.failNextWrite) {
    ctrl.pluginFs.failNextWrite = false;
    throw new Error('storybook: writeFile failed');
  }
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

`getControl().pluginFs` shape:

```ts
interface PluginFsControl {
  writes: Map<string, Uint8Array>;
  reads: Map<string, Uint8Array>;
  failNextWrite: boolean;
}
```

`reset()` clears both maps and sets `failNextWrite = false`.

#### `services-ado-workitems.ts` (NEW — scenario seam)

Stand-in for `@/services/ado/workitems`. Returns scenario data straight from `getControl().workItemScenario` — never goes through `AdoClient` / `invoke('ado_fetch', ...)`.

```ts
import type { JsonPatchOperation, WorkItem, WorkItemComment } from '../../src/types';
import { getControl } from './control';

export async function getWorkItem(_client: unknown, id: number): Promise<WorkItem> {
  const ctrl = getControl();
  const scenario = ctrl.workItemScenario;
  if (scenario.loadBehavior === 'pending') return new Promise(() => {});
  if (scenario.loadBehavior === 'reject') throw new Error(scenario.loadError ?? 'Failed to load work item');
  if (!scenario.workItem) throw new Error('storybook: no work item in scenario');
  ctrl.invocations.push({ command: 'workitems.getWorkItem', args: { id } });
  return scenario.workItem;
}

export async function getWorkItemTypeStates(_client: unknown, type: string): Promise<string[]> {
  const ctrl = getControl();
  if (ctrl.workItemScenario.statesBehavior === 'reject') throw new Error('storybook: states fetch failed');
  ctrl.invocations.push({ command: 'workitems.getWorkItemTypeStates', args: { type } });
  return ctrl.workItemScenario.states ?? [];
}

export async function getWorkItemComments(_client: unknown, id: number): Promise<WorkItemComment[]> {
  const ctrl = getControl();
  const s = ctrl.workItemScenario;
  if (s.commentsBehavior === 'pending') return new Promise(() => {});
  if (s.commentsBehavior === 'reject') throw new Error('storybook: comments fetch failed');
  ctrl.invocations.push({ command: 'workitems.getWorkItemComments', args: { id } });
  return s.comments ?? [];
}

export async function updateWorkItem(_client: unknown, id: number, ops: JsonPatchOperation[]): Promise<WorkItem> {
  const ctrl = getControl();
  const s = ctrl.workItemScenario;
  ctrl.invocations.push({ command: 'workitems.updateWorkItem', args: { id, ops } });
  if (s.saveBehavior === 'pending') return new Promise(() => {});
  if (s.saveBehavior === 'reject') throw new Error('storybook: save failed');
  // Apply patch to the in-memory work item so subsequent loads reflect the new state.
  if (!s.workItem) throw new Error('storybook: no work item in scenario');
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
  if (ctrl.workItemScenario.deleteBehavior === 'reject') throw new Error('storybook: delete failed');
}

export async function addWorkItemComment(_client: unknown, id: number, text: string): Promise<WorkItemComment> {
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

// Re-export the symbols used by other windows but not by WorkItemDetailApp,
// so the alias is a complete drop-in replacement and future stories/tests
// don't accidentally hit the real module via this alias.
export async function getWorkItems(): Promise<WorkItem[]> { return []; }
export async function createWorkItem(): Promise<WorkItem> { throw new Error('storybook: createWorkItem not mocked'); }
export async function downloadAttachment(): Promise<Blob> { throw new Error('storybook: downloadAttachment not mocked'); }
export async function getCurrentUserDisplayName(): Promise<string | null> { return null; }
export async function searchWorkItemsByIdPrefix(): Promise<WorkItem[]> { return []; }
export async function searchWorkItemsByText(): Promise<WorkItem[]> { return []; }
export async function getAssignedToMe(): Promise<WorkItem[]> { return []; }
export { buildIdPrefixWiql } from '../../src/services/ado/workitems';
```

The `buildIdPrefixWiql` re-export from the real module is safe — it's a pure string builder with no Tauri dependencies. The other re-exports are stub-throws so a future window's story wired to this alias notices immediately if it accidentally relies on an unmocked path.

#### `services-ado-client.ts` (NEW)

`WorkItemDetailApp` constructs `new AdoClient(...)` to pass into the `useAdoImageAuth` hook and into the workitems API. The hook itself calls `invoke('ado_resolve_auth_header', ...)` directly (not via the client). The constructed client is also passed into our **mocked** workitems API which ignores it. So the actual `AdoClient` constructor runs but its methods are never called. The constructor is side-effect-free (just stores fields). No mock needed for `client.ts`. We do NOT alias it — production code stays at the bound import path.

(Verified: `AdoClient.constructor` only stores fields; `useAdoImageAuth` calls `invoke` separately. The mocked `invoke` returns `undefined` for `ado_resolve_auth_header`, which the hook handles gracefully — it short-circuits when the auth header resolve throws or when there's no organization configured. The hook also short-circuits when there's no `htmlContent`, which is most stories.)

#### `tauri-api-window.ts` extension

```ts
interface MockWindow {
  close(): Promise<void>;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  unmaximize(): Promise<void>;
  isMaximized(): Promise<boolean>;
  setTitle(title: string): Promise<void>;
  getTitle(): Promise<string>;
}

export function getCurrentWindow(): MockWindow {
  const ctrl = getControl();
  return {
    // ...existing methods...
    async setTitle(title) {
      ctrl.invocations.push({ command: 'window.setTitle', args: { title } });
      ctrl.windowState.title = title;
    },
    async getTitle() {
      return ctrl.windowState.title;
    },
  };
}
```

The `windowState.title` field defaults to `''` and is reset by `reset()`. Phase 2 stories don't read it — they only ever set/check `isMaximized`.

#### `control.ts` extensions

```ts
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

export interface PluginDialogControl {
  openResponse?: string | string[] | null | ((opts?: unknown) => string | string[] | null);
  saveResponse?: string | null | ((opts?: unknown) => string | null);
  askResponse?: boolean | ((text: string, opts?: unknown) => boolean);
  confirmResponse?: boolean | ((text: string, opts?: unknown) => boolean);
}

export interface PluginFsControl {
  writes: Map<string, Uint8Array>;
  reads: Map<string, Uint8Array>;
  failNextWrite: boolean;
}

interface StorybookTauriControl {
  // existing fields ...

  // Phase 6 additions
  workItemScenario: WorkItemScenario;
  pluginDialog: PluginDialogControl;
  pluginFs: PluginFsControl;

  // Phase 6 extension to existing windowState
  windowState: { isMaximized: boolean; title: string };
}
```

`reset()` resets every Phase 6 field to its default and clears the existing fields too.

#### `.storybook/main.ts` aliases

Add three entries to `viteFinal`:

```ts
'@tauri-apps/plugin-dialog': resolve(here, 'mocks/tauri-plugin-dialog.ts'),
'@tauri-apps/plugin-fs':     resolve(here, 'mocks/tauri-plugin-fs.ts'),
'@/services/ado/workitems':  resolve(here, 'mocks/services-ado-workitems.ts'),
```

Order: the deep-`@` alias for `services-ado-workitems` MUST appear before the catch-all `@`. Same constraint Phase 2 honored for `@/services/windows` and `@/generated/changelog`. The full canonical order is preserved in the plan's Task 7 code block.

### Stories file pattern

`WorkItemDetailApp.stories.tsx` mirrors the WhatsNewApp pattern: a `WorkItemDetailHarness` wrapper, a `story()` helper, parameter-driven seeding. The harness:

1. Calls `getControl().reset()` (already done by the global preview decorator).
2. Mutates `window.location` via `history.replaceState({}, '', '/workitem-detail.html?id=<id>')` so the production code's `URLSearchParams(window.location.search)` returns the right id. The harness restores the URL on unmount.
3. Sets `getControl().workItemScenario = ...` based on `params.scenario`.
4. Sets `getControl().pluginDialog.saveResponse = params.dialogSaveResponse` etc.
5. Pushes the canned `load_settings` invoke response: `getControl().invokeResponses['load_settings'] = canonicalSettings()`.
6. Renders `<WorkItemDetailApp />` inside a fixed-size box.

`canonicalSettings()` is a tiny helper that returns a complete `AppSettings` object with every field defaulted (theme = light/dark per param, ado.organization = `'storybook-org'`, etc.). It's defined in the fixtures file so future ADO/Settings stories can reuse it.

### Theme

The Phase 1 global toolbar (`light`/`dark`/`system`) covers WorkItemDetailApp. The production code applies theme via `document.documentElement.classList.toggle('dark', ...)` based on the loaded `settings.ui.theme`; the toolbar's preview decorator overrides this after the production effect runs (StrictMode means the effect runs twice; the toolbar's `applyTheme` runs in the decorator and wins on the final paint).

If a story specifies its own theme (`params.scenarioOverrides?.uiTheme`), the harness adjusts the canned `load_settings` response. Most stories defer to the toolbar.

### Fixtures

`src/components/work-items/__fixtures__/work-item-data.ts`:

```ts
import type { AppSettings } from '@/types/settings';
import type { WorkItem, WorkItemComment } from '@/types/work-item';

export function canonicalSettings(overrides?: Partial<AppSettings>): AppSettings { ... }
export function makeWorkItem(overrides?: Partial<WorkItem>): WorkItem { ... }
export function makeComment(overrides?: Partial<WorkItemComment>): WorkItemComment { ... }

// Curated scenarios
export const userStoryFreshlyLoaded:    WorkItem;
export const userStoryWithRichBody:     WorkItem;     // long Description HTML, AcceptanceCriteria
export const bugWithReproSteps:         WorkItem;     // ReproSteps + ScreenShot relations
export const taskMinimalFields:         WorkItem;     // only id/title/state/type/assignedTo
export const epicWithCustomFields:      WorkItem;     // Custom.* and Microsoft.VSTS.CMMI.* fields
export const itemWithManyAttachments:   WorkItem;     // 5 AttachedFile relations
export const itemWithLongTitle:         WorkItem;
export const itemAssignedToOther:       WorkItem;
export const itemWithTags:              WorkItem;
export const itemNeverModified:         WorkItem;     // empty rich-text fields

export const commentsManyAuthors:       WorkItemComment[];  // 6 comments, varying authors / times
export const commentsLongBody:          WorkItemComment[];  // single comment, very long
export const commentsWithHtml:          WorkItemComment[];  // markdown / html / images mix
```

`WorkItem` and `WorkItemComment` are imported from production types — never redeclared.

## Story Catalog (exhaustive — 25 stories)

Estimated breakdown across axes (drop axes that don't apply, add ones that do — per the brief):

### Load-state axis (4)
1. **Loading** — `scenario.loadBehavior = 'pending'`; `getWorkItem` never resolves. Covers the spinner Card the app shows while `detailData === null`.
2. **LoadError** — `scenario.loadBehavior = 'reject'`. App shows the "Failed to load work item" error card.
3. **NoIdProvided** — harness sets the URL to `/workitem-detail.html` (no `?id=`); app shows "No work item ID provided".
4. **LoadedClean** — full successful load: workItem + states + comments resolve; nothing dirty.

### Item-shape axis (6)
5. **UserStoryWithRichBody** — `userStoryWithRichBody`; covers Description / AcceptanceCriteria HTML rendering.
6. **BugWithReproSteps** — `bugWithReproSteps`; covers ReproSteps rich-text section + state pill `Active`.
7. **TaskMinimalFields** — sparse fields; verifies layout doesn't break when most sections are empty.
8. **EpicWithCustomFields** — `epicWithCustomFields`; verifies the Custom Fields section renders.
9. **ItemAssignedToOther** — assigned-to is a different user; avatar / select reflects.
10. **ItemNeverModified** — empty rich-text bodies; sections collapse/hide.

### Comments axis (4)
11. **CommentsLoading** — `commentsBehavior = 'pending'`; skeleton shimmer in Discussion section.
12. **CommentsEmpty** — comments resolved as `[]`; "No comments yet." copy.
13. **CommentsManyAuthors** — `commentsManyAuthors`; six comments scroll with avatars.
14. **CommentsLoadFailed** — `commentsBehavior = 'reject'`; component logs but still renders the rest of the panel.

### Save-flow axis (4)
15. **DirtyTitleEdited** — play function changes the Title textarea so the form is dirty (Save button enabled).
16. **SavingInFlight** — `scenario.saveBehavior = 'pending'`; play clicks Save, button shows "Saving..." indefinitely.
17. **SavedSuccess** — play clicks Save with a tweaked Title; status text reads "Saved" and workItem updates.
18. **SaveError** — `scenario.saveBehavior = 'reject'`; play clicks Save; status text reads "Save failed".

### Attachment axis (3)
19. **WithAttachments** — `itemWithManyAttachments`; renders five attachment buttons.
20. **AttachmentSaveDialogCanceled** — play function clicks the first attachment button; `pluginDialog.saveResponse = null` (user canceled save dialog); story asserts `getControl().pluginFs.writes` is empty.
21. **AttachmentDownloaded** — play function clicks the first attachment button; `pluginDialog.saveResponse = '/tmp/attachment.png'`; the mocked `getStream` returns a 1-byte blob (we add a tiny stub on the AdoClient mock OR — simpler — alias `services-ado-workitems` to also handle this... see implementation note below).

   Implementation note: `handleDownloadAttachment` calls `client.getStream(...)` directly on the `AdoClient` instance — not through the workitems module. So we either (a) construct a fake AdoClient stub on `getControl()` that fakes `getStream`, or (b) alias `@/services/ado/client` too. The simplest path is (c): the harness monkeypatches `AdoClient.prototype.getStream` to return a small Blob from `getControl().pluginFs.attachmentBytes`. We choose (c) because it keeps the alias surface minimal. The monkeypatch is restored on harness unmount.

### Interaction / window-chrome axis (4)
22. **DeleteAction** — play clicks Delete; `pluginDialog.confirmResponse` is irrelevant here because the production code does NOT confirm before delete (it just calls `deleteWorkItem` then `getCurrentWindow().close()`). Story asserts `invocations` includes `workitems.deleteWorkItem` and `window.close`.
23. **OpenInBrowserClicked** — play clicks the open-in-browser icon; story asserts `invocations` includes `plugin:opener.openUrl` with the workitem's `htmlUrl`.
24. **CloseButtonClicked** — play clicks the close icon; asserts `invocations` includes `window.close` (no-op mock survives).
25. **TitleSetOnLoad** — verifies that `getCurrentWindow().setTitle(...)` was called with `#<id> - <title>` after a successful load. (Asserted via `getControl().windowState.title`.)

**Total: 25 stories.**

(The brainstorm allows ~20–30; 25 is the right number to cover every state without padding. Theme is covered by the global toolbar and not duplicated as per-story axes — same as Phase 2.)

## Tooling additions

### `package.json`
No changes. Storybook deps installed in Phase 1 are sufficient. `@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs` are already in `dependencies` (used by production); the Storybook alias rewrites them to mocks at bundle time.

### `tsconfig.json`
Existing `src/**/*.tsx` glob already covers the new fixtures and stories paths. No changes.

### Biome
Phase 1 already extended `biome.json` includes to cover `.storybook/`. Nothing to add.

### Test suites
- **Vitest:** untouched. The fixtures file is plain TypeScript that may incidentally be imported by future tests, but Phase 6 doesn't add any vitest tests.
- **Playwright:** untouched. The existing `tests/e2e/work-item-detail.spec.ts` (if any) continues to drive the real Tauri webview.

## Risks & mitigations

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| `WorkItemDetailApp` reads `window.location.search` for the `id` param; harness changes don't propagate cleanly | medium | Harness uses `history.replaceState` to rewrite the URL synchronously *before* the component mounts (called in the function body, not an effect). `useMemo` reads it once on mount. On unmount the harness restores the original URL. |
| `useSettingsStore.setState` from production code persists across stories, causing later stories to read stale settings | medium | Global preview decorator extended to call `useSettingsStore.setState({ settings: defaultSettings, isLoading: true, hasLoaded: false })` before each story render. This is additive — Phase 2 stories don't depend on the store. |
| `AdoClient` constructor runs but no methods are called — except `getStream` for attachment-download | low | We monkeypatch `AdoClient.prototype.getStream` in the harness for stories 19–21; restore on unmount. The other methods (`get`, `post`, `patch`, `delete`) are never called because the workitems alias intercepts before the client is touched. |
| `useAdoImageAuth` runs against rich-text HTML and fires real `fetch()` calls to dev.azure.com — those will 404 and clutter the network tab | low | The hook short-circuits if the resolved auth-header throws (and our mocked `invoke('ado_resolve_auth_header', ...)` returns `undefined` which makes the production code throw). Even when it doesn't short-circuit, the real `fetch` calls fail silently (the hook catches). Acceptable — the layout doesn't depend on the image actually loading. |
| Phase 3's parallel session adds `setSize` / `innerSize` etc. to `tauri-api-window.ts` — merge collision | medium | Phase 6 only adds `setTitle` / `getTitle`. Phase 3 adds `setSize` / `innerSize` / `scaleFactor`. These additions don't overlap each other — `git merge` will combine them cleanly (additive interface members + additive method implementations). If a syntactic conflict surfaces at merge time, it's resolvable in seconds. |
| `tauri-plugin-dialog` mock's `*Response`-can-be-fn pattern type-explodes when Settings later wants 8 different responses | low | Settings can introduce its own scenario shape if the flat `*Response` fields prove insufficient. The Phase 6 design only commits to the four entry points actually used here (open / save / ask / confirm) plus `message` (recorded but no return value). |
| `getCurrentWindow().setTitle` is called from a `.catch(console.debug)` chain; if the mock throws it'd leak to console but not crash | low | Mock is `async () => { ... }` — never throws unless `getControl()` does (only in non-browser contexts, which Storybook isn't). Confirmed safe. |
| Story count drift if a future code change adds a new scenario field | low | Plan's Final Verification pins `grep -c "^export const "` to `25`. Future PRs that add stories must update the assertion. |

## Acceptance criteria

1. `cd src/BorgDock.Tauri && npm run storybook` boots without errors. All 25 stories render.
2. Light/dark toolbar toggle re-renders every story without reload.
3. `npm run build-storybook` completes.
4. `npm run lint` and `npm run test` pass.
5. Production code is byte-identical (`git diff origin/master...storybook-phase6-workitem-detail -- <production paths> ':(exclude)<fixtures>' ':(exclude)<stories>'` shows zero lines).
6. `.storybook/mocks/` gains exactly four new files (`tauri-plugin-dialog.ts`, `tauri-plugin-fs.ts`, `services-ado-workitems.ts`, plus the extended `tauri-api-window.ts` and `control.ts`); `main.ts` gains exactly three new alias entries; `control.ts` gains `workItemScenario`, `pluginDialog`, `pluginFs`, and `windowState.title`.
7. The roadmap (`docs/superpowers/specs/storybook-roadmap.md`) is updated in the same PR: WorkItemDetailApp moves from "Pending" to "Done" with the spec/plan/PR links; the mock-extensions list gains three new bullets.
8. Production WorkItemDetailApp's URL params remain functional (no leaked URL state between stories).

## What comes next (out of scope here)

- **Settings (Phase 11):** consumes the `tauri-plugin-dialog` and `tauri-plugin-fs` mocks added here; will likely extend `pluginDialog` with a richer scenario shape if its eight-or-so dialog flows demand it.
- **File Viewer (Phase 8 candidate):** consumes `tauri-plugin-fs` for `readTextFile` / file-loading flows.
- **Component-level stories** for `WorkItemDetailPanel`, `WorkItemCard`, etc. — easier now that the window-level stories surface their states.
- **Visual regression tooling decision** — once enough screens are storied (≥3) to evaluate options. After Phase 6 lands, four phases will be done (1, 2, 3 if landed, 6) — that's enough for a first evaluation.
- **ADO image-auth interception:** the `useAdoImageAuth` hook would need a fetch-interceptor mock to render images in stories. Worth doing if a future hero-shot phase wants the work-item screen to look real in marketing.
