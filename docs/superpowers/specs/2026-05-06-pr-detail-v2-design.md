# PR Detail v2 — Design Spec

_Date: 2026-05-06_
_Status: Draft, brainstorming complete, awaiting plan_

## Problem

The current PR detail surface (`src/components/pr-detail/`) is a six-tab layout — Overview / Commits / Files / Checks / Reviews / Comments — built around a header card and tab content. Three things hurt it in daily use:

1. **Action discovery requires switching to Overview.** Merge, Open in Browser, Copy Branch, Checkout, Mark Draft, Bypass, Close PR live as a button row inside `OverviewTab`. From any other tab the user has to context-switch back to Overview to act.
2. **In-flight CI is ambient information that's only visible on the Checks tab.** Two checks running for three more minutes is invisible from Files / Reviews / Comments. Users get blindsided when a "ready to merge" PR turns red.
3. **Reviews and Comments are split across two tabs even though they're one conversation.** Worse, code-anchored review threads — the highest-signal review feedback — show up in Reviews as plain text with no code context, and there's no thread / resolved state at all.

The Claude Design v2 mock fixes all three. This spec adapts it to the existing Tauri + React app, reusing primitives in `src/components/shared/primitives/` and the existing GitHub services.

## Goal

Implement the v2 layout end-to-end:

- A persistent **ActionBar** below the PR header carrying every PR action.
- A persistent **ActivityStrip** below the ActionBar showing live "checks running" with a multi-segment progress bar — visible from every tab.
- Header status pills include a yellow "N running" pill.
- Tab badges adapt: Checks shows `passed/total` and a yellow spinner indicator when work is in flight.
- **Checks tab** pins running runs to a top group with a yellow border.
- **Discussion tab** replaces Reviews + Comments. Renders three item kinds: review (verdict event), comment (top-level), code (file:line-anchored thread with snippet preview, reply chain, resolve action). Filter chips (All / Reviews / Comments / On code) + Show resolved toggle.
- **Files tab** gains anchored thread bubbles: a `💬 N` chip on diff lines that have threads, expanding an `InlineThread` row when clicked.
- **Files ↔ Discussion jump:** "View in Files" on a CodeThreadCard switches to Files, scrolls to the line, expands the thread, and highlights the line yellow.

## Non-goals

- Removing inline-sidebar mode (`popOutWindow=false`). Keep working but design and test against pop-out window mode as the primary path.
- Re-skinning Commits or Overview beyond the action-row removal.
- New diff viewer features (split view, syntax highlighting changes, etc.).
- Migrating existing review/comment data formats. New types coexist with current ones until migration completes.
- Changing the polling / cache layer.
- Adding pending-review-comment composition (pending review state). The composer submits review events; per-line draft comments stay out of scope.

## Constraints driving the design

