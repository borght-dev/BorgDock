# Implementation Plan: Tauri Feature Parity

> All changes target `src/PRDock.Tauri/`
> Reference: `plans/feature-parity.md`
>
> **Test conventions:**
> - Unit tests: Vitest + jsdom, located at `src/{feature}/__tests__/{name}.test.ts`
> - E2E tests: Playwright, located at `tests/e2e/{name}.spec.ts`
> - Factory functions for test data (no fixture files)
> - Tauri APIs mocked via `window.__TAURI_INTERNALS__` in E2E
> - Zustand stores tested directly via `.setState()` / `.getState()`

---

## 1. PR Detail Pop-Out Window [Medium]

**Goal:** Allow users to undock the PR detail panel into a standalone OS window (for multi-monitor setups).

### Files to create
- `pr-detail.html` — new entry point HTML
- `src/pr-detail-main.tsx` — React root, reads `?owner=X&repo=Y&number=N` from URL
- `src/components/pr-detail/PRDetailApp.tsx` — standalone wrapper that fetches PR data and renders `PRDetailPanel`

### Files to modify
- `vite.config.ts` — add `pr-detail: resolve(__dirname, 'pr-detail.html')` to `rollupOptions.input`
- `src-tauri/tauri.conf.json` — add window definition:
  ```json
  {
    "title": "PR Detail",
    "label": "pr-detail",
    "width": 800,
    "height": 900,
    "decorations": true,
    "alwaysOnTop": false,
    "resizable": true,
    "visible": false,
    "url": "pr-detail.html"
  }
  ```
- `src-tauri/src/platform/window.rs` — add `open_pr_detail_window(owner, repo, number)` Tauri command that creates/shows the window with query params
- `src-tauri/src/lib.rs` — register new command in `invoke_handler`
- `src/components/pr-detail/PRDetailPanel.tsx` — add "Pop out" button (icon) in header that invokes the Tauri command and deselects from sidebar
- `src/components/pr/PrContextMenu.tsx` — add "Open in detail window" menu item

### Steps
1. Create `pr-detail.html` and `pr-detail-main.tsx` entry point (mirror pattern from `workitem-detail-main.tsx`)
2. Create `PRDetailApp.tsx` that:
   - Parses `owner`, `repo`, `number` from URL search params
   - Fetches PR via `getOpenPRs` + `getCheckRunsForRef` + `aggregatePrWithChecks`
   - Loads settings for theme
   - Renders `PRDetailPanel` with the fetched PR
3. Add Vite + Tauri config entries
4. Add Rust command `open_pr_detail_window` that uses `WebviewWindowBuilder::new()` to create/show
5. Wire pop-out button in `PRDetailPanel` header and context menu

### Tests

**E2E** — `tests/e2e/pr-detail-popout.spec.ts`
```typescript
test.describe('PR Detail Pop-out', () => {
  test('shows pop-out button in PR detail header', async ({ page }) => {
    // Inject PRs, select one, verify button is visible in detail panel
  });

  test('context menu shows "Open in detail window" item', async ({ page }) => {
    // Inject PRs, right-click a card, verify menu item exists
  });
});
```

**E2E** — update `tests/e2e/pr-context-menu.spec.ts`
- Add test case: verify "Open in detail window" menu item is present in context menu

**Unit** — `src/components/pr-detail/__tests__/PRDetailApp.test.tsx`
```typescript
describe('PRDetailApp', () => {
  it('parses owner, repo, number from URL search params', () => {
    // Set window.location.search = '?owner=foo&repo=bar&number=42'
    // Render PRDetailApp, verify it attempts to fetch the correct PR
  });

  it('shows loading state while fetching PR', () => {
    // Mock fetch to never resolve, verify spinner is shown
  });

  it('shows error state when PR fetch fails', () => {
    // Mock fetch to reject, verify error message is displayed
  });
});
```

---

## 2. ADO Client Retry Handler [Medium]

**Goal:** Add retry with exponential backoff to the ADO HTTP client (GitHub client already has it).

### Files to modify
- `src/services/ado/client.ts`

