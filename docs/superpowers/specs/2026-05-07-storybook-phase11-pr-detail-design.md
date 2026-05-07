# Storybook Phase 11 — PR Detail

**Status:** design approved, plan pending
**Scope:** add an exhaustive Storybook catalog for the PR Detail window — `src/BorgDock.Tauri/src/pr-detail-main.tsx` → `src/BorgDock.Tauri/src/components/pr-detail/PRDetailApp.tsx`. This phase covers (i) `PRDetailApp.stories.tsx` for the window-shell load/error states, (ii) `PRDetailPanel.stories.tsx` for the whole panel, (iii) one `<Tab>.stories.tsx` per of the 5 tabs, (iv) one stories file each for `CheckoutPanel`, `MergeReadinessChecklist`, `ReviewComposer`. Four new mock aliases (`@/services/github/pulls`, `@/services/github/checks`, `@/services/github/auth`, `@/services/pr-actions`), two new control-surface fields, no production code changes.

## Why

Per `docs/superpowers/specs/storybook-roadmap.md`, this is the eleventh window to be storied — the second window in wave 2b and the second-to-last window overall. PR Detail is the largest feature-content window in the app: 5 tabs, 8 auxiliary components (~5000 LOC across `components/pr-detail/`), and the heaviest fan-out into network-bound GitHub services. Storying it matters because:

- **Visual catalog of the entire PR-review surface.** Five tabs × multiple states × auxiliary components (CheckoutPanel, MergeReadinessChecklist, ReviewComposer, ActionBar, ActivityStrip, MergedCard) means the catalog covers ~80% of the PR-review UI without needing component-level stories.
- **First storied window with non-trivial GitHub HTTP services.** Phases 1–10 either avoided HTTP entirely or used `invoke`-only Rust-backed data. PR Detail's `PrDetailApp` calls `getOpenPRs` + `getCheckRunsForRef` directly. Mocking `@/services/github/{pulls,checks,auth}` is new — but it's the right unblock for Phase 12 (Main/Sidebar) which uses the same services.
- **Click-through action testing.** Per user-approved scope, this phase introduces play-function-driven click-through stories for the headline actions (merge / close / mark-ready) plus ReviewComposer's prop-callback flow (approve / comment). The action mocks live at `@/services/pr-actions` (the network-mutation layer that `usePrActions` calls into) — `mergePr`, `bypassMergePr`, `closePr`, `toggleDraftPr` record into `getControl().invocations` and return controllable booleans. The `usePrActions` hook itself runs unmodified, so its `actionStatus` text, `confirmClose` state, and `isReady` calculation remain faithful to production. First storybook phase to verify *interaction* in addition to *render*.
- **Implicit shake-out for `shared/primitives/Tabs`, `Pill`, `Ring`, `TitleBar`, `Avatar`, `IconButton`, `WindowControls`, `ConfirmDialog`.** Like Phase 10 with Settings primitives, PR Detail provides implicit usage data on the higher-level shared components without committing to a dedicated primitive showcase phase.

## Non-Goals