1. **Reuse primitives.** Anything that fits an existing primitive (`Button`, `Pill`, `Chip`, `Card`, `Avatar`, `LinearProgress`, `Tabs`, `IconButton`) must use it. New primitives only when the visual is genuinely new.
2. **No-users-yet.** Per `project_no_users_yet.md` memory — pre-adoption as of 2026-04-23. Renames, type-shape changes, and removing tabs are all free. Don't add migration/back-compat shims.
3. **Pop-out is canonical.** Per user instruction during brainstorming: window mode is the primary surface. Inline mode keeps working with no extra effort but isn't the design target.
4. **Tauri capabilities are per-window.** The `pr-detail` window's existing capabilities cover what's needed (clipboard, opener, dialog already wired for related windows). Verify before testing.
5. **Resolved state requires GraphQL.** The REST review-comments endpoint doesn't expose `isResolved`. Adding a GraphQL `pullRequestReviewThreads` fetch is part of this spec, not deferred.

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│ src/components/pr-detail/                                              │
│                                                                        │
│   PRDetailPanel.tsx        — shell: TitleBar │ Header │ ActionBar      │
│                              │ ActivityStrip │ Tabs │ tab content      │
│   PRDetailApp.tsx           — pop-out window host (unchanged shape)    │
│                                                                        │
│   ActionBar.tsx             — NEW. Sticky toolbar, uses Button.        │
│   ActivityStrip.tsx         — NEW. Click-to-jump-to-Checks summary.    │
│   usePrActions.ts           — NEW. Extracts action handlers + state.   │
│                                                                        │
│   OverviewTab.tsx           — MODIFIED. Loses action row.              │
│   ChecksTab.tsx             — MODIFIED. Pinned "In progress" group.    │
│   FilesTab.tsx              — MODIFIED. Toolbar Submit-review CTA      │
│                              opens inline composer; thread chips on    │
│                              annotated diff lines; jump-to-line.       │
│   ReviewsTab.tsx            — DELETED.                                 │
│   CommentsTab.tsx           — DELETED.                                 │
│                                                                        │
│   DiscussionTab.tsx         — NEW. Replaces Reviews + Comments.        │
│   CodeThreadCard.tsx        — NEW. file:line + snippet + thread.       │
│   CommentItem.tsx           — NEW. Top-level comment card.             │
│   ReviewItem.tsx            — NEW. Verdict event (compact + full).     │
│   InlineThread.tsx          — NEW. Anchored thread bubble in Files.    │
│   ReviewComposer.tsx        — NEW. Comment / review submission. Used   │
│                              by both DiscussionTab and FilesTab.       │
│                                                                        │
│   diff/DiffFileSection.tsx  — MODIFIED. Threads-by-line lookup,        │
│                                forwards thread state to lines.         │
│   diff/DiffLineRow.tsx      — MODIFIED (or new wrapper). Adds chip,    │
│                                onToggleThread, highlight props.        │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│ src/components/shared/primitives/                                      │
│                                                                        │
│   Tabs.tsx                  — MODIFIED. count: number | string;        │
│                                indicator?: ReactNode.                  │
│   SegmentedProgress.tsx     — NEW. Three-segment (done/running/queued) │
│                                with diagonal-stripe march.             │
│   index.ts                  — exports SegmentedProgress.               │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│ src/services/github/                                                   │
│                                                                        │
│   reviewThreads.ts          — NEW. GraphQL pullRequestReviewThreads.   │
│   reviews.ts                — UNCHANGED. (Verdict events stay REST.)   │
│   comments.ts (existing)    — UNCHANGED. Issue-level comments only.    │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│ src/stores/                                                            │
│                                                                        │
│   pr-detail-jump-store.ts   — NEW. zustand. Holds {file, line, ts}     │
│                                + setJumpTarget + clearJumpTarget.      │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│ src/types/                                                             │
│                                                                        │
│   pr-detail.ts              — NEW types or extend existing:            │
│     ReviewThread, ReviewThreadComment, ReviewVerdict,                  │
│     DiscussionItem (review | comment | code-thread)                    │
└────────────────────────────────────────────────────────────────────────┘
```

## Data model

GitHub GraphQL exposes review threads as a tree of comments anchored to a file/line, with `isResolved`. We adopt that shape directly for the new types.

```ts
// src/types/pr-detail.ts

export type ReviewVerdict = 'approved' | 'changes-requested' | 'commented';

export interface ReviewThreadComment {
  id: string;                 // GraphQL node id
  databaseId: number;         // REST id, used for in_reply_to_id
  author: string;             // login
  authorIsBot: boolean;
  body: string;
  createdAt: string;          // ISO
  /** Optional severity tag parsed from body — claude[bot] uses "minor/major/critical". */
  severity?: 'minor' | 'major' | 'critical';
}

export interface ReviewThread {
  id: string;                 // GraphQL node id
  filePath: string;
  /** GitHub's "position" / "originalPosition" — diff line. We always use the latest line. */
  line: number;
  /** Up to ~6 lines of diff context around the anchor; populated client-side from getPRFiles patch. */
  snippet: ReviewThreadSnippetLine[];
  isResolved: boolean;
  resolvedBy?: string;        // login
  comments: ReviewThreadComment[];
}

export interface ReviewThreadSnippetLine {
  /** Line number in the new file. null for deleted lines. */
  lineNumber: number | null;
  /** "+", "-", or " " (context). */
  marker: '+' | '-' | ' ';
  text: string;
  /** True for the anchor line — rendered with yellow highlight. */
  isAnchor: boolean;
}