### Steps
1. Add a private `fetchWithRetry` method to `AdoClient`, mirroring the pattern from `GitHubClient`:
   ```typescript
   private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
     const maxRetries = 3;
     const transientCodes = new Set([429, 500, 502, 503]);
     for (let attempt = 0; attempt <= maxRetries; attempt++) {
       const response = await fetch(url, init);
       if (!transientCodes.has(response.status) || attempt === maxRetries) {
         return response;
       }
       const retryAfter = response.headers.get('Retry-After');
       const delay = retryAfter
         ? parseInt(retryAfter, 10) * 1000 || 1000
         : 1000 * Math.pow(2, attempt);
       await new Promise((r) => setTimeout(r, delay));
     }
     throw new Error('Retry loop exhausted');
   }
   ```
2. Replace all `fetch(url, ...)` calls in `get`, `getOrgLevel`, `post`, `patch`, `delete`, `getStream` with `this.fetchWithRetry(url, ...)`
3. Keep the existing auth error (401/403) handling — those should NOT be retried

### Tests

**Unit** — `src/services/ado/__tests__/client.test.ts` (new file)
```typescript
describe('AdoClient retry', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns immediately on 200', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const client = new AdoClient('org', 'project', 'pat');
    await client.get('wit/workitems');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 up to 3 times', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const client = new AdoClient('org', 'project', 'pat');
    await client.get('wit/workitems');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('retries on 500, 502, 503', async () => {
    for (const status of [500, 502, 503]) {
      fetchSpy.mockReset();
      fetchSpy
        .mockResolvedValueOnce(new Response('', { status }))
        .mockResolvedValueOnce(new Response('{}', { status: 200 }));
      const client = new AdoClient('org', 'project', 'pat');
      await client.get('wit/workitems');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    }
  });

  it('does NOT retry on 401/403 (auth errors)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 401 }));
    const client = new AdoClient('org', 'project', 'pat');
    await expect(client.get('wit/workitems')).rejects.toThrow('authentication');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 404 (not transient)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 404 }));
    const client = new AdoClient('org', 'project', 'pat');
    await expect(client.get('wit/workitems')).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('respects Retry-After header (seconds)', async () => {
    const headers = new Headers({ 'Retry-After': '1' });
    fetchSpy
      .mockResolvedValueOnce(new Response('', { status: 429, headers }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const client = new AdoClient('org', 'project', 'pat');
    const start = Date.now();
    await client.get('wit/workitems');
    expect(Date.now() - start).toBeGreaterThanOrEqual(900); // ~1s
  });

  it('returns last error response after max retries exhausted', async () => {
    fetchSpy
      .mockResolvedValue(new Response('', { status: 503 }));
    const client = new AdoClient('org', 'project', 'pat');
    await expect(client.get('wit/workitems')).rejects.toThrow('503');
    expect(fetchSpy).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it('retries POST requests on transient errors', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const client = new AdoClient('org', 'project', 'pat');
    await client.post('wit/workitems', { fields: {} });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
```

---

## 3. Bypass Merge (Admin) [Low]

**Goal:** Add admin bypass merge option to the PR context menu.

### Files to modify
- `src/services/github/mutations.ts` — add `bypassMergePullRequest` function
- `src/components/pr/PrContextMenu.tsx` — add "Bypass merge" menu item

### Steps
1. In `mutations.ts`, add:
   ```typescript
   export async function bypassMergePullRequest(
     client: GitHubClient,
     owner: string,
     repo: string,
     prNumber: number
   ): Promise<void> {
     // GitHub REST API doesn't support admin bypass directly.
     // Use gh CLI via Tauri shell command instead.
     await invoke('run_gh_command', {
       args: ['pr', 'merge', String(prNumber), '--squash', '--admin', '--repo', `${owner}/${repo}`],
     });
   }
   ```
   Alternatively, add a Rust command that shells out to `gh pr merge --admin`.
2. In `PrContextMenu.tsx`, add menu item below "Merge":
   ```tsx
   <MenuItem
     label="Bypass merge (admin)"
     onClick={handleBypassMerge}
     disabled={pullRequest.state !== 'open'}
   />
   ```
3. Add Rust command `run_gh_command` in `src-tauri/src/git/commands.rs` if not already present, or use existing `tauri_plugin_shell` to spawn `gh`.

### Tests