- **Standalone stories for `shared/primitives/*`** (Tabs, Pill, Ring, TitleBar, Avatar, IconButton, WindowControls, ConfirmDialog). Same scoping rationale as Phase 10 — defer to a dedicated cross-cutting phase.
- **Standalone stories for the `diff/` subdir** (`DiffFileSection`, `DiffFileTree`, `DiffLineContent`, `DiffLineRow`, `DiffToolbar`, `SplitDiffView`, `UnifiedDiffView`). Covered implicitly via `FilesTab.stories.tsx`. A future per-component phase can add focused diff-component stories.
- **Standalone stories for `discussion/buildDiscussionItems.ts`** — pure logic, no UI, has its own vitest suite.
- **Standalone stories for `ActionBar`, `ActivityStrip`, `MergedCard`, `LinkedWorkItemBadge`, `CommentItem`, `ReviewItem`, `InlineThread`, `CodeThreadCard`.** Covered implicitly via the parent tab and panel stories.
- **Visual regression / Chromatic / Storybook test-runner integration.** Deferred per roadmap.
- **Hero-shot pipeline integration.** Deferred per roadmap.
- **Touching production code** under `src/components/pr-detail/`, `src/pr-detail-main.tsx`, `src/services/github/`, `src/services/cache.ts`, `src/stores/{pr-store,ui-store,settings-store,pr-detail-jump-store}.ts`, or any production file outside the Storybook config + new fixtures + new stories paths. Verified at end-of-phase via `git diff` (see Acceptance criteria).
- **Storying `disableDefaultContextMenu()`** — lives in `pr-detail-main.tsx` (the Tauri entry); stories don't render it.
- **Storying `attachConsoleBridge()` / `attachConsoleBridge`-routed logs.** Bootstrap concern; not a UI state.
- **Storying the post-action panel-refresh wire.** When a story's play function records `prAction.merge`, we don't dispatch a synthetic `PR_REFRESHED_EVENT` to flip the panel to "merged" — the *visual* "merged" state is already covered by the `Merged` story which poses by fixture. Click-through stories assert *invocation*, not post-render state. Keeps play functions simple and stable.
- **Storying `usePrDetailJumpStore` deep-link arrival** (the cross-window "jump to thread X" wire). Not visually distinct from the parent thread story; the jump is mid-render scroll behaviour, fragile to assert.
- **Storying every `services/github/auth` PAT shape.** The mock returns the configured PAT or a fixed dummy; we don't enumerate auth failure modes here.
- **Storying `pr-actions` failure paths beyond the headline three.** The action mock supports `prActionResponses[name] === '__throw__'` for any function, but we story the failure axis only for `mergePr` (the visual `Merge failed` status banner in OverviewTab) — the others have identical UI behaviour.
- **Storying `useClaudeActions.resolveConflicts`.** `usePrActions.onResolveConflicts` calls into Claude's worktree-launch flow; out of scope here. The `MergeConflict` story poses the *button* but does not click it.

## Constraints

- **No production code changes.** Verified at end-of-phase via:
  ```
  git diff origin/master...storybook-phase11-pr-detail -- \
    src/BorgDock.Tauri/src/components/pr-detail \
    src/BorgDock.Tauri/src/pr-detail-main.tsx \
    src/BorgDock.Tauri/src/services/github \
    src/BorgDock.Tauri/src/services/cache.ts \
    src/BorgDock.Tauri/src/stores \
    ':(exclude)src/BorgDock.Tauri/src/components/pr-detail/__fixtures__' \
    ':(exclude)src/BorgDock.Tauri/src/components/pr-detail/*.stories.tsx'
  ```
  showing zero changes.
- Storybook 9 + React-Vite + Tailwind v4 setup stays as-is. Only additive changes to `.storybook/main.ts` (four new string-form alias entries).
- Two new fields on `window.__borgdock_storybook_tauri` (`githubResponses`, `prActionResponses`); existing fields untouched. `control.ts::reset()` clears the new fields on every story render.
- **Wave 2b is sequential.** No parallel agents on adjacent storybook phases. The mock-layer + control-surface commit lands first; fixtures second; story commits per file follow.

## Architecture

### File layout

```
src/BorgDock.Tauri/
├── .storybook/
│   ├── main.ts                                        # 4 new string aliases
│   └── mocks/
│       ├── control.ts                                 # +2 fields, +reset() clears
│       ├── services-github-pulls.ts                   # NEW
│       ├── services-github-checks.ts                  # NEW
│       ├── services-github-auth.ts                    # NEW
│       └── services-pr-actions.ts                     # NEW (mock for @/services/pr-actions)
└── src/components/pr-detail/
    ├── __fixtures__/
    │   └── pr-detail-data.ts                          # PR fixtures + decorators + helpers
    ├── PRDetailApp.stories.tsx                        # 5 stories
    ├── PRDetailPanel.stories.tsx                      # 4 stories
    ├── OverviewTab.stories.tsx                        # 6 stories
    ├── FilesTab.stories.tsx                           # 6 stories
    ├── ChecksTab.stories.tsx                          # 5 stories
    ├── CommitsTab.stories.tsx                         # 3 stories
    ├── DiscussionTab.stories.tsx                      # 5 stories
    ├── CheckoutPanel.stories.tsx                      # 7 stories
    ├── MergeReadinessChecklist.stories.tsx            # 3 stories
    └── ReviewComposer.stories.tsx                     # 4 stories
```

Total story files: 10. Total stories: ~48.

### Mock-layer extensions

Four new string aliases in `.storybook/main.ts` `viteFinal.resolve.alias`:

