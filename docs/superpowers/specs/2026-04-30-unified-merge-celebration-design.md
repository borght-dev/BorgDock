# Unified merge celebration

## Context

When you merge a PR from the **PR detail panel**, you see a small inline check-card (`MergeCelebration` in `src/components/pr-detail/OverviewTab.tsx`). When you merge from the **sidebar / flyout context menu** (regular Merge or Bypass Merge), you see **nothing** — the action just silently fires. When the deferred-merge "undo" path in `src/components/focus/MergeToast.tsx` finally executes, it shows a generic `severity: 'success'` toast — not the rich merge-toast that already exists in the design system. And when a PR you're tracking gets merged on GitHub by someone else (or by CI), the app does not surface it at all.

The infrastructure for a "big celebration" is already built: `NotificationBubble` supports `severity: 'merged'` with a 🚀 Merged label, 🎉 icon, pulsing glow, ring animation, shimmer sweep, wider card, and 8s display (vs. 6s for other severities). It is currently never fired anywhere in production.

This work unifies all four code paths (sidebar, flyout, PR detail, focus undo) onto the existing merged-toast, adds a polling-driven trigger for externally-merged PRs, and adds a synthesized "Ta-daaaa" sound.

## Approach

### Single celebration helper

New module `src/services/merge-celebration.ts`:

```ts
export interface CelebratablePr {
  number: number;
  title: string;
  repoOwner: string;
  repoName: string;
  htmlUrl: string;
}

export function celebrateMerge(pr: CelebratablePr): void {
  markCelebrated(pr);              // dedup against next poll
  useNotificationStore.getState().show({
    title: `🎉 PR #${pr.number} merged!`,
    message: `${pr.title} — ${pr.repoOwner}/${pr.repoName}`,
    severity: 'merged',
    launchUrl: pr.htmlUrl,
    prNumber: pr.number,
    repoFullName: `${pr.repoOwner}/${pr.repoName}`,
    actions: [{ label: 'View on GitHub', url: pr.htmlUrl }],
  });
  if (useSettingsStore.getState().settings.notifications.playMergeSound) {
    playTada();
  }
}
```

Single source of truth for the toast shape, the sound trigger, and the dedup bookkeeping.

### "Ta-daaaa" sound

Same module, `playTada()`:

- Bundled file at `src/BorgDock.Tauri/public/sounds/tada.mp3` (Vite serves `public/` at root, so the runtime URL is `/sounds/tada.mp3`).
- Lazy-construct a single shared `HTMLAudioElement` on first call: `audioEl = new Audio('/sounds/tada.mp3'); audioEl.volume = 0.6;`. Reused across every play so we don't re-decode the file on each merge.
- On play: `audioEl.currentTime = 0; void audioEl.play().catch(() => {});` — resetting to 0 lets back-to-back merges restart the clip cleanly (e.g., bulk merging via keyboard).
- Wrap in `try { ... } catch {}` — autoplay policies may reject if the page hasn't received any user interaction yet, and a missing/blocked sound must never break the visual celebration.

External-merge celebrations may fire when the window is backgrounded; that's intended — the sound is part of "this just happened, look over here."

### Wire local merge paths

Five call sites currently fire a merge. All resolve to `celebrateMerge(pr)` on success:

| File | Method | Today | Change |
|---|---|---|---|
| `src/components/pr-detail/OverviewTab.tsx` | `handleMerge` | `setMergeSuccess(true)` → inline card | replace with `celebrateMerge(...)` |
| `src/components/pr-detail/OverviewTab.tsx` | `handleBypassExecute` | `setMergeSuccess(true)` → inline card | replace with `celebrateMerge(...)` |
| `src/hooks/usePrCardActions.ts` | `handleMerge` | nothing on success | add `celebrateMerge(...)` after the `mergePullRequest` resolves |
| `src/hooks/usePrCardActions.ts` | `executeBypassMerge` | nothing on success | add `celebrateMerge(...)` after the `bypassMergePullRequest` resolves |
| `src/components/focus/MergeToast.tsx` | `executeMerge` | fires `severity: 'success'` toast | replace the success-toast block with `celebrateMerge(...)` |

Note: `usePrCardActions` currently fires merges as fire-and-forget chains (`.then().catch(...)`). The change converts each to await the mutation so we can fire `celebrateMerge` only on success — failure paths keep their existing error notification.

### External-merge detection

New hook `src/hooks/useExternalMergeCelebration.ts`, mounted once at the app root next to the polling hook (`src/App.tsx`).

State (held in refs, not React state — these never need to re-render):

- `prevOpenIds: Set<string> | null` — set of `owner/repo#number` keys present in the open list at the previous tick. `null` until the first poll seeds it.
- See dedup section below for `celebratedIds`.