**Unit** — update `src/services/github/__tests__/mutations.test.ts` (create if not exists)
```typescript
describe('bypassMergePullRequest', () => {
  it('invokes run_gh_command with --admin flag', async () => {
    const invokeSpy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('__TAURI_INTERNALS__', { invoke: invokeSpy });
    await bypassMergePullRequest(mockClient, 'owner', 'repo', 42);
    expect(invokeSpy).toHaveBeenCalledWith('run_gh_command', {
      args: ['pr', 'merge', '42', '--squash', '--admin', '--repo', 'owner/repo'],
    });
  });
});
```

**E2E** — update `tests/e2e/pr-context-menu.spec.ts`
```typescript
test('shows "Bypass merge (admin)" in context menu', async ({ page }) => {
  await injectCompletedSetup(page);
  await page.goto('/');
  await waitForAppReady(page);
  await injectMockPrs(page);
  const card = page.locator('[data-pr-card]').first();
  await card.click({ button: 'right' });
  await expect(page.getByText('Bypass merge (admin)')).toBeVisible();
});
```

---

## 4. Review Sort Modes [Low]

**Goal:** Add sort options (Newest, Oldest, Severity, File) to the Reviews tab.

### Files to modify
- `src/components/pr-detail/ReviewsTab.tsx`

### Steps
1. Add state: `const [sortMode, setSortMode] = useState<'newest' | 'oldest' | 'severity' | 'file'>('newest');`
2. Add sort button row above the review list:
   ```tsx
   <div className="flex gap-1 px-3 py-1.5 border-b border-[var(--color-separator)]">
     {(['newest', 'oldest', 'severity', 'file'] as const).map((mode) => (
       <button key={mode} onClick={() => setSortMode(mode)}
         className={clsx('px-2 py-0.5 text-[10px] rounded', sortMode === mode ? 'bg-[var(--color-accent)]...' : '...')}>
         {mode.charAt(0).toUpperCase() + mode.slice(1)}
       </button>
     ))}
   </div>
   ```
3. Extract sort function (pure, testable):
   ```typescript
   export function sortReviews(reviews: Review[], mode: string): Review[] {
     switch (mode) {
       case 'oldest': return [...reviews].sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
       case 'newest': return [...reviews].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
       case 'severity': return [...reviews].sort((a, b) => severityOrder(a.state) - severityOrder(b.state));
       case 'file': return [...reviews]; // reviews don't have file paths — passthrough
       default: return reviews;
     }
   }
   ```
4. Apply sort before rendering: `{sortReviews(reviews, sortMode).map(...)}`

### Tests

**Unit** — `src/components/pr-detail/__tests__/review-sort.test.ts`
```typescript
import { sortReviews, severityOrder } from '../ReviewsTab';

const makeReview = (overrides = {}) => ({
  id: 1, user: 'alice', state: 'COMMENTED', body: '', submittedAt: '2026-01-15T10:00:00Z',
  ...overrides,
});

describe('sortReviews', () => {
  const reviews = [
    makeReview({ id: 1, submittedAt: '2026-01-15T10:00:00Z', state: 'COMMENTED' }),
    makeReview({ id: 2, submittedAt: '2026-01-16T10:00:00Z', state: 'CHANGES_REQUESTED' }),
    makeReview({ id: 3, submittedAt: '2026-01-14T10:00:00Z', state: 'APPROVED' }),
  ];

  it('sorts newest first by default', () => {
    const sorted = sortReviews(reviews, 'newest');
    expect(sorted.map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it('sorts oldest first', () => {
    const sorted = sortReviews(reviews, 'oldest');
    expect(sorted.map((r) => r.id)).toEqual([3, 1, 2]);
  });

  it('sorts by severity (changes_requested > commented > approved)', () => {
    const sorted = sortReviews(reviews, 'severity');
    expect(sorted.map((r) => r.state)).toEqual(['CHANGES_REQUESTED', 'COMMENTED', 'APPROVED']);
  });

  it('does not mutate the original array', () => {
    const copy = [...reviews];
    sortReviews(reviews, 'newest');
    expect(reviews).toEqual(copy);
  });

  it('handles empty array', () => {
    expect(sortReviews([], 'newest')).toEqual([]);
  });
});

describe('severityOrder', () => {
  it('ranks CHANGES_REQUESTED highest', () => {
    expect(severityOrder('CHANGES_REQUESTED')).toBeLessThan(severityOrder('COMMENTED'));
    expect(severityOrder('CHANGES_REQUESTED')).toBeLessThan(severityOrder('APPROVED'));
  });
});
```

