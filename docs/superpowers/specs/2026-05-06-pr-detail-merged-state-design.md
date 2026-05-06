# PR detail merged-state visibility

## Context

After clicking **Merge** or **Bypass Merge** in the PR detail window (`src/components/pr-detail/`), the underlying data refresh path works — `usePrStore.refreshPr` runs ~1.5 s later, dispatches `PR_REFRESHED_EVENT`, and `PRDetailApp`'s listener calls `setPr` — but the UI does not visually communicate that the PR is now merged. Symptoms users see:

- The header pill row (`PrDetailPanel.tsx:324-337`) has no "Merged" indicator. It only shows pills relevant to an open PR (`Mergeable`, `Conflicts`, `<n> passed`, `Draft`, `<reviewLabel>`).
- The Overview action bar (`OverviewTab.tsx:280-377`) still shows `Merge`, `Bypass Merge`, `Mark Draft`, and `Resolve Conflicts` buttons. Only `Close PR` is gated on `state === 'open'`.
- There is no "Merged ✓" celebration card in the panel itself — `celebrateMerge` fires an OS toast notification, which a focused user staring at the PR detail window can easily miss.
- The 1.5 s delay before the data refresh (`TERMINAL_REFRESH_DELAY_MS` in `src/services/pr-actions.ts`) means even when the UI *does* update, it's not "immediate."

This spec adds (1) a clear merged-state header pill, (2) action-button gating, (3) a dedicated in-panel celebration card, and (4) an optimistic store update so the visual change happens on the same tick the merge API call returns.

## Approach

### 1. Header pill — `Merged` / `Closed`

In `src/components/pr-detail/PRDetailPanel.tsx`, in the pill row at lines 324-337:

- When `p.mergedAt` is set (the canonical merged signal — more reliable than inspecting `p.state`), render a **`Merged`** pill using the existing `Pill` primitive. Extend `PillTone` in `src/components/shared/primitives/Pill.tsx` (currently `'success' | 'warning' | 'error' | 'neutral' | 'draft' | 'ghost'`) with a new `'merged'` tone backed by the existing `var(--color-purple)` / `var(--color-purple-soft)` theme tokens. Semantic name (not `'purple'`) so future theming changes don't require renaming the tone everywhere.
- When `p.state === 'closed'` and `!p.mergedAt`, render a **`Closed`** pill with tone `neutral`.
- When the PR is merged or closed, **suppress** the pills that no longer make sense: `Mergeable`, `Conflicts`, `<n> passed`, `<reviewLabel>`. Keep `Draft` (rare but possible) and the `#<number>` label.

The `Ring` (merge-readiness gauge, line 315) stays — it visualises the score that *was* relevant when the merge happened, and removing it would shift the header layout post-merge in a distracting way.

### 2. Action button gating in `OverviewTab`

In `src/components/pr-detail/OverviewTab.tsx`, in the action button row at lines 280-377:

- Wrap **`Merge`**, **`Bypass Merge`**, **`Mark Draft`**, and **`Resolve Conflicts`** in `{p.state === 'open' && (...)}`.
- `Close PR` already has this gate (line 365) — leave it.
- `Open in Browser`, `Copy Branch`, and `Checkout` remain visible — they're still useful post-merge (e.g., switching back to the merged branch locally).

### 3. New `MergedCard` component

New file `src/components/pr-detail/MergedCard.tsx`, ~50 LOC. Rendered at the top of `OverviewTab` *above* the action button row when `p.mergedAt` is set or `p.state === 'closed'`.

Two variants, switched by `p.mergedAt`:

- **Merged variant**: large `✓` glyph, **"Merged"** title, subline `<headRef> → <baseRef>`, relative timestamp (`Merged just now` / `Merged 3m ago`) using the same age-formatting pattern as `formatAge` in `PrDetailPanel.tsx:136-145`. Visual treatment: surface card with a colored left rail in `var(--color-purple)`.
- **Closed (not merged) variant**: `✕` glyph, **"Closed"** title, subline `<headRef>`, relative timestamp (`Closed 5m ago`) from `p.closedAt`. Left rail in a neutral / muted tone.

The card uses the existing `Card` primitive from `@/components/shared/primitives` for surface + padding consistency.

**Explicitly NOT included**: a "merged by" attribution. The `PullRequest` type (`src/types/pull-request.ts`) doesn't carry a `mergedBy` field, and adding one would expand the GitHub API mapping in `src/services/github/pulls.ts` for a side concern.

### 4. Optimistic store update

The existing post-merge flow:

```
mergePr / bypassMergePr  →  await API call  →  celebrateMerge  →  scheduleTerminalRefresh (1.5s)  →  refreshPr  →  PR_REFRESHED_EVENT  →  PRDetailApp.setPr
```