| Alias | Mock module |
|---|---|
| `@/services/github/pulls` | `mocks/services-github-pulls.ts` |
| `@/services/github/checks` | `mocks/services-github-checks.ts` |
| `@/services/github/auth` | `mocks/services-github-auth.ts` |
| `@/services/pr-actions` | `mocks/services-pr-actions.ts` |

All four are package-level aliases — no regex form required, no production code touched. `usePrActions` (the hook in `components/pr-detail/usePrActions.ts`) runs unmodified, but its inner imports of `mergePr`/`bypassMergePr`/`closePr`/`toggleDraftPr` are intercepted by the alias.

`mocks/services-github-pulls.ts`:

```ts
// Drop-in replacement for @/services/github/pulls. PrDetailApp calls
// getOpenPRs(client, owner, repo); we ignore `client` and read responses
// from getControl().githubResponses.getOpenPRs.

import type { PullRequest } from '@/types';
import { getControl } from './control';

export async function getOpenPRs(
  _client: unknown,
  owner: string,
  repo: string,
): Promise<PullRequest[]> {
  const r = getControl().githubResponses.getOpenPRs;
  if (typeof r === 'function') return r({ owner, repo });
  return r ?? [];
}
```

`mocks/services-github-checks.ts` and `mocks/services-github-auth.ts` follow the same shape, reading `githubResponses.getCheckRunsForRef` and `githubResponses.tokenGetter` respectively. Auth mock defaults to returning the PAT it's passed (`async (pat: string) => pat`).

`mocks/services-pr-actions.ts`:

```ts
// Drop-in replacement for @/services/pr-actions. Each mutation records the
// call into getControl().invocations and returns true (success). The story
// can override behaviour via getControl().prActionResponses[name]:
//   - '__throw__' → reject with an Error
//   - '__fail__'  → resolve to false (production calls onError)
//   - function    → call it; the function's return value is the result

import type { PrRef, MergePrOpts, ActionOpts, ClosePrInput, ToggleDraftInput, RerunChecksInput, CheckoutInput, CheckoutResult } from '@/services/pr-actions';
import { getControl } from './control';

type Behavior = '__throw__' | '__fail__' | ((args: unknown) => unknown);

async function record<T>(name: string, args: unknown, defaultResult: T): Promise<T> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: `prAction.${name}`, args });
  const override = ctrl.prActionResponses[name] as Behavior | undefined;
  if (override === '__throw__') throw new Error(`mock prAction.${name} threw`);
  if (override === '__fail__') return false as unknown as T;
  if (typeof override === 'function') return (await override(args)) as T;
  return defaultResult;
}

export async function mergePr(pr: PrRef, opts?: MergePrOpts): Promise<boolean> {
  return record('mergePr', { pr, opts }, true);
}
export async function bypassMergePr(pr: PrRef, opts?: ActionOpts): Promise<boolean> {
  return record('bypassMergePr', { pr, opts }, true);
}
export async function closePr(pr: ClosePrInput, opts?: ActionOpts): Promise<boolean> {
  return record('closePr', { pr, opts }, true);
}
export async function toggleDraftPr(pr: ToggleDraftInput, opts?: ActionOpts): Promise<boolean> {
  return record('toggleDraftPr', { pr, opts }, true);
}
export async function rerunChecks(input: RerunChecksInput, opts?: ActionOpts): Promise<boolean> {
  return record('rerunChecks', { input, opts }, true);
}
export async function checkoutPrBranch(input: CheckoutInput, opts?: ActionOpts): Promise<CheckoutResult | null> {
  return record('checkoutPrBranch', { input, opts }, { worktreePath: '/tmp/wt', terminalLaunched: true } as unknown as CheckoutResult);
}
export async function openPrInBrowser(htmlUrl: string, opts?: ActionOpts): Promise<boolean> {
  return record('openPrInBrowser', { htmlUrl, opts }, true);
}
```