**E2E** — update `tests/e2e/pr-detail.spec.ts`
```typescript
test('shows sort buttons on Reviews tab', async ({ page }) => {
  // Navigate to PR detail, click Reviews tab
  await page.getByText('Reviews').click();
  for (const label of ['Newest', 'Oldest', 'Severity', 'File']) {
    await expect(page.getByRole('button', { name: label })).toBeVisible();
  }
});

test('clicking sort mode reorders reviews', async ({ page }) => {
  // Inject PR with multiple reviews, switch to Reviews tab
  // Click "Oldest", verify first review is the earliest
  // Click "Newest", verify first review is the latest
});
```

---

## 5. PR Card Stats (Comment Count, +/-, Commits) [Low]

**Goal:** Show comment count, additions/deletions, and commit count on PR cards.

### Files to modify
- `src/components/pr/PullRequestCard.tsx`

### Steps
1. In the meta row (below title), add stats after the branch name:
   ```tsx
   {/* Stats row */}
   <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--color-text-tertiary)]">
     {pr.commentCount > 0 && (
       <span title="Comments">{'\uD83D\uDCAC'} {pr.commentCount}</span>
     )}
     {(pr.additions > 0 || pr.deletions > 0) && (
       <span>
         <span className="text-green-500">+{pr.additions}</span>
         {' '}
         <span className="text-red-500">-{pr.deletions}</span>
       </span>
     )}
     {pr.commitCount > 0 && (
       <span title="Commits">{pr.commitCount} commits</span>
     )}
   </div>
   ```
2. Verify `PullRequest` type includes `commentCount`, `additions`, `deletions`, `commitCount` — these should already be in the type from polling.

### Tests

**E2E** — update `tests/e2e/pr-list.spec.ts`
```typescript
test('PR card shows comment count, additions/deletions, and commit count', async ({ page }) => {
  await injectCompletedSetup(page);
  await page.goto('/');
  await waitForAppReady(page);
  // Inject PR with known stats: commentCount=5, additions=120, deletions=30, commitCount=3
  await injectMockPrs(page, [{
    pullRequest: { ...basePr, commentCount: 5, additions: 120, deletions: 30, commitCount: 3 },
    checks: [], overallStatus: 'green', failedCheckNames: [], pendingCheckNames: [],
    passedCount: 0, skippedCount: 0,
  }]);

  const card = page.locator('[data-pr-card]').first();
  await expect(card.getByTitle('Comments')).toContainText('5');
  await expect(card).toContainText('+120');
  await expect(card).toContainText('-30');
  await expect(card).toContainText('3 commits');
});

test('PR card hides stats when values are zero', async ({ page }) => {
  // Inject PR with commentCount=0, additions=0, deletions=0, commitCount=0
  // Verify stats row elements are NOT visible
});
```

---

## 6. Inline Card Expansion [Low]

**Goal:** Allow expanding PR cards inline (in addition to the overlay detail panel).

### Files to modify
- `src/components/pr/PullRequestCard.tsx` — add expandable section
- `src/stores/ui-store.ts` — add `expandedPrNumbers: Set<number>` state

### Steps
1. Add `expandedPrNumbers` to UI store with `togglePrExpanded(number)` and `collapseAllPrs()` actions
2. In `PullRequestCard`, add a toggle button (chevron arrow) that calls `togglePrExpanded`
3. When expanded, render an inline section below the card content:
   ```tsx
   {isExpanded && (
     <div className="border-t border-[var(--color-separator)] pt-2 mt-2 space-y-2">
       <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
         {pr.headRef} → {pr.baseRef}
       </div>
       {pr.body && (
         <div className="text-[11px] text-[var(--color-text-secondary)] line-clamp-4">
           {pr.body}
         </div>
       )}
       <div className="flex gap-1 flex-wrap">
         {/* Rerun, Fix, Monitor, Open Detail, Open in GitHub */}
       </div>
     </div>
   )}
   ```