/** Top-level discussion item — one of three kinds. */
export type DiscussionItem =
  | { kind: 'review'; id: string; author: string; authorIsBot: boolean;
      verdict: ReviewVerdict; body: string | null; createdAt: string; }
  | { kind: 'comment'; id: string; author: string; authorIsBot: boolean;
      body: string; createdAt: string; }
  | { kind: 'code'; thread: ReviewThread };
```

### Fetch path

`src/services/github/reviewThreads.ts` exports:

```ts
async function getReviewThreads(
  client: GitHubClient,
  owner: string,
  repo: string,
  number: number,
): Promise<ReviewThread[]>
```

Implementation: GraphQL query against `repository.pullRequest.reviewThreads(first: 100)`, paginated. Resulting comments hydrated with `databaseId`, `author.login`, `bot`, `body`, `createdAt`. Snippet lines come from a join with the existing `getPRFiles` cached result — we slice ±2 lines from the patch around the anchor and mark the anchor line.

`getReviews` (REST) stays as-is — it produces verdict events (approve / request-changes / commented). Verdicts in the discussion timeline are these events; the bodies of "comment" verdicts get listed alongside the comments, not duplicated as separate items.

### DiscussionTab item flattening

```ts
function buildDiscussionItems(
  reviews: Review[],
  issueComments: ClaudeReviewComment[],
  threads: ReviewThread[],
): DiscussionItem[] {
  const items: DiscussionItem[] = [
    ...reviews.map(r => ({ kind: 'review', ... })),
    ...issueComments.map(c => ({ kind: 'comment', ... })),
    ...threads.map(t => ({ kind: 'code', thread: t })),
  ];
  return items.sort((a, b) => firstTimestamp(a) - firstTimestamp(b));
}
```

Where `firstTimestamp(code)` is the earliest comment in the thread.

### Filter / resolved logic

| Filter | What's shown |
|---|---|
| All | Every item where the thread isn't resolved (or `showResolved` is true) |
| Reviews | Verdict events only |
| Comments | Top-level (issue) comments only |
| On code | Code threads only — resolved threads still hidden unless `showResolved` |

The "Show resolved (N)" toggle replaces the `All` filter's resolved exclusion. N counts only resolved code threads.

## Components — interface and behavior

### ActionBar

```tsx
<ActionBar pr={pr} />
```

Composition (left → right, all using `Button`):

- `Merge` (variant=primary, leading=MergeIcon, disabled when `!isReady`) — only when `isOpen`
- vertical separator
- `Open in Browser`, `Copy Branch`, `Checkout`, `Mark Draft / Mark Ready`
- `✦ Resolve Conflicts` — only when `isOpen && mergeable === false`
- spacer (flex-1)
- `Bypass Merge`, `Close PR` — variant=danger, only when `isOpen`

When PR is closed/merged: only `Open in Browser` + `Copy Branch` are rendered.

State + handlers come from `usePrActions(pr)`. ActionBar is purely presentational.

### usePrActions

```ts
function usePrActions(pr: PullRequestWithChecks): {
  // handlers
  onMerge: () => Promise<void>;
  onBypassConfirm: () => void;
  onCloseConfirm: () => void;
  onToggleDraft: () => Promise<void>;
  onResolveConflicts: () => Promise<void>;
  onOpenInBrowser: () => Promise<void>;
  onCopyBranch: () => Promise<void>;
  onCheckoutToggle: () => void;

  // ui state surfaced for the panel to render
  actionStatus: string;
  isReady: boolean;
  checkoutOpen: boolean;
  setCheckoutOpen: (open: boolean) => void;
  confirmClose: boolean;
  setConfirmClose: (open: boolean) => void;
  confirmBypass: boolean;
  setConfirmBypass: (open: boolean) => void;
}
```

The hook is consumed once at `PRDetailPanel` level. ActionBar receives just the bare handlers + the state booleans it needs. `CheckoutPanel` and the two `ConfirmDialog`s render at panel level too — outside the tab content area — so they overlay regardless of active tab.

### ActivityStrip

Shows when `pr.checks.length > 0`. Hidden when all checks are skipped/cancelled.

```tsx
<ActivityStrip pr={pr} onJumpToChecks={() => setActiveTab('Checks')} />
```

Renders a button (full-width) with:
- Status icon (spinner / alert / check) in a circular badge.
- Headline: "N checks still running" / "N checks failing" / "All checks passed".
- Sub-text: counts ("13/15 passed · 2 in progress").
- Right side: "View checks ▸".
- Below text: `<SegmentedProgress passed={…} running={…} total={…} />`.

Tone (background + border) = red on any failures, yellow on running, green otherwise. When yellow: outer box-shadow halo to draw attention.

### SegmentedProgress (new primitive)

```tsx
<SegmentedProgress passed={number} running={number} total={number} />
```

5px-tall track. Three segments:
1. Solid `var(--color-status-green)` from 0 to `passed/total`.
2. Diagonal-stripe `var(--color-status-yellow)` over `running/total`, animated via `bd-stripe-march` keyframe (defined alongside other `bd-*` keyframes — search project for the existing definition home).
3. Remainder `var(--color-surface-hover)` (queued/empty).

Props are absolute counts, not percentages, so the primitive is the obvious place for the math.

### Tabs primitive change

```ts
export interface TabDef {
  id: string;
  label: string;
  count?: number | string;        // was number
  indicator?: ReactNode;          // new: rendered before label, e.g. yellow Spinner
}
```

`Tabs.tsx` renders `count` via `String(count)` so numbers and `"13/15"` both work. `indicator` renders inside `.bd-tab` before the label text, only when defined. CSS for `.bd-tab__indicator` lives next to `.bd-tab__count` rules.

Existing call sites (settings, work-item detail, focus subtabs) keep working — `count` widening to a union is non-breaking.

### Header running pill

In `PRDetailPanel`'s status pill row, after the existing `passed` pill, when `pr.pendingCount > 0`:

```tsx
<Pill tone="warning" icon={<SpinnerIcon />}>{pr.pendingCount} running</Pill>
```

`Pill` already accepts an `icon` prop. The yellow tone is `'warning'` — extend `PillTone` only if `'warning'` doesn't exist (it does — used by the rate-limit display).

### ChecksTab — pin "In progress"

Inside `ChecksTab`, before the existing grouped suites:

```tsx
{pendingRuns.length > 0 && (
  <Card padding={0} className="border border-[var(--color-status-yellow)] divide-y …">
    <header>
      <SpinnerIcon /> In progress · {pendingRuns.length}
    </header>
    {pendingRuns.map(run => <CheckRow run={run} elapsed={elapsedFor(run)} />)}
  </Card>
)}
```

Existing per-suite grouping keeps below it. `elapsedFor(run)` = wall-clock since `run.startedAt`, formatted `Xm Ys`. The pinned group's row shows the same shape as the suite-level row but with `running` pill + monospace elapsed time.

### DiscussionTab

Top region (filter chips + actions):

```tsx
<div className="flex items-center gap-1.5 flex-wrap">
  <Chip active={filter==='all'} count={counts.all} onClick={…}>All</Chip>
  <Chip active={filter==='reviews'} count={counts.reviews}>Reviews</Chip>
  <Chip active={filter==='comments'} count={counts.comments}>Comments</Chip>
  <Chip active={filter==='code'} count={counts.code}>
    <FileIcon size={11}/> On code
  </Chip>
  {resolvedCount > 0 && (
    <button … onClick={() => setShowResolved(s => !s)}>
      {showResolved ? <EyeIcon/> : <CheckIcon/>}
      {showResolved ? 'Hide resolved' : `Show resolved (${resolvedCount})`}
    </button>
  )}
  <span className="flex-1"/>
  <Button variant="secondary" size="sm" leading={<MessageIcon/>}>Comment</Button>
  <Button variant="primary" size="sm" leading={<CheckCircleIcon/>}>Submit review</Button>
