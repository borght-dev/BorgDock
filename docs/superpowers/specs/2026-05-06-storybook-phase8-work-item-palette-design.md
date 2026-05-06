# Storybook Phase 8 — Work Item Palette

**Status:** design approved, plan pending
**Scope:** add a Storybook catalog for `src/BorgDock.Tauri/src/components/work-item-palette/WorkItemPaletteApp.tsx` (Azure DevOps work-item palette). Extends the existing mock layer with a new `WebviewWindow` class export on `tauri-api-webviewWindow`, a `startDragging()` method on `tauri-api-window`'s `getCurrentWindow()`, and replaces the four stub-throws on `services-ado-workitems` (`getWorkItems`, `getAssignedToMe`, `searchWorkItemsByIdPrefix`, `searchWorkItemsByText`) with scenario-driven impls reading from a new `workItemPaletteScenario` field on the control surface. Production code stays byte-identical.

## Why

Per `docs/superpowers/specs/storybook-roadmap.md`, this is the eighth window to be storied. The work-item palette is one of three M-size windows in wave 2a (parallel with File Palette and File Viewer). It is a deliberate Phase 8 pick because:

- **Browse + search dual-state machine.** The palette is in either browse mode (showing Working On / Assigned to Me / Recent sections) or search mode (showing search results). Storying it forces the catalog to cover both modes plus their loading / empty / error variants exhaustively. The same shape will recur in File Palette (Phase 7) and is worth establishing canonically here.
- **Net-new mock surfaces.**
  1. `getCurrentWindow().startDragging()` — first window storied that uses the manual drag handle pattern (Worktree palette uses `data-tauri-drag-region`, no JS call). File Palette doesn't use it. We add it now to keep the surface available to future palette-shaped windows.
  2. `WebviewWindow` class on `@tauri-apps/api/webviewWindow` — first storied window that opens a child window via `new WebviewWindow(label, options)`. The existing mock only exports `getCurrentWebviewWindow` (used by AgentOverview's title bar). Settings, Pr Detail and others are likely future consumers.
  3. The `services-ado-workitems` Phase-6 stubs (`getWorkItems`, `getAssignedToMe`, `searchWorkItemsByIdPrefix`, `searchWorkItemsByText`) become real scenario-driven impls. Phase 6 left them as stub-throws specifically so the next consumer would replace them; this is that PR.
- **`useWorkItemPaletteSearch` hook coverage for free.** The hook (`src/hooks/useWorkItemPaletteSearch.ts`) is the bulk of the palette's logic. Storying the parent component exercises every branch in the hook (settings load, restoring saved position, debounced search, `selectAndClose`, position persistence on `onMoved`).
- **Reusability.** The `workItemPaletteScenario` shape is the canonical fixture for any future story / test that needs ADO work items in browse-or-search context. Identical to how Phase 6's `workItemScenario` became the canonical detail-window fixture.

## Non-Goals

- Per-component stories for `WorkItemPaletteRow` — deferred to the cross-cutting "component-level stories" phase.
- Visual regression integration — still deferred.
- Hero-shot pipeline integration — later phase.
- The new-detail-window pop-out flow's *successor* state — when the user picks a work item, we record the `WebviewWindow` construction and stop there. We do not story the resulting detail window's mount (Phase 6 already covers that).
- Mocking the `AdoClient` constructor's auth-resolve side effects. The constructor is side-effect-free (just stores fields); `getAuthHeader` is only called by methods we never invoke (the workitems alias intercepts before any HTTP path).
- Mocking `disableDefaultContextMenu()` from `work-item-palette-main.tsx` — that runs in the Tauri entry script which the stories do NOT render. Stories render `<WorkItemPaletteApp />` directly.
- Touching any production file under `src/components/work-item-palette/`, `src/hooks/useWorkItemPaletteSearch.ts`, `src/services/ado/`, `src/components/shared/primitives`, or `src/types/`.
- Coverage of `WebviewWindow` instance methods (close / hide / show / setFocus). The production code only constructs the object — instance methods are never called from `WorkItemPaletteApp` or the hook. The mock returns an instance with no-op methods so any future consumer's call doesn't crash, but stories don't assert on them.
- The legacy "polling setFocus every 50ms × 30 attempts" workaround referenced in the production comment — it's history, not part of this catalog.

## Constraints

- **No production code changes.** Verified via `git diff origin/master...storybook-phase8-work-item-palette -- src/BorgDock.Tauri/src/components/work-item-palette src/BorgDock.Tauri/src/hooks/useWorkItemPaletteSearch.ts src/BorgDock.Tauri/src/services/ado src/BorgDock.Tauri/src/types ':(exclude)src/BorgDock.Tauri/src/components/work-item-palette/__fixtures__' ':(exclude)src/BorgDock.Tauri/src/components/work-item-palette/*.stories.tsx'` showing zero changes.
- Storybook 9 + React-Vite + Tailwind v4 setup from Phase 1 stays as-is. Only additive changes to `.storybook/`.
- The control surface (`window.__borgdock_storybook_tauri`) gets two new fields (`workItemPaletteScenario`, `webviewWindowsCreated`). The existing `reset()` is extended to wipe them.
- The `tauri-api-window.ts` mock gains one new method on the `MockWindow` returned by `getCurrentWindow()`: `startDragging()`. Phases 1–6 don't depend on its absence; addition is non-breaking.
- The `tauri-api-webviewWindow.ts` mock gains a new exported class `WebviewWindow`. The existing `getCurrentWebviewWindow` factory is unchanged.
- The `services-ado-workitems.ts` mock's four palette-relevant exports are replaced — they used to be `[]` stubs, now they read from `workItemPaletteScenario`. The Phase-6 detail-window stories don't call any of them (Phase 6 only uses `getWorkItem`, `getWorkItemTypeStates`, `getWorkItemComments`, `updateWorkItem`, `deleteWorkItem`, `addWorkItemComment`), so this swap is non-breaking.
- **Parallel-execution safety.** Phase 7 (File Palette, in-flight) and Phase 9 (File Viewer, in-flight) are the parallel teammates. File Palette's tree uses `getCurrentWindow().onFocusChanged` (a different mock-surface extension) and File Viewer needs none of the surfaces we touch. We add aliases / fields **additively** — peers will rebase cleanly.

## Architecture

### File layout

```
src/BorgDock.Tauri/
├── .storybook/
│   └── mocks/
│       ├── control.ts                              # extend with workItemPaletteScenario + webviewWindowsCreated
│       ├── tauri-api-window.ts                     # add startDragging on MockWindow
│       ├── tauri-api-webviewWindow.ts              # add WebviewWindow class
│       └── services-ado-workitems.ts               # implement getWorkItems / getAssignedToMe / searchWorkItemsByIdPrefix / searchWorkItemsByText
└── src/components/work-item-palette/
    ├── __fixtures__/
    │   └── work-item-palette-data.ts               # synthetic ResultItem/WorkItem fixtures + scenarios
    └── WorkItemPaletteApp.stories.tsx              # 24 stories
```

### Mock additions

#### `tauri-api-window.ts` extension — `startDragging`

```ts
async startDragging() {
  ctrl.invocations.push({ command: 'window.startDragging' });
}
```

No state mutation needed. The drag handle's `onMouseDown` calls this; for stories we just want the call recorded. The iframe doesn't actually move (Storybook controls the bounds).

#### `tauri-api-webviewWindow.ts` extension — `WebviewWindow` class

```ts
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
  // ...remaining loose to absorb arbitrary keys
  [key: string]: unknown;
}

export class WebviewWindow {
  readonly label: string;
  readonly options: WebviewWindowOptions;

  constructor(label: string, options?: WebviewWindowOptions) {
    this.label = label;
    this.options = options ?? {};
    const ctrl = getControl();
    ctrl.webviewWindowsCreated.push({ label, options: this.options });
    ctrl.invocations.push({
      command: 'webviewWindow.new',
      args: { label, options: this.options },
    });
  }

  async close()    { getControl().invocations.push({ command: 'webviewWindow.close',    args: { label: this.label } }); }
  async hide()     { getControl().invocations.push({ command: 'webviewWindow.hide',     args: { label: this.label } }); }
  async show()     { getControl().invocations.push({ command: 'webviewWindow.show',     args: { label: this.label } }); }
  async setFocus() { getControl().invocations.push({ command: 'webviewWindow.setFocus', args: { label: this.label } }); }
}
```

Stories assert on `getControl().webviewWindowsCreated` (the array of `{label, options}` records) — that's the natural shape for "did the user just open a detail window?".

#### `services-ado-workitems.ts` palette-shaped functions

The four functions used by the palette become scenario-driven. Existing Phase-6 functions (`getWorkItem`, `getWorkItemTypeStates`, `getWorkItemComments`, `updateWorkItem`, `deleteWorkItem`, `addWorkItemComment`) stay untouched. Pseudo-code:

```ts
export async function getWorkItems(_client: unknown, ids: number[]): Promise<WorkItem[]> {
  const s = getControl().workItemPaletteScenario;
  getControl().invocations.push({ command: 'workitems.getWorkItems', args: { ids } });
  if (s.browseBehavior === 'pending') return new Promise(() => {});
  if (s.browseBehavior === 'reject') throw new Error('storybook: getWorkItems failed');
  const byId = new Map(s.workItems.map((w) => [w.id, w]));
  return ids.map((id) => byId.get(id)).filter((w): w is WorkItem => Boolean(w));
}

export async function getAssignedToMe(_client: unknown): Promise<WorkItem[]> {
  const s = getControl().workItemPaletteScenario;
  getControl().invocations.push({ command: 'workitems.getAssignedToMe' });
  if (s.assignedToMeBehavior === 'pending') return new Promise(() => {});
  if (s.assignedToMeBehavior === 'reject') throw new Error('storybook: getAssignedToMe failed');
  return s.assignedToMe;
}

export async function searchWorkItemsByIdPrefix(_client: unknown, prefix: string): Promise<WorkItem[]> {
  const s = getControl().workItemPaletteScenario;
  getControl().invocations.push({ command: 'workitems.searchWorkItemsByIdPrefix', args: { prefix } });
  if (s.searchBehavior === 'pending') return new Promise(() => {});
  if (s.searchBehavior === 'reject') throw new Error('storybook: search failed');
  return s.searchPool.filter((w) => String(w.id).startsWith(prefix));
}

export async function searchWorkItemsByText(_client: unknown, text: string): Promise<WorkItem[]> {
  const s = getControl().workItemPaletteScenario;
  getControl().invocations.push({ command: 'workitems.searchWorkItemsByText', args: { text } });
  if (s.searchBehavior === 'pending') return new Promise(() => {});
  if (s.searchBehavior === 'reject') throw new Error('storybook: search failed');
  const lower = text.toLowerCase();
  return s.searchPool.filter((w) => {
    const title = (w.fields['System.Title'] as string | undefined) ?? '';
    const assignedField = w.fields['System.AssignedTo'];
    const assigned =
      typeof assignedField === 'string'
        ? assignedField
        : (assignedField as { displayName?: string } | undefined)?.displayName ?? '';
    return title.toLowerCase().includes(lower) || assigned.toLowerCase().includes(lower);
  });
}
```

The scenario shape lives in `control.ts`:

```ts
export interface WorkItemPaletteScenario {
  workItems: WorkItem[];                 // pool indexed by id for getWorkItems
  assignedToMe: WorkItem[];
  searchPool: WorkItem[];                // pool the search functions filter
  browseBehavior: 'normal' | 'pending' | 'reject';
  assignedToMeBehavior: 'normal' | 'pending' | 'reject';
  searchBehavior: 'normal' | 'pending' | 'reject';
}
```

Default: every array empty, every behavior `'normal'`. `reset()` resets to this default.

#### `control.ts` extensions

Add to `StorybookTauriControl`:

```ts
// Phase 8 fields
workItemPaletteScenario: WorkItemPaletteScenario;
webviewWindowsCreated: Array<{ label: string; options: Record<string, unknown> }>;
```

Both are reset by `reset()`. `webviewWindowsCreated` defaults to `[]`.

### Stories file pattern

`WorkItemPaletteApp.stories.tsx` mirrors Phase 6's `WorkItemDetailApp.stories.tsx` pattern:

1. A `WorkItemPaletteHarness` wrapper that:
   - Calls `getControl().reset()` (defensive — global preview decorator already does it).
   - Sets `getControl().workItemPaletteScenario = ...` from `params.scenario`.
   - Sets `getControl().invokeResponses['load_settings'] = canonicalSettings(params.scenarioOverrides?.settings)`. The canonical settings include `azureDevOps.organization`, `project`, `personalAccessToken: 'pat'`, `authMethod: 'pat'`, `recentWorkItemIds`, and `workingOnWorkItemIds`.
   - Sets `getControl().invokeResponses['save_settings'] = undefined` (success).
   - Renders `<WorkItemPaletteApp />` inside a fixed-size box (`width: 480px; height: 600px`) matching the production palette aspect ratio.
2. A `story()` helper that wires up parameters into the harness.

`canonicalSettings(overrides)` lives in the fixtures file as a tiny helper. Defaults match the canonical Settings store output. Future ADO/Settings stories will reuse it.

### Theme

The Phase 1 global toolbar (`light`/`dark`/`system`) covers `WorkItemPaletteApp` because the hook applies theme via `document.documentElement.classList.toggle('dark', ...)` based on the loaded `settings.ui.theme`. Like Phase 6, the toolbar's preview decorator runs after the production effect and wins the final paint.

### Fixtures

`src/components/work-item-palette/__fixtures__/work-item-palette-data.ts`:

```ts
import type { AppSettings } from '@/types/settings';
import type { WorkItem } from '@/types/work-item';

export function canonicalSettings(overrides?: Partial<AppSettings>): AppSettings { ... }
export function makePaletteWorkItem(overrides?: Partial<WorkItem>): WorkItem { ... }

// Curated browse pools
export const browsePoolMixed:        WorkItem[];   // 8 items spanning multiple states + types
export const assignedToMePool:       WorkItem[];   // 4 items
export const recentIds:              number[];
export const workingOnIds:           number[];

// Curated search pool
export const searchPoolMixed:        WorkItem[];   // 12 items with diverse IDs / titles / assignees

// Scenario presets
export const emptyBrowseScenario;
export const fullBrowseScenario;
export const onlyWorkingOnScenario;
export const onlyAssignedScenario;
export const onlyRecentScenario;
// ...etc.
```

`WorkItem` is imported from production types — never redeclared.

## Story Catalog (24 stories)

Estimated breakdown:

### Browse-state axis (4)
1. **EmptyBrowse** — settings.workingOnIds = [], recentIds = [], assignedToMe = []. Shows the "Type to search work items" empty placeholder.
2. **LoadingBrowse** — `browseBehavior = 'pending'` and `assignedToMeBehavior = 'pending'`. Shows the spinner + "Loading...".
3. **BrowseFullSections** — all three sections present (Working On / Assigned to Me / Recent).
4. **BrowsePartialSections** — only Recent + Assigned to Me (no Working On).

### Section-shape axis (4)
5. **OnlyWorkingOn** — only Working On section visible.
6. **OnlyAssignedToMe** — only Assigned to Me section.
7. **OnlyRecent** — only Recent section.
8. **DedupAcrossSections** — same id appears in working-on AND recent → only shown in Working On (the dedup branch in the `browseSections` memo).

### Search-state axis (5)
9. **SearchTypeTooShortText** — searchText set to `"a"` via play function → "Type at least 2 characters".
10. **SearchTypeTooShortNumeric** — searchText `"5"` → "Type at least 2 digits".
11. **SearchInFlight** — `searchBehavior = 'pending'`. Play types `"work"`, advances debounce timer; status shows "Searching..." with spinner.
12. **SearchNoResults** — searchPool empty, query `"missing"` → "No results".
13. **SearchOneResult** — searchPool has one match for `"login"` → "1 result".

### Search-content axis (3)
14. **SearchByIdPrefix** — query `"12"` → matches IDs 12, 120, 124.
15. **SearchByTextTitle** — query `"auth"` → matches titles containing "auth".
16. **SearchByTextAssignee** — query `"alex"` → matches by AssignedTo display name.

### Search-failure axis (2)
17. **SearchFailed** — `searchBehavior = 'reject'`. Play types `"work"`, advances debounce; status reads "Search failed".
18. **AdoNotConfigured** — settings has empty `azureDevOps.organization`. Play types `"x"`. Behaviour matches production (`getClient` returns null → "ADO not configured").

### Interaction axis (4)
19. **HoverHighlightsRow** — play hovers the second row → asserts the `bg-[var(--color-accent-subtle)]` class lands on it (visible-state assertion).
20. **EnterOpensDetailWindow** — play arrow-down + Enter on first row → asserts `getControl().webviewWindowsCreated` contains an entry with `label: 'workitem-detail-<id>'`.
21. **EscapeHidesPalette** — play presses Escape → asserts `invocations` contains `window.hide`.
22. **DragHandleStartsDrag** — play mousedown on the drag region → asserts `invocations` contains `window.startDragging`.

### Lifecycle axis (2)
23. **WindowReadyOnMount** — story renders; after one rAF asserts `invocations` contains `window_ready`.
24. **PaletteShownEventResetsState** — story types `"abc"` then emits `palette-shown`. Asserts the input clears.

**Total: 24 stories.**

## Tooling additions

### `package.json`
No changes. Storybook deps installed in Phase 1 are sufficient.

### `tsconfig.json`
Existing globs already cover the new fixtures and stories paths. No changes.

### Biome
Phase 1 already extended `biome.json` to cover `.storybook/`. Nothing to add.

### Test suites
- **Vitest:** untouched. The new fixtures may be incidentally imported by future tests, but Phase 8 doesn't add vitest tests.
- **Playwright:** untouched.

## Risks & mitigations

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| `useWorkItemPaletteSearch` reads `localStorage` for saved position; stale state across stories. | medium | Global preview decorator extended (additively) to call `localStorage.removeItem('borgdock-palette-position')` before each render. Documented in the harness so future palette stories pick it up. |
| The hook's `setSearchText` debounce timer (300ms) would force every search story to advance fake timers. | medium | Stories use real timers + `waitFor` on the visible status text rather than fake timers, matching the Phase 5 / Phase 6 conventions. The 300ms is short enough that `waitFor` (default 1000ms timeout) is fine. |
| `WebviewWindow` constructor in production is called from a *dynamic* import (`await import('@tauri-apps/api/webviewWindow')`). Will Vite's alias rewrite reach the dynamic import? | low | Yes — Phase 6's `LogicalPosition` is also dynamically imported (in `useWorkItemPaletteSearch`), and Phase 3/4 verified the dpi alias handles it. Vite resolves dynamic imports through the same alias map. |
| `AdoClient` constructor runs but no methods are called. Same as Phase 6. | low | Verified the constructor is side-effect-free. The aliased workitems module ignores the client argument. |
| Phase 7 (File Palette, parallel) collides with our `tauri-api-window.ts` extension. | low | File Palette adds `onFocusChanged` (a different method); we add `startDragging`. Both are additive interface members + additive method impls — `git merge` will combine cleanly. Same precedent as Phase 6's `setTitle` vs Phase 3's `setSize`. |
| Phase 6's `services-ado-workitems` stub-throws were specifically designed so the next consumer would replace them — but a Phase-6 story might accidentally rely on the old stub-throw. | low | Phase 6's stories only call the WorkItemDetail-specific functions (`getWorkItem`, `getWorkItemTypeStates`, …). The four palette-shaped functions are not touched by any Phase-6 story or fixture. Verified by greping `WorkItemDetailApp.stories.tsx` and `work-item-data.ts` for the four function names — zero hits. |
| `useWorkItemPaletteSearch`'s `selectAndClose` dynamically imports `@tauri-apps/api/webviewWindow`; our mock alias replaces it. The constructor records on `webviewWindowsCreated`. But the production code never `await`s the constructor — it just calls `new WebviewWindow(...)` and continues. | low | Fine — the constructor is synchronous in both production and our mock. The `webviewWindowsCreated.push` happens before the next microtask. The play function asserts after `waitFor`. |
| Story count drift if a future code change adds a new section. | low | Plan's Final Verification pins `grep -c "^export const " WorkItemPaletteApp.stories.tsx` to `24`. Future PRs that add stories must update the assertion. |

## Acceptance criteria

1. `cd src/BorgDock.Tauri && npm run storybook` boots without errors. All 24 stories render.
2. Light/dark toolbar toggle re-renders every story without reload.
3. `npm run build-storybook` completes.
4. `npm run lint` and `npm run test` pass.
5. Production code is byte-identical (`git diff origin/master...storybook-phase8-work-item-palette -- <production paths> ':(exclude)<fixtures>' ':(exclude)<stories>'` shows zero lines).
6. `.storybook/mocks/` gains exactly zero new files (the four mock changes are all extensions to existing files: `control.ts`, `tauri-api-window.ts`, `tauri-api-webviewWindow.ts`, `services-ado-workitems.ts`); `main.ts` gains zero new alias entries.
7. The roadmap (`docs/superpowers/specs/storybook-roadmap.md`) is updated in the same PR: Work Item Palette moves from "Pending" to "Done" with the spec/plan/PR links.
8. Production work-item-palette flow remains functional in the Storybook harness (palette-shown event resets state, position is saved on move, `selectAndClose` records a `WebviewWindow` construction).

## What comes next (out of scope here)

- **File Palette (Phase 7, parallel):** consumes `getCurrentWindow().onFocusChanged` (already added as an extension to the same `tauri-api-window.ts`). No conflict with our extension.
- **Pr Detail (Phase 11):** likely consumes `WebviewWindow` constructor for child windows — drop-in.
- **Settings (Phase 10):** likely consumes `WebviewWindow` constructor for the connection-editor and self-test result child windows.
- **Component-level stories** for `WorkItemPaletteRow` — easier now that the parent's stories surface its states.