4. Clicking the card title still opens the detail panel; the chevron toggles inline expand

### Tests

**Unit** — update `src/stores/__tests__/ui-store.test.ts`
```typescript
describe('expandedPrNumbers', () => {
  it('toggles PR expansion', () => {
    useUiStore.getState().togglePrExpanded(42);
    expect(useUiStore.getState().expandedPrNumbers.has(42)).toBe(true);
    useUiStore.getState().togglePrExpanded(42);
    expect(useUiStore.getState().expandedPrNumbers.has(42)).toBe(false);
  });

  it('collapseAllPrs clears all expanded', () => {
    useUiStore.getState().togglePrExpanded(1);
    useUiStore.getState().togglePrExpanded(2);
    useUiStore.getState().collapseAllPrs();
    expect(useUiStore.getState().expandedPrNumbers.size).toBe(0);
  });
});
```

**E2E** — update `tests/e2e/pr-list.spec.ts`
```typescript
test('expand chevron shows inline branch info and description', async ({ page }) => {
  await injectCompletedSetup(page);
  await page.goto('/');
  await waitForAppReady(page);
  await injectMockPrs(page);
  // Click expand chevron on first card
  const card = page.locator('[data-pr-card]').first();
  await card.locator('[data-expand-toggle]').click();
  // Verify branch info and body are visible within the card
  await expect(card).toContainText('→'); // branch arrow
});

test('clicking card title still opens detail panel (not expand)', async ({ page }) => {
  // Click the title text area, verify PRDetailPanel appears (not inline expand)
});
```

---

## 7. Batch Worktree Assignment [Low]

**Goal:** Assign a single active worktree to all "working on" work items at once.

### Files to modify
- `src/stores/work-items-store.ts` — add `applyWorktreeToAllWorkingOn(path: string)` action
- `src/components/work-items/WorkItemFilterBar.tsx` or `WorkItemsSection.tsx` — add button to trigger

### Steps
1. In work items store, add action:
   ```typescript
   applyWorktreeToAllWorkingOn: (path: string) => {
     const state = get();
     const updated = { ...state.workItemWorktreePaths };
     for (const id of state.workingOnWorkItemIds) {
       updated[id] = path;
     }
     set({ workItemWorktreePaths: updated });
     // Persist to settings
   },
   ```
2. Add a button in the work items toolbar (e.g., near the worktree selector) that opens a dropdown of available worktrees and calls `applyWorktreeToAllWorkingOn` on selection

### Tests

**Unit** — update `src/stores/__tests__/work-items-store.test.ts`
```typescript
describe('applyWorktreeToAllWorkingOn', () => {
  it('assigns path to all working-on items', () => {
    useWorkItemsStore.setState({
      workingOnWorkItemIds: new Set([10, 20, 30]),
      workItemWorktreePaths: { 10: '/old/path' },
    });
    useWorkItemsStore.getState().applyWorktreeToAllWorkingOn('/new/worktree');
    const paths = useWorkItemsStore.getState().workItemWorktreePaths;
    expect(paths[10]).toBe('/new/worktree');
    expect(paths[20]).toBe('/new/worktree');
    expect(paths[30]).toBe('/new/worktree');
  });

  it('does nothing when no items are working-on', () => {
    useWorkItemsStore.setState({
      workingOnWorkItemIds: new Set(),
      workItemWorktreePaths: {},
    });
    useWorkItemsStore.getState().applyWorktreeToAllWorkingOn('/path');
    expect(useWorkItemsStore.getState().workItemWorktreePaths).toEqual({});
  });

  it('preserves paths for non-working-on items', () => {
    useWorkItemsStore.setState({
      workingOnWorkItemIds: new Set([10]),
      workItemWorktreePaths: { 99: '/other' },
    });
    useWorkItemsStore.getState().applyWorktreeToAllWorkingOn('/new');
    const paths = useWorkItemsStore.getState().workItemWorktreePaths;
    expect(paths[99]).toBe('/other');
    expect(paths[10]).toBe('/new');
  });
});
```

---

## 8. Staggered Repo Polling [Low]

**Goal:** Add a small delay between repos during a poll cycle to avoid API burst.