</div>
```

The "Show resolved" toggle is a one-off non-Chip pill — it has icon-swap semantics that don't fit `Chip`'s `active/count` model. Implemented inline using `bd-pill bd-pill--ghost` classes.

Body: vertical stack rendering each `DiscussionItem` via the right component:
- `kind: 'review'` → `<ReviewItem item={…}/>`
- `kind: 'comment'` → `<CommentItem item={…}/>`
- `kind: 'code'` → `<CodeThreadCard thread={…} />` (thread.onJump comes from the jump store action)

Composer (`<ReviewComposer kind={kind} onClose/>`) renders inline above the list when `composing === true`.

### CodeThreadCard

Two render modes:

**Resolved + collapsed** — single dashed-border row:
```
✓ Resolved · DivideProjectModal.tsx:237 · "first-comment-preview…" · 2 replies ▼
```
Click to expand. `expanded` state lives in the card (default `!thread.isResolved`).

**Expanded** — full card:
1. **Header**: file:line button (jumps via store), resolved pill if applicable, comment count, "View in Files" button, collapse-up arrow if was resolved.
2. **Code snippet**: 4-6 lines of diff context. Anchor line gets `bd-warning-bg` background + 3px yellow left stripe.
3. **Reply chain**: vertical thread rail (subtle border line), each comment as `[avatar] [name + bot? + severity? + when] / [body]`. Markdown-rendered body via existing `ReactMarkdown` setup.
4. **Footer**: Reply / Resolve thread / "Reply in code context" buttons. Reply expands a textarea inline.

The "View in Files" button calls `usePrDetailJumpStore.getState().setJumpTarget({ filePath, line, threadId, ts: Date.now() })` which `PRDetailPanel` watches via subscription to switch the active tab to `Files`.

### InlineThread (Files tab)

Anchored bubble that renders directly below an annotated diff line. Same content as the expanded `CodeThreadCard` minus the file:line header (the line itself is the anchor) and minus the snippet (the diff above is the snippet). Includes Reply, Resolve, Close controls.

### DiffLine extension

Existing `DiffLineRow` (or wherever lines render — extracted from `DiffFileSection`) gets new props:
- `hasThread?: boolean`
- `threadOpen?: boolean`
- `onToggleThread?: () => void`
- `highlight?: boolean` — yellow background + 3px yellow inset left stripe

When `hasThread`: line becomes clickable; renders a `💬 N` chip on the right that says "hide" when open. When `highlight`: line gets the highlight treatment.

The `DiffFileSection` wraps it with thread-aware rendering: groups threads by line, renders the line with chip, and on `toggleThread` renders an `<InlineThread>` immediately after the line.

### Files-tab Submit Review composer (toolbar variant)

Replaces the existing bottom-of-scroll review composer.

The current code (`FilesTab.tsx` lines 432–470) renders the submit-review block as a fixed div at the end of the scroll pane. Move it: Add a "Submit review" primary button to `DiffToolbar` (right-aligned, after the file count). Clicking toggles a slide-down panel right below the toolbar (sibling to the file-tree + diff grid). Composer body is the same shape as ReviewComposer (radio: approve/comment/request, textarea, Cancel + Submit).

The Files-tab and Discussion-tab composers are the same component — `ReviewComposer` lifted into `pr-detail/`.

### pr-detail-jump-store

```ts
// src/stores/pr-detail-jump-store.ts
interface JumpTarget {
  filePath: string;
  line: number;
  threadId?: string;
  ts: number;            // timestamp; bumped each invocation so duplicate jumps re-fire
}