Subscribes to the PR store via `usePrStore.subscribe(...)`. On every change to `pullRequests` or `closedPullRequests`:

1. **Cold-start guard.** If `prevOpenIds === null`, seed it from the current open list and return without firing. We never celebrate PRs that were already merged before the app started — they show up in `closedPullRequests` immediately on first poll.
2. **Find external merges.** For each PR `p` in `closedPullRequests` with `p.pullRequest.mergedAt` set (truthy string):
   - Skip unless `prevOpenIds.has(key(p))` — only celebrate PRs that transitioned from open to merged in our view.
   - Skip if `celebratedIds.has(key(p))` — already fired by the local handler or an earlier poll.
   - Skip if `settings.notifications.onlyMyPRs && p.pullRequest.authorLogin !== username`.
   - Fire `celebrateMerge(p.pullRequest)`.
3. **Update tracking.** Replace `prevOpenIds` with the current open set.

Closed-without-merge PRs are silently dropped (the `mergedAt` check in step 2 filters them out — closed-only PRs have `closedAt` but no `mergedAt`). The `onlyMyPRs` gate is read at fire-time, not at subscription-time, so toggling the setting takes effect immediately.

### Dedup (local action vs. polling re-detection)

`celebrateMerge` always calls `markCelebrated(pr)`, which adds `owner/repo#number` to a module-level `Map<string, number>` whose value is an absolute expiry timestamp (Date.now() + 30_000). Lookups in `useExternalMergeCelebration` go through `wasRecentlyCelebrated(pr)`, which checks the map and lazily evicts expired entries.

30 seconds is comfortably longer than typical poll intervals (the polling hook re-fetches every ~30s for active windows, less often when backgrounded), so a local action followed by the next external poll cannot double-fire. There is no need for a setTimeout-driven cleanup; the lazy eviction in the read path is enough.

### Settings

Add one field to `NotificationSettings` in `src/types/settings.ts`:

```ts
playMergeSound: boolean;   // default true
```

Defaults live in the inline `defaults.notifications` object in `src/stores/settings-store.ts` (around line 34); add `playMergeSound: true` next to the existing `toastOn*` keys. A new `<ToggleRow>` in `src/components/settings/NotificationSection.tsx` labeled "Play sound on merge" — placed below "PR becomes mergeable" and above the "Only notify for my PRs" divider so the celebration-related toggle sits with the other event toggles.

The existing `onlyMyPRs` setting is reused as-is.

### What to delete

- `MergeCelebration` component in `src/components/pr-detail/OverviewTab.tsx` (lines 601-632)
- The `mergeSuccess` `useState` and the conditional render at line 564
- The `actionStatus && !mergeSuccess` guard at line 541 collapses to `actionStatus &&`
- Unused keyframes in `src/styles/index.css`: `merge-pop-in`, `merge-icon-bounce`, `merge-draw-check`, `merge-text-in`, `merge-bg-shift` — all five are referenced only by the deleted card

The 1500ms `TERMINAL_REFRESH_DELAY_MS` and `scheduleTerminalRefresh` in `OverviewTab.tsx` stay — they exist to keep the panel mounted briefly so the action doesn't yank out from under the user.

## Tests

- `src/services/__tests__/merge-celebration.test.ts` — `celebrateMerge` calls `notificationStore.show` with the expected shape and severity; `playTada` is invoked when `playMergeSound` is true and skipped when false; mocks the audio context.
- `src/hooks/__tests__/usePrCardActions.test.ts` — extend existing tests so `handleMerge` and `executeBypassMerge` call the celebration helper on success and do not call it on failure.
- `src/components/pr-detail/__tests__/OverviewTab.test.tsx` — replace existing "shows MergeCelebration" assertions with "calls notification store with merged severity" via a spy; verify the inline card no longer renders.
- `src/components/focus/__tests__/MergeToast.test.tsx` — assert the toast fired by `executeMerge` is `severity: 'merged'` (not `'success'`).
- `src/hooks/__tests__/useExternalMergeCelebration.test.ts` (new) — cold-start suppression (no fire on first store snapshot even when closed list contains merged PRs); external-merge fires when a tracked open PR moves to closed-merged; dedup with local handler (calling `celebrateMerge` directly suppresses the next polling fire); `onlyMyPRs` gate (off → fires for everyone, on → only fires for `authorLogin === username`); close-without-merge does not fire.

## Out of scope

- No badge / dock icon animation — the existing toast already commands attention.
- No per-repo or per-author allowlist beyond the existing `onlyMyPRs` toggle.
- No "undo" affordance for external merges — the merge already happened on GitHub; nothing to undo.
- The focus-mode "undo within 3s" pattern in `MergeToast.tsx` is preserved as-is; only the post-execution success toast is upgraded.