### Files to modify
- `src/hooks/useGitHubPolling.ts`

### Steps
1. In the `pollFn` inside `useGitHubPolling`, add a delay between repos:
   ```typescript
   for (let i = 0; i < enabledRepos.length; i++) {
     const repo = enabledRepos[i];
     // Stagger: wait 500ms between repos (skip first)
     if (i > 0) {
       await new Promise((r) => setTimeout(r, 500));
     }
     try {
       // ... existing fetch logic
     }
   }
   ```

### Tests

**Unit** — `src/hooks/__tests__/useGitHubPolling.test.ts` (new file or extend existing)

Testing the stagger delay directly in a hook test is fragile. Instead, extract the poll function for testability:

```typescript
// Extract from useGitHubPolling into a testable function:
export async function pollAllRepos(
  client: GitHubClient,
  repos: RepoSettings[],
  staggerMs = 500
): Promise<PullRequestWithChecks[]> { /* ... */ }
```

Then test:
```typescript
describe('pollAllRepos', () => {
  it('calls repos sequentially with stagger delay', async () => {
    const timestamps: number[] = [];
    const mockClient = {
      get: vi.fn().mockImplementation(async () => {
        timestamps.push(Date.now());
        return [];
      }),
    } as unknown as GitHubClient;

    vi.mocked(getOpenPRs).mockResolvedValue([]);

    await pollAllRepos(mockClient, [
      { owner: 'a', name: 'r1', enabled: true },
      { owner: 'b', name: 'r2', enabled: true },
    ], 100); // use shorter delay for test speed

    expect(timestamps).toHaveLength(2);
    expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(90);
  });

  it('does not stagger before the first repo', async () => {
    // Single repo should complete without delay
  });
});
```

---

## 9. Eager Parallel Tab Loading [Low]

**Goal:** Load all PR detail tabs in parallel on open, instead of lazy-loading each tab.

### Files to modify
- `src/components/pr-detail/PRDetailPanel.tsx`

### Steps
Render all tab components simultaneously but only show the active one:
```tsx
<div className="flex-1 overflow-y-auto">
  <div className={activeTab === 'Overview' ? '' : 'hidden'}><OverviewTab pr={pr} /></div>
  <div className={activeTab === 'Commits' ? '' : 'hidden'}><CommitsTab ... /></div>
  <div className={activeTab === 'Files' ? '' : 'hidden'}><FilesTab ... /></div>
  <div className={activeTab === 'Checks' ? '' : 'hidden'}><ChecksTab ... /></div>
  <div className={activeTab === 'Reviews' ? '' : 'hidden'}><ReviewsTab ... /></div>
  <div className={activeTab === 'Comments' ? '' : 'hidden'}><CommentsTab ... /></div>
</div>
```
This mounts all tabs immediately (triggering their `useEffect` fetches) but only displays the active one. Tab switching becomes instant.

### Tests

**E2E** — update `tests/e2e/pr-detail.spec.ts`
```typescript
test('all tabs are preloaded when detail panel opens', async ({ page }) => {
  // Open PR detail, immediately check Reviews tab (without clicking it first)
  // Verify reviews are already loaded (no loading skeleton)
  await page.getByText('Reviews').click();
  // Should NOT show loading skeleton since data was prefetched
  await expect(page.locator('.animate-pulse')).toHaveCount(0);
});

test('tab switching is instant (no loading flash)', async ({ page }) => {
  // Open PR detail, wait 2s for all fetches to complete
  // Rapidly switch tabs, verify no loading states appear
});
```

---

## 10. File Logging [Low]

**Goal:** Enable persistent file logging via the Tauri log plugin.

### Files to modify
- `src-tauri/src/lib.rs` — configure log plugin with file target
- `src-tauri/Cargo.toml` — ensure `tauri-plugin-log` has file rotation features

### Steps
1. Replace `.plugin(tauri_plugin_log::Builder::new().build())` with:
   ```rust
   .plugin(
       tauri_plugin_log::Builder::new()
           .target(tauri_plugin_log::Target::new(
               tauri_plugin_log::TargetKind::Folder {
                   path: app_log_dir,
                   file_name: Some("prdock".into()),
               },
           ))
           .max_file_size(5_000_000) // 5MB per file
           .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
           .level(log::LevelFilter::Info)
           .build(),
   )
   ```
   Note: `app_log_dir` can be obtained from Tauri's `app.path()` resolver.