The mock re-exports every function from `@/services/pr-actions` with matching signatures. If the production module adds, removes, or renames an export, TS will fail Storybook's `npm run build-storybook` — that's the desired drift detector. (The actual list of exports is verified during the plan's first task by reading the source file.)

### Control-surface additions (`mocks/control.ts`)

```ts
export type GithubResponses = {
  getOpenPRs?:
    | PullRequest[]
    | ((args: { owner: string; repo: string }) => PullRequest[] | Promise<PullRequest[]> | Promise<never>);
  getCheckRunsForRef?:
    | CheckRun[]
    | ((args: { ref: string }) => CheckRun[] | Promise<CheckRun[]> | Promise<never>);
  tokenGetter?: () => string | Promise<string>;
};

export type PrActionResponses = Record<string, '__throw__' | '__fail__' | ((args: unknown) => unknown)>;

interface Control {
  // …existing fields…
  githubResponses: GithubResponses;
  prActionResponses: PrActionResponses;
}

// reset() clears both:
function reset(): void {
  // …existing resets…
  control.githubResponses = {};
  control.prActionResponses = {};
}
```

Function-form responses for `getOpenPRs` / `getCheckRunsForRef` cover never-resolves (`() => new Promise(() => {})`) and rejection (`() => Promise.reject(new Error(...))`) without new fields.

### Hydration: two patterns

Stories use one of two patterns:

1. **Direct-prop seeding** — used by `PRDetailPanel.stories.tsx`, all 5 tab stories, `MergeReadinessChecklist.stories.tsx`, `ReviewComposer.stories.tsx`. The component takes `pr: PullRequestWithChecks` (or a derivative) as a prop. Stories pass a fixture preset directly. No invokes, no GitHub responses touched. Tab stories use `<PanelFrame>` to pose the surrounding chrome (window-style background, scroll container).

2. **Mocked-services seeding** — used by `PRDetailApp.stories.tsx` and `CheckoutPanel.stories.tsx`. Stories set `getControl().githubResponses.*` (App) or `getControl().invokeResponses['list_worktrees' | 'list_worktrees_bare' | 'checkout_pr']` (CheckoutPanel). The new GH mock modules read from `getControl().githubResponses` on every call.

The `withPrDetail` decorator centralizes setup:

```ts
import type { Decorator } from '@storybook/react-vite';
import type { AppSettings, PullRequestWithChecks } from '@/types';
import { useSettingsStore } from '@/stores/settings-store';
import { getControl, type GithubResponses, type PrActionResponses } from '../../../.storybook/mocks/control';

export interface WithPrDetailOptions {
  settings?: Partial<AppSettings>;
  injectedPrParams?: { owner: string; repo: string; number: number } | null; // null = leave unset
  invokeResponses?: Record<string, unknown>;
  githubResponses?: Partial<GithubResponses>;
  prActionResponses?: PrActionResponses;
}

export function withPrDetail(pr: PullRequestWithChecks | null, options: WithPrDetailOptions = {}): Decorator {
  return (Story) => {
    const ctrl = getControl();
    Object.assign(ctrl.invokeResponses, options.invokeResponses ?? {});
    Object.assign(ctrl.githubResponses, options.githubResponses ?? {});
    Object.assign(ctrl.prActionResponses, options.prActionResponses ?? {});
    if (options.injectedPrParams !== null) {
      (window as unknown as Record<string, unknown>).__BORGDOCK_PR_DETAIL__ =
        options.injectedPrParams ?? { owner: 'borght-dev', repo: 'BorgDock', number: pr?.pullRequest.number ?? 1 };
    } else {
      delete (window as unknown as Record<string, unknown>).__BORGDOCK_PR_DETAIL__;
    }
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, ...(options.settings ?? {}) } as AppSettings,
      hasLoaded: true,
    });
    return <Story />;
  };
}
```

The preview decorator already calls `getControl().reset()` before each story, so the seed runs against fresh state.

## Story Catalog (exhaustive — ~48 stories)

### Window-shell — `PRDetailApp.stories.tsx` (5)

| Story | Axis |
|---|---|
| `Default` | Settings + `__BORGDOCK_PR_DETAIL__` set; `githubResponses.getOpenPRs = [openPr.pullRequest]`; `getCheckRunsForRef = openPr.checks`. Renders the full panel after hydrate (Overview tab, mergeable, all checks pending). |
| `LoadingNetwork` | Same setup but `getOpenPRs = () => new Promise(() => {})`. Spinner + preload header visible indefinitely. |
| `MissingParams` | `injectedPrParams: null`, no query string. Error text "Missing PR parameters (owner, repo, number)". |
| `PrNotFound` | `getOpenPRs = []`. Error text "PR #N not found in owner/repo". |
| `LoadSettingsRejects` | `invokeResponses['load_settings'] = '__throw__'`. Catch branch fires; "Failed to load pull request" rendered. |

### Panel-level — `PRDetailPanel.stories.tsx` (4)

| Story | Axis |
|---|---|
| `Default` | `openPr`, Overview tab active, `popOutWindow={true}`. The canonical "this is the panel." |
| `EmbeddedInSidebar` | Same fixture, `popOutWindow={false}`. WindowControls swap to embedded variant; close button anchors to sidebar host. |
| `Merged` | `mergedPr`, Overview active. `MergedCard` is the body content; ActionBar dims merge-related buttons. |
| `Closed` | `closedPr`, Overview active. Closed banner; reopen affordance. |

### OverviewTab.stories.tsx (6)

| Story | Axis |
|---|---|
| `OpenWithChecksRunning` | `openPr`. ActionBar shows merge button as disabled-pending. ActivityStrip shows in-progress runs. |
| `OpenAllGreenMergeable` | `approvedPr`. Merge button enabled. |
| `ChangesRequested` | `changesRequestedPr`. ActionBar shows ChangesRequested badge; merge button disabled. |
| `MergeConflict` | `mergeConflictPr`. MergeReadinessChecklist row "no conflicts" red. |
| `StaleChecks` | `staleChecksPr`. Banner / pill indicating checks are for an older HEAD. |
| `Draft` | `draftPr`. ActionBar exposes "Mark ready for review"; merge dimmed. |

### FilesTab.stories.tsx (6)

| Story | Axis |
|---|---|
| `SmallDiff` | 1 file changed, ~20 lines. Default split-view. |
| `BigDiffOverflow` | 50 files changed, exercises file-tree scroll + virtualization. |
| `BinaryFile` | One binary file in the diff. "Binary file not shown" placeholder. |
| `Renamed` | One renamed file with no content delta. |
| `Deleted` | One deleted file. |
| `WithInlineThread` | Diff anchored to a thread (DiscussionTab thread linked on a specific line). |

### ChecksTab.stories.tsx (5)

| Story | Axis |
|---|---|
| `AllPending` | All checks `status: 'in_progress'` or `'queued'`. |
| `AllGreen` | All `success`. |
| `MixedSuccessFailure` | 4 success + 2 failure. Failed rows expandable to log preview. |
| `AllFailedExpandable` | 6 failures. Each expands to show its failure summary. |
| `NoChecks` | Empty checks array. Empty-state text. |

### CommitsTab.stories.tsx (3)

| Story | Axis |
|---|---|
| `SingleCommit` | One commit. |
| `ManyCommits` | 12 commits with mixed authors. |
| `MixedSignedUnsigned` | Half signed (verified badge), half unsigned. |

### DiscussionTab.stories.tsx (5)

| Story | Axis |
|---|---|
| `Empty` | No comments, no reviews. |
| `MixedThreadsResolvedAndOpen` | Multiple code threads + general comments, mix of resolved/unresolved. |
| `CodeThreadOnly` | Only inline code threads, no general comments. |
| `GeneralCommentsOnly` | Only general comments, no code threads. |
| `ComposerActive` | `richDiscussionPr` + play function focuses the ReviewComposer. |

### CheckoutPanel.stories.tsx (7)

| Story | Axis |
|---|---|
| `NoWorktrees` | `invokeResponses['list_worktrees_bare'] = []` and `'list_worktrees' = []`. Default state. |
| `OneRepoNoWorktrees` | Same as above; clarifies the single-repo render. |
| `ExistingWorktreeForBranch` | `list_worktrees` returns one entry whose branch matches the PR's headRef. "Open existing" affordance. |
| `MultipleWorktreesPickByPath` | `list_worktrees` returns 3 entries; user picker visible. |
| `CheckoutSuccess` | `invokeResponses['checkout_pr'] = (args) => ({ success: true, path: '/tmp/wt' })`. Play function clicks Checkout; success state recorded. |
| `CheckoutFailureGitConflict` | `invokeResponses['checkout_pr'] = '__throw__'`. Play function clicks Checkout; error inline. |
| `ListWorktreesError` | `invokeResponses['list_worktrees'] = '__throw__'`. Error state at top of panel. |

### MergeReadinessChecklist.stories.tsx (3)

| Story | Axis |
|---|---|
| `AllChecksGreen` | `approvedPr`. All rows green. |
| `BlockedByFailingCheck` | One failing check, otherwise mergeable. Failing-check row red. |
| `BlockedByMergeConflict` | `mergeConflictPr`. Conflict row red. |

### ReviewComposer.stories.tsx (4)

| Story | Axis |
|---|---|
| `Empty` | Composer mounted, no comment text. |
| `WithComment` | Pre-filled comment text. |
| `Submitting` | `prActionResponses['submitReview'] = () => new Promise(() => {})`. Play function clicks Submit; spinner state. |
| `SubmitFailure` | `prActionResponses['submitReview'] = '__throw__'`. Play function clicks Submit; inline error. |

### Action click-through play functions

Five play functions, attached to existing stories rather than new ones:

| Story | Play action | Asserts |
|---|---|---|
| `OverviewTab > OpenAllGreenMergeable` | click "Merge" | `getControl().invocations` contains `{ command: 'prAction.mergePr' }` |
| `OverviewTab > Draft` | click "Mark ready for review" | `prAction.toggleDraftPr` recorded |
| `OverviewTab > OpenWithChecksRunning` | click "Close" → confirm dialog → click confirm | `prAction.closePr` recorded |
| `ReviewComposer > WithComment` | switch decision to "Approve", click submit | story's `onSubmit` spy called with `{ kind: 'review', decision: 'approve', body: '...' }` |
| `ReviewComposer > WithComment` | mode="comment", click submit | story's `onSubmit` spy called with `{ kind: 'comment', body: '...' }` |

The first three rows assert against `getControl().invocations` (the mocked `services/pr-actions` records there). The last two rows assert against a story-local Vitest spy passed as `onSubmit` — `ReviewComposer` is a presentation component with no service imports, so its tests are purely prop-driven.

No post-state assertion on the OverviewTab rows (panel doesn't auto-refresh in stories). Click-through verifies wiring; visual post-state is covered by the parallel fixture-posed story (`Merged`, `Closed`, etc.).

## Tooling additions

### `package.json`

No new dependencies.

### `tsconfig.json`

No changes. Stories under `src/components/pr-detail/*.stories.tsx` are picked up by the existing `include` patterns.

### Biome

No changes.

### Test suites

- Existing vitest tests under `src/components/pr-detail/__tests__/`, `pr-detail/diff/__tests__/`, `pr-detail/discussion/__tests__/` continue to pass unchanged.
- Stories add no new vitest tests directly. Click-through play functions execute under Storybook's test-runner if invoked, but we don't add a test-runner step in this phase.

## Risks & mitigations

1. **`@/services/pr-actions` mock surface drift.** `mergePr`, `bypassMergePr`, `closePr`, `toggleDraftPr`, `rerunChecks`, `checkoutPrBranch`, `openPrInBrowser` are the seven exports we re-implement. If production adds an eighth, anything in `usePrActions` (or any other consumer) that imports the new export will fail at Storybook bundle time. Mitigation: the mock imports its parameter / return types from production, so a signature drift fails TS check. A net-new export will fail at runtime under Storybook (Vite resolves the alias and the mock has no such export). Plan's drift-detection step at end-of-phase: `grep -E "^export (async )?function" src/services/pr-actions.ts | sort` and verify the mock covers them all.

2. **GitHub services mocking surface drift.** `getOpenPRs` and `getCheckRunsForRef` signatures could change in production. Mitigation: mock files import the *type* `typeof getOpenPRs` from production and re-export the same name with an explicit type annotation. TS will fail Storybook's `npm run build-storybook` if the signature drifts.

3. **PullRequestWithChecks fixture size.** The type has many nested fields (reviews, requested reviewers, labels, milestones, head/base refs, mergeable state, draft, …). Mitigation: `makePr` uses a deep-merge over a complete default object derived from a single source of truth (the production type definition). Plan starts with reading `src/types/` for the full shape before writing `makePr`.

4. **Action click-through brittleness.** Play functions clicking buttons inside a deeply-nested ActionBar can break on minor layout changes. Mitigation: prefer accessible-name selectors (`getByRole('button', { name: /merge/i })`) over CSS selectors. Each play function asserts only on `getControl().invocations` content, never on subsequent panel re-render — keeps coupling low.

5. **`PR_REFRESHED_EVENT` decoupling.** The real `pr-actions` functions dispatch `PR_REFRESHED_EVENT` after mutation success; the mocks do NOT. Risk: a future test could expect the panel to re-render after a click. Mitigation: this phase explicitly leaves post-state visual coverage to fixture-posed stories (`Merged`, `Closed`). Documented in Non-Goals.

6. **Zustand store leakage across stories.** `useSettingsStore`, `useUiStore`, `usePrDetailJumpStore` are module singletons. Mitigation: `withPrDetail` decorator runs `setState` unconditionally before each render (Phase 10 pattern). For `useUiStore` and `usePrDetailJumpStore`, the `withPrDetail` decorator resets them to a known baseline.

7. **Tests directory globbing.** Stories live at `src/components/pr-detail/*.stories.tsx`; tests under `src/components/pr-detail/__tests__/`. Mitigation: verify the existing `.storybook/main.ts` `stories` glob excludes `__tests__/` (it does — Storybook's default is `*.stories.@(js|jsx|ts|tsx)` which doesn't recurse into `__tests__/`). Plan re-verifies by running `npm run storybook` and confirming the sidebar lists only the new stories under "PR Detail/...".

8. **`pluginStore` cache hit story (intentionally absent).** `PrDetailApp` reads from cache before fetching; we could story "instant cache render" by seeding `pluginStore`. Decision: not in catalog; would duplicate `Default`'s look. Plan does NOT add this story.

9. **CheckoutPanel scope.** 998 lines could yield 15+ stories. Mitigation: keep to the 7 listed; defer error-edge axes to a future per-component phase.

10. **`__fixtures__/pr-detail-data.ts` size.** ~12 named presets + a `makePr` deep-merge helper + a decorator. Plan keeps each preset under ~30 lines by composing them via `makePr({ pullRequest: { state: 'closed' } })` rather than restating the whole shape.

11. **Roadmap edit conflict.** Wave 2b is sequential, so by the time this PR opens, master has Phase 10 settled. The PR adds row 11 = PR Detail and a new Phase 11 mock-layer note. No row collisions.

## Acceptance criteria

- All ~48 stories render without errors in `npm run build-storybook`.
- `npm run test` passes (existing 2772+ tests stay green; this phase adds zero vitest tests).
- `npm run build-storybook` succeeds and produces a valid `storybook-static/` output.
- Production tree byte-identical to `origin/master` per the `git diff` in Constraints.
- New mock files (`services-github-pulls.ts`, `services-github-checks.ts`, `services-github-auth.ts`, `services-pr-actions.ts`) exist; new alias entries in `.storybook/main.ts` follow the existing string-form pattern.
- `mocks/control.ts` exposes the three new fields and `reset()` clears them.
- Five action click-through play functions execute and assert their respective `invocations` entries when run via Storybook's test-runner, OR if test-runner is not invoked in this phase, their *render* must complete without throwing.
- `docs/superpowers/specs/storybook-roadmap.md` updated:
  - Move PR Detail row from Pending → Done as row 11.
  - Add a "Phase 11 mock-layer extensions" callout block describing the four new string aliases (`@/services/github/pulls`, `@/services/github/checks`, `@/services/github/auth`, `@/services/pr-actions`), the two new control fields (`githubResponses`, `prActionResponses`), and a note that the action mock intercepts the network-mutation layer rather than the `usePrActions` hook (the hook itself runs unmodified).
  - Update the alias inventory list at the top of the mock-layer section.
  - Leave Main/Sidebar as the only remaining Pending row.
- Phase 11 commits ordered: mock-layer + control-surface first, fixtures second, then stories per file (window-shell, panel, tabs in order, then auxiliaries), then roadmap edit last.

## What comes next (out of scope here)

- Phase 12 (Main / Sidebar). The final window. Will reuse the `services/github/{pulls,checks,auth}` mocks added here, plus likely add `services/github/pr-store` and other singleton wiring.
- Cross-cutting `shared/primitives/*` showcase phase. Now strongly motivated — Settings (Phase 10) and PR Detail (Phase 11) together exercise the entire primitives surface.
- Per-component story phase for the `diff/` subdir. PR Detail's `FilesTab` covers them implicitly; a follow-up phase can add focused diff-component stories.
- Storybook test-runner integration. Phase 11 introduces the first click-through play functions; once the test-runner runs them in CI, that's the natural unblock for Visual Regression (Chromatic, Playwright snapshots, etc.).
- Hero-shot pipeline rewire. Now feasible — Storybook URLs cover all 12 windows once Phase 12 lands.