interface PrDetailJumpStore {
  target: JumpTarget | null;
  setJumpTarget: (target: JumpTarget) => void;
  clearJumpTarget: () => void;
}
```

`PRDetailPanel` subscribes to `target` — when it changes and the active tab is not `Files`, switch to `Files` (the FilesTab itself reads `target` and handles scroll + highlight + thread expansion).

Why a store and not props? Per Q6: future surfaces (notifications, command palette) should be able to deep-link into a PR thread without prop-drilling.

## Data flow at panel level

```
┌──────────────── PRDetailPanel ────────────────┐
│  pr (prop)                                    │
│    │                                          │
│    ├─ usePrActions(pr) → handlers + state     │
│    │      └─ ConfirmDialogs, CheckoutPanel    │
│    │                                          │
│    ├─ getReviewThreads (cached) ─┐            │
│    ├─ getReviews        (cached) ├─ build     │
│    ├─ getAllComments    (cached) ┘  Discussion│
│    │                                items[]   │
│    │                                          │
│    └─ jumpStore.subscribe(target =>           │
│         setActiveTab('Files'))                │
│                                               │
│  Render:                                      │
│    TitleBar                                   │
│    Header (+ running pill)                    │
│    ActionBar              (uses handlers)     │
│    ActivityStrip          (jumps to Checks)   │
│    Tabs                   (string counts ok)  │
│    {active tab content}                       │
└───────────────────────────────────────────────┘
```

## Caching

Both `getReviewThreads` and the existing `getReviews`/`getAllComments` go through `useCachedTabData` (existing). Cache keys: `'reviewThreads'`, `'reviews'`, `'comments'`. The `prUpdatedAt` invalidation fires after any `mergePr` / `submitReview` / `postComment` mutation just like today.

## Error handling

Per existing patterns:
- Failed action: status string in the action status pill (already used by `OverviewTab` — moves into `usePrActions`).
- Failed fetch: tab shows existing skeleton then error placeholder. No new toast surface.
- Failed thread resolution / reply: inline error message in the thread footer, retry button, no auto-retry.

## Testing

- Unit: `buildDiscussionItems` ordering (chronological, mixed kinds), `getReviewThreads` snippet hydration from a synthetic patch.
- Integration: PRDetailPanel renders without an action row inside Overview after the move. `usePrActions` confirm dialogs fire. Tab badges show string counts and indicator. Jump store: setting target with active tab ≠ Files switches to Files; FilesTab effects on target → expanded thread + highlighted line.
- Visual / manual: screenshot the three Files-tab states (line with no thread / chip / open InlineThread + highlight); the four Discussion filters; ActivityStrip in red / yellow / green; ChecksTab pinned group.

## Open implementation questions (resolve during planning)

- **Where do `bd-*` keyframes live today?** A grep for `@keyframes bd-` will tell us — `SegmentedProgress` adds `bd-stripe-march` next to them.
- **Severity parsing.** Claude's review-comment bodies sometimes prefix `**[minor]**`, etc. The parser is naive (regex at body start). Confirm the convention before encoding it.
- **Inline composer reuse.** Files-tab composer and Discussion composer share `ReviewComposer`. Confirm naming or rename to `ReviewComposer` (handles both kinds: comment / review).
- **DiffLineRow extraction.** If `DiffLineRow` doesn't exist as a separate component yet (lines may be rendered inline inside `DiffFileSection`), extracting it is part of this work.

## Out of scope but adjacent (won't be done here)

- Pending review state with multiple per-line draft comments. Today the composer submits one event with one body.
- Inline diff comment composition from a `+` button on a line. Threads only render after a comment exists.
- Live SSE / GraphQL subscription for thread updates. Polling stays the refresh path.
- Removing inline-sidebar mode. ActionBar wraps to multiple rows in narrow widths; nothing in the spec assumes window mode.

## Implementation order (single batch)

Ships as one PR. The natural ordering inside the plan is:

1. **Primitives + structural** (no new data): Tabs widening, SegmentedProgress, ActivityStrip, ActionBar + usePrActions, header running pill, ChecksTab pinned group, OverviewTab action-row removal, jump store, panel-level dialog hosting.
2. **Discussion data + tab**: getReviewThreads service + types, DiscussionItem flattening, DiscussionTab + CodeThreadCard + ReviewItem + CommentItem + ReviewComposer. Delete ReviewsTab + CommentsTab. PRDetailPanel tabs list update.
3. **Files integration**: DiffLineRow / DiffFileSection thread plumbing, InlineThread component, FilesTab toolbar Submit-review composer (move from bottom anchor → toolbar), jump-store consumption + scroll-to-line + highlight + auto-expand.

These are step ordering, not separate releases — the writing-plans output should treat the whole spec as one deliverable.