2. On the frontend, use `import { info, error, warn } from '@tauri-apps/plugin-log';` instead of `console.error` for important events (polling failures, API errors, etc.).

### Tests

**Rust unit test** — `src-tauri/src/lib.rs` or separate test file
```rust
#[cfg(test)]
mod tests {
    #[test]
    fn log_dir_is_resolved() {
        // Verify the log directory path construction doesn't panic
        // This is a basic smoke test for configuration
    }
}
```

No E2E test needed — log file creation is a side effect that doesn't affect UI behavior. Verify manually during development.

---

## 11. Lock File for Single Instance [Skip]

**Skip.** The `tauri_plugin_single_instance` plugin handles duplicate launch prevention. No tests needed.

---

## 12. Settings Dev Overlay [Low]

**Goal:** Support a `settings.dev.json` that merges over main settings in dev mode.

### Files to modify
- `src-tauri/src/settings/mod.rs` — modify `load_settings` command

### Steps
1. In the `load_settings` Rust command, after loading the main settings file:
   ```rust
   #[cfg(debug_assertions)]
   {
       let dev_path = std::env::current_dir()?.join("settings.dev.json");
       if dev_path.exists() {
           let dev_content = std::fs::read_to_string(&dev_path)?;
           let dev_value: serde_json::Value = serde_json::from_str(&dev_content)?;
           merge_json(&mut settings_value, &dev_value);
       }
   }
   ```
2. Add a `merge_json` helper that recursively merges objects (dev values override main values).

### Tests

**Rust unit test** — `src-tauri/src/settings/mod.rs`
```rust
#[cfg(test)]
mod tests {
    use super::merge_json;
    use serde_json::json;

    #[test]
    fn merge_overrides_scalar_values() {
        let mut base = json!({ "a": 1, "b": 2 });
        let overlay = json!({ "b": 99 });
        merge_json(&mut base, &overlay);
        assert_eq!(base, json!({ "a": 1, "b": 99 }));
    }

    #[test]
    fn merge_deep_merges_objects() {
        let mut base = json!({ "github": { "authMethod": "ghCli", "pollInterval": 60 } });
        let overlay = json!({ "github": { "pollInterval": 30 } });
        merge_json(&mut base, &overlay);
        assert_eq!(base["github"]["authMethod"], "ghCli"); // preserved
        assert_eq!(base["github"]["pollInterval"], 30);     // overridden
    }

    #[test]
    fn merge_adds_new_keys() {
        let mut base = json!({ "a": 1 });
        let overlay = json!({ "b": 2 });
        merge_json(&mut base, &overlay);
        assert_eq!(base, json!({ "a": 1, "b": 2 }));
    }

    #[test]
    fn merge_replaces_arrays() {
        let mut base = json!({ "repos": [1, 2] });
        let overlay = json!({ "repos": [3] });
        merge_json(&mut base, &overlay);
        assert_eq!(base["repos"], json!([3])); // replaced, not appended
    }
}
```

---

## 13. Badge Showcase Window [Skip/Defer]

**Skip.** Developer tool only. If implemented later, no tests required beyond manual visual verification.

---

## 14. Theme-Aware Tray Icon [Low]

**Goal:** Switch tray icon between light/dark variants based on system theme.

### Files to modify
- `src-tauri/src/platform/tray.rs`
- Add icon assets: `src-tauri/icons/tray-light.png`, `src-tauri/icons/tray-dark.png`

### Steps
1. In `setup_tray`, detect system theme and pick the appropriate icon:
   ```rust
   let theme = app.get_webview_window("main")
       .map(|w| w.theme().unwrap_or(tauri::Theme::Light))
       .unwrap_or(tauri::Theme::Light);
   let icon_path = match theme {
       tauri::Theme::Dark => "icons/tray-light.png",  // light icon on dark background
       _ => "icons/tray-dark.png",                     // dark icon on light background
   };
   ```