Add a new step between the API call and `celebrateMerge` that mutates the local store synchronously:

**4a. New method on `PrState`** in `src/stores/pr-store.ts`:

```ts
optimisticallyMarkMerged: (owner: string, repo: string, number: number) => void;
```

Implementation:

1. Look up the PR in `pullRequests` by owner/repo/number. If not found, no-op (a concurrent refresh may have already moved it).
2. Build a synthetic merged copy:
   ```ts
   const merged: PullRequestWithChecks = {
     ...current,
     pullRequest: {
       ...current.pullRequest,
       state: 'closed',
       mergedAt: new Date().toISOString(),
       mergeable: undefined,
     },
   };
   ```
3. Move it from `pullRequests` → front of `closedPullRequests`. Clear all derived caches (matching the pattern used by `setPullRequests` and `refreshPr`).
4. Dispatch `PR_REFRESHED_EVENT` with `detail.pr = merged` so `PRDetailApp`'s listener picks it up the same tick (line 178-194 in `PRDetailApp.tsx`).

**4b. Call site changes** in `src/services/pr-actions.ts`:

- In `mergePr` (line 99-111), after `await mergePullRequest(...)` succeeds and *before* `celebrateMerge`, call `usePrStore.getState().optimisticallyMarkMerged(pr.repoOwner, pr.repoName, pr.number)`.
- In `bypassMergePr` (line 113-123), same — after `await bypassMergePullRequest(...)` succeeds.
- The existing `scheduleTerminalRefresh` stays as-is. It now acts as server-truth confirmation rather than the primary update mechanism.

**Why this is safe**: Both `mergePullRequest` (REST API) and `bypassMergePullRequest` (gh CLI) throw on failure, so `optimisticallyMarkMerged` only runs on confirmed success. Worst-case race: the 1.5 s `refreshPr` writes the same merged PR over the optimistic copy — no flicker, no inconsistency.

**Cross-window note**: Pop-out PR detail windows have their own zustand store. The optimistic update runs in whichever window dispatched the merge — the sidebar window for inline-mode merges, the pop-out window for in-window merges. Each window's `PR_REFRESHED_EVENT` is `document`-scoped, so the listener in the same window picks it up. The 1.5 s `refreshPr` doesn't cross windows either; the *other* windows showing the same PR rely on the existing polling loop to converge.

## Tests

| File | Type | What to verify |
| --- | --- | --- |
| `src/components/pr-detail/__tests__/MergedCard.test.tsx` | new | Merged variant renders with branch refs + relative timestamp; closed-not-merged variant renders without "Merged" wording. |
| `src/components/pr-detail/__tests__/PRDetailPanel.test.tsx` | extend | `Merged` pill renders when `mergedAt` set; `Mergeable` / `<n> passed` / `<reviewLabel>` pills suppressed in terminal state; `Closed` pill renders when `state === 'closed'` and not merged. |
| `src/components/pr-detail/__tests__/OverviewTab.test.tsx` | extend | `Merge`, `Bypass Merge`, `Mark Draft`, `Resolve Conflicts` buttons absent when `state === 'closed'`; `MergedCard` present when merged. Existing bypass-confirm tests continue to pass for `state === 'open'`. |
| `src/services/__tests__/pr-actions.test.ts` | extend | After `mergePr` / `bypassMergePr` resolves successfully, `optimisticallyMarkMerged` was called once with the right args, and `PR_REFRESHED_EVENT` fired *before* the timer that `scheduleTerminalRefresh` would advance. |
| `src/stores/__tests__/pr-store.test.ts` (or inline if absent) | new/extend | `optimisticallyMarkMerged` moves PR to `closedPullRequests`, dispatches `PR_REFRESHED_EVENT`, no-ops when PR not found. |

## Out of scope

- **Hiding `MergeReadinessChecklist` for merged PRs.** It will show all-green post-merge, which is mildly redundant but not misleading. Removing/hiding it is a separate UX decision.
- **Adding a `mergedBy` field** to the `PullRequest` type and the GitHub mapping. Useful for the closed-tab view too, but a separate change with its own surface area.
- **Touching `MergeToast` (`src/components/focus/MergeToast.tsx`) or the sidebar `PrCard`.** Both consume the same `usePrStore`, so the optimistic update reaches them automatically. No per-component changes required.
- **Reducing `TERMINAL_REFRESH_DELAY_MS`** (currently 1500 ms). With the optimistic update the delay is invisible — the user sees the merged state instantly; the eventual server refresh is silent.
- **Cross-window propagation of the optimistic update.** A pop-out PR detail window won't see an instant update if the merge was clicked from the sidebar (and vice versa) — the existing polling loop and per-window subscription patterns continue to handle this.