2. Listen for theme changes and update the tray icon dynamically. Tauri v2 supports `tray.set_icon()`.
3. On the frontend, emit a `theme-changed` event when theme switches; listen in Rust to update tray.

### Tests

**E2E** — update `tests/e2e/theme.spec.ts`
```typescript
test('tray icon changes when theme switches', async ({ page }) => {
  // This is hard to test in Playwright (tray is OS-level, not in webview).
  // Instead, verify the frontend emits the correct event:
  await injectCompletedSetup(page);
  await page.goto('/');
  await waitForAppReady(page);

  const emittedEvents: string[] = [];
  await page.evaluate(() => {
    const orig = (window as any).__TAURI_INTERNALS__.invoke;
    (window as any).__TAURI_INTERNALS__.invoke = async (cmd: string, ...args: any[]) => {
      if (cmd === 'plugin:event|emit') emittedEvents.push(JSON.stringify(args));
      return orig(cmd, ...args);
    };
  });

  // Toggle theme to dark
  // Verify theme-changed event was emitted
});
```

Primarily a manual verification feature — tray icon rendering is OS-dependent.

---

## 15. E Key to Collapse All [Low]

**Goal:** Press E to collapse all expanded repo groups / inline expansions.

### Files to modify
- `src/hooks/useKeyboardNav.ts`
- `src/stores/ui-store.ts`

### Steps
1. Add `collapseAllRepoGroups` action to `ui-store.ts`:
   ```typescript
   collapseAllRepoGroups: () => set({ expandedRepoGroups: new Set() }),
   ```
2. Add a case in `useKeyboardNav.ts` keydown handler:
   ```typescript
   case 'e':
   case 'E':
     useUiStore.getState().collapseAllRepoGroups();
     useUiStore.getState().collapseAllPrs?.();
     break;
   ```

### Tests

**Unit** — update `src/stores/__tests__/ui-store.test.ts`
```typescript
describe('collapseAllRepoGroups', () => {
  it('clears all expanded repo groups', () => {
    useUiStore.setState({
      expandedRepoGroups: new Set(['owner/repo1', 'owner/repo2']),
    });
    useUiStore.getState().collapseAllRepoGroups();
    expect(useUiStore.getState().expandedRepoGroups.size).toBe(0);
  });
});
```

**E2E** — update `tests/e2e/keyboard-nav.spec.ts`
```typescript
test('pressing E collapses all expanded repo groups', async ({ page }) => {
  await injectCompletedSetup(page);
  await page.goto('/');
  await waitForAppReady(page);
  await injectMockPrs(page); // PRs from multiple repos

  // Verify at least one repo group is expanded (PRs visible)
  await expect(page.locator('[data-pr-card]').first()).toBeVisible();

  // Press E
  await page.keyboard.press('e');

  // Verify all groups are collapsed (no PR cards visible, only group headers)
  // Note: depends on UI implementation — may need to check for collapsed state
});
```

---

## Implementation Order

Recommended order based on impact and dependency:

| Order | Feature | Effort | Unit Tests | E2E Tests |
|-------|---------|--------|------------|-----------|
| 1 | ADO client retry (#2) | Small | 8 tests | — |
| 2 | PR card stats (#5) | Small | — | 2 tests |
| 3 | Review sort modes (#4) | Small | 5 tests | 2 tests |
| 4 | E key collapse (#15) | Tiny | 1 test | 1 test |
| 5 | Staggered polling (#8) | Tiny | 2 tests | — |
| 6 | Eager tab loading (#9) | Small | — | 2 tests |
| 7 | File logging (#10) | Small | 1 Rust test | — |
| 8 | PR detail pop-out (#1) | Medium | 3 tests | 2 tests |
| 9 | Bypass merge (#3) | Small | 1 test | 1 test |
| 10 | Batch worktree (#7) | Small | 3 tests | — |
| 11 | Inline card expansion (#6) | Medium | 2 tests | 2 tests |
| 12 | Theme-aware tray (#14) | Small | — | 1 test (limited) |
| 13 | Settings dev overlay (#12) | Small | 4 Rust tests | — |
| 14 | Lock file (#11) | Skip | — | — |
| 15 | Badge showcase (#13) | Skip | — | — |

**Total new tests: ~36 unit + ~13 E2E = ~49 tests**
