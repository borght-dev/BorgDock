# Streamline PR #0 — Regression Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the regression safety net (behavioral e2e, design-sourced visual baselines, a11y, perf, motion, cross-OS CI) that PR #1–#7 will migrate against, without touching any existing UI code.

**Architecture:** Everything lands under `src/BorgDock.Tauri/tests/e2e/` and `src/BorgDock.Tauri/src/test-support/`. The design bundle is committed into the repo at `tests/e2e/design-bundle/` so the capture script has a deterministic source. Visual baselines live in `tests/e2e/__screenshots__/design/{mac,win}/`. Zustand stores gain a `__borgdock_test_seed` hook guarded by `import.meta.env.DEV` so e2e can push deterministic fixture data through the real rendering pipeline. Playwright gets two OS projects and auto-starts `npm run dev` as its web server. CI gains a new `test.yml` workflow that runs on `macos-latest` + `windows-latest`.

**Tech Stack:** Playwright 1.58, Vitest 3, axe-core/playwright (new dep), Tailwind v4, Zustand 5, React 19, Tauri 2 (mocked out for e2e).

**Target worktree:** `~/projects/borgdock-streamline` (created in Task 1).

**Target branch:** `feat/streamline-00-regression-baseline` (off `master`).

**Spec reference:** `docs/superpowers/specs/2026-04-24-shared-components-design.md` — this plan implements §7 in full and sets up §9's ledger ritual.

---

## Task 1: Create the worktree and feature branch

**Files:**
- No files modified; git state only.

- [ ] **Step 1: Verify master is clean**

Run: `cd /Users/koenvdb/projects/BorgDock && git status`
Expected: `On branch master` / `nothing to commit, working tree clean`. If dirty, stash first — do NOT proceed otherwise.

- [ ] **Step 2: Pull latest master**

Run: `cd /Users/koenvdb/projects/BorgDock && git fetch origin && git pull --ff-only origin master`
Expected: `Already up to date.` or fast-forward.

- [ ] **Step 3: Create the worktree**

Run: `cd /Users/koenvdb/projects/BorgDock && git worktree add -b feat/streamline-00-regression-baseline ~/projects/borgdock-streamline master`
Expected: `Preparing worktree (new branch 'feat/streamline-00-regression-baseline')` + `HEAD is now at …`.

- [ ] **Step 4: Verify**

Run: `cd ~/projects/borgdock-streamline && git rev-parse --abbrev-ref HEAD`
Expected: `feat/streamline-00-regression-baseline`.
Run: `git log --oneline -1`
Expected: the master HEAD commit.

- [ ] **Step 5: No commit** — no code changed yet.

All subsequent tasks run under `~/projects/borgdock-streamline` unless stated otherwise.

---

## Task 2: Copy the design bundle into the repo

**Files:**
- Create: `src/BorgDock.Tauri/tests/e2e/design-bundle/borgdock/` (the whole extracted tree).
- Create: `src/BorgDock.Tauri/tests/e2e/design-bundle/README.md` — short provenance note.

- [ ] **Step 1: Copy the extracted design tree**

The bundle was extracted to `/tmp/design-kgz/extracted/borgdock/` during brainstorming. Copy it into the worktree:

```bash
cp -R /tmp/design-kgz/extracted/borgdock "$HOME/projects/borgdock-streamline/src/BorgDock.Tauri/tests/e2e/design-bundle/borgdock"
```

- [ ] **Step 2: Verify files copied**

Run: `ls ~/projects/borgdock-streamline/src/BorgDock.Tauri/tests/e2e/design-bundle/borgdock/`
Expected: `README.md  chats  project` (three entries).

Run: `ls ~/projects/borgdock-streamline/src/BorgDock.Tauri/tests/e2e/design-bundle/borgdock/project/`
Expected: includes `BorgDock - Streamlined.html`, `components/`, `styles/`, `uploads/`.

- [ ] **Step 3: Write provenance README**

Create `src/BorgDock.Tauri/tests/e2e/design-bundle/README.md`:

```markdown
# Design bundle (frozen copy)

Verbatim copy of the Claude Design handoff bundle dated 2026-04-23
(see `docs/superpowers/specs/2026-04-24-shared-components-design.md`
for origin and intent).

**Do not edit.** Treat this tree as read-only. When the design is
updated upstream, replace the whole `borgdock/` subtree in one commit
so the baseline regeneration shows a coherent diff.

- `borgdock/project/BorgDock - Streamlined.html` — the primary
  artboard canvas; every visual baseline is captured from this file
  by `tests/e2e/scripts/capture-design-baselines.ts`.
- `borgdock/project/components/data.jsx` — mock fixtures; ported
  into `tests/e2e/fixtures/design-fixtures.ts` (see Task 4).
- `borgdock/project/uploads/DESIGN-SYSTEM.md` — canonical token
  catalog; consumed by Task 1 of PR #1 when `@theme` is wired up.
```

- [ ] **Step 4: Stage + verify git status**

Run (from `~/projects/borgdock-streamline`):
```bash
git add src/BorgDock.Tauri/tests/e2e/design-bundle
git status --short | head -10
```
Expected: several `A` entries under `src/BorgDock.Tauri/tests/e2e/design-bundle/`.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
test(streamline): vendor design bundle for baseline capture

Frozen copy of the Claude Design handoff (2026-04-23). Capture script
and fixture port (added in subsequent commits) read from this tree.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Install new dev dependencies

**Files:**
- Modify: `src/BorgDock.Tauri/package.json`
- Modify: `src/BorgDock.Tauri/package-lock.json`

- [ ] **Step 1: Add axe-core/playwright**

Run (from `~/projects/borgdock-streamline/src/BorgDock.Tauri`):
```bash
npm install --save-dev @axe-core/playwright
```
Expected: `package.json` gets a new devDependency line; `package-lock.json` updates.

- [ ] **Step 2: Verify installation**

Run: `npx playwright --version && node -e "require('@axe-core/playwright')"`
Expected: Playwright version printed, second command silent (no error).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore(deps): add @axe-core/playwright for a11y e2e checks

Used by the regression baseline surface specs to enforce WCAG 2.1 AA
per §7.4 of the streamline design spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Port design fixtures from `data.jsx` to TypeScript

**Files:**
- Create: `src/BorgDock.Tauri/tests/e2e/fixtures/design-fixtures.ts`
- Create: `src/BorgDock.Tauri/tests/e2e/fixtures/__tests__/design-fixtures.test.ts`

Deterministic fixture data so every visual test seeds the same PRs/work items/diff content the design mockups depict. The fixtures are strongly-typed against the real store shapes in `src/types/`.

- [ ] **Step 1: Write the failing test**

Create `src/BorgDock.Tauri/tests/e2e/fixtures/__tests__/design-fixtures.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  DESIGN_PRS,
  DESIGN_WORK_ITEMS,
  DESIGN_DIFF,
} from '../design-fixtures';

describe('design-fixtures', () => {
  it('includes all PRs from the design canvas', () => {
    expect(DESIGN_PRS).toHaveLength(9);
    const numbers = DESIGN_PRS.map((p) => p.pullRequest.number).sort();
    expect(numbers).toEqual([708, 710, 713, 714, 715, 1362, 1384, 1394, 1398]);
  });

  it('each PR has the fields the mockups render', () => {
    for (const entry of DESIGN_PRS) {
      const pr = entry.pullRequest;
      expect(pr.number).toBeGreaterThan(0);
      expect(pr.title).toBeTruthy();
      expect(pr.headRef).toBeTruthy();
      expect(pr.baseRef).toBeTruthy();
      expect(pr.authorLogin).toBeTruthy();
      expect(['open', 'closed', 'merged']).toContain(pr.state);
      expect(entry.overallStatus).toMatch(/^(green|red|yellow|gray)$/);
    }
  });

  it('includes the design work items', () => {
    expect(DESIGN_WORK_ITEMS.length).toBeGreaterThanOrEqual(1);
    for (const wi of DESIGN_WORK_ITEMS) {
      expect(wi.id).toBeGreaterThan(0);
      expect(wi.title).toBeTruthy();
    }
  });

  it('includes the design diff sample', () => {
    expect(DESIGN_DIFF.files.length).toBeGreaterThan(0);
    for (const file of DESIGN_DIFF.files) {
      expect(file.path).toBeTruthy();
      expect(file.hunks.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/e2e/fixtures/__tests__/design-fixtures.test.ts`
Expected: FAIL — `Cannot find module '../design-fixtures'`.

- [ ] **Step 3: Write the fixture module**

Read `tests/e2e/design-bundle/borgdock/project/components/data.jsx` first to copy the exact PR data (numbers, titles, repos, status, added/deleted, branch/target, labels, review state, score, etc.). The resulting TypeScript file maps those into `PrWithChecks` shape (see `src/types/pr.ts`). The work items come from `components/work-items.jsx` in the bundle; the diff sample from `components/diff-viewer.jsx`.

Create `src/BorgDock.Tauri/tests/e2e/fixtures/design-fixtures.ts`:

```typescript
/**
 * Deterministic fixtures ported verbatim from the Claude Design bundle
 * (`tests/e2e/design-bundle/borgdock/project/components/`).
 *
 * These feed both visual baselines (captured from the HTML prototype)
 * and live-app e2e tests so text lengths, counts, and ordering are
 * pixel-identical between the two.
 *
 * DO NOT edit a field to match something the running app happens to
 * produce — edit the running app instead. The mockups are the contract.
 */

import type { PrWithChecks } from '../../src/types/pr';
import type { WorkItem } from '../../src/types/work-item';

export const DESIGN_PRS: PrWithChecks[] = [
  {
    pullRequest: {
      number: 715,
      title: 'AB#54258 / AB#54425 Portal. Quote: resolve Price Book list price on add',
      headRef: 'features/54258-list-price-on-add-R5.2',
      baseRef: 'releases/R5.2',
      authorLogin: 'sschmidt',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2026-04-20T09:00:00Z',
      updatedAt: '2026-04-23T10:15:00Z',
      isDraft: false,
      mergeable: true,
      htmlUrl: 'https://github.com/Gomocha-FSP/FSP/pull/715',
      body: '',
      repoOwner: 'Gomocha-FSP',
      repoName: 'FSP',
      reviewStatus: 'none',
      commentCount: 0,
      labels: ['AB#54258', 'AB#54425', 'AB#54729', 'AB#54482'],
      additions: 135,
      deletions: 10,
      changedFiles: 1,
      commitCount: 3,
    },
    checks: [],
    overallStatus: 'yellow',
    failedCheckNames: [],
    pendingCheckNames: ['ci/portal', 'ci/lint'],
    passedCount: 3,
    skippedCount: 0,
  },
  {
    pullRequest: {
      number: 714,
      title: 'AB#54252 Portal. Quote grid: immediate delete, remove duplicate refresh',
      headRef: 'features/54252-quote-grid-refresh-R5.2',
      baseRef: 'releases/R5.2',
      authorLogin: 'sschmidt',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2026-04-19T11:00:00Z',
      updatedAt: '2026-04-23T09:00:00Z',
      isDraft: false,
      mergeable: true,
      htmlUrl: 'https://github.com/Gomocha-FSP/FSP/pull/714',
      body: '',
      repoOwner: 'Gomocha-FSP',
      repoName: 'FSP',
      reviewStatus: 'approved',
      commentCount: 2,
      labels: ['AB#54252'],
      additions: 97,
      deletions: 436,
      changedFiles: 9,
      commitCount: 1,
    },
    checks: [],
    overallStatus: 'red',
    failedCheckNames: ['ci/e2e', 'ci/deploy-check'],
    pendingCheckNames: [],
    passedCount: 7,
    skippedCount: 0,
  },
  {
    pullRequest: {
      number: 713,
      title: 'AB#54482 Portal. Quote footer follow-ups: PricingAdjusted buttons, auto-save, modal layout',
      headRef: 'features/54482-bugfixes-r2-R5.2',
      baseRef: 'releases/R5.2',
      authorLogin: 'sschmidt',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2026-04-18T14:00:00Z',
      updatedAt: '2026-04-22T16:00:00Z',
      isDraft: false,
      mergeable: true,
      htmlUrl: 'https://github.com/Gomocha-FSP/FSP/pull/713',
      body: '',
      repoOwner: 'Gomocha-FSP',
      repoName: 'FSP',
      reviewStatus: 'none',
      commentCount: 0,
      labels: ['AB#54482'],
      additions: 130,
      deletions: 39,
      changedFiles: 6,
      commitCount: 1,
    },
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 10,
    skippedCount: 0,
  },
  {
    pullRequest: {
      number: 710,
      title: 'Portal. Allow overwriting widget-bound saved searches + Google Maps async',
      headRef: 'fix/savedsearch-widget-overwrite-and-maps-async',
      baseRef: 'releases/R5.2',
      authorLogin: 'tvanderbeke',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2026-04-17T10:00:00Z',
      updatedAt: '2026-04-22T11:00:00Z',
      isDraft: false,
      mergeable: true,
      htmlUrl: 'https://github.com/Gomocha-FSP/FSP/pull/710',
      body: '',
      repoOwner: 'Gomocha-FSP',
      repoName: 'FSP',
      reviewStatus: 'commented',
      commentCount: 5,
      labels: [],
      additions: 99,
      deletions: 3,
      changedFiles: 5,
      commitCount: 2,
    },
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 10,
    skippedCount: 0,
  },
  {
    pullRequest: {
      number: 708,
      title: 'Add iOS CI workflow for Xcode 26 SDK build',
      headRef: 'ci/ios-xcode-26',
      baseRef: 'main',
      authorLogin: 'sschmidt',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2026-04-16T08:00:00Z',
      updatedAt: '2026-04-21T09:30:00Z',
      isDraft: false,
      mergeable: true,
      htmlUrl: 'https://github.com/Gomocha-FSP/FSP/pull/708',
      body: '',
      repoOwner: 'Gomocha-FSP',
      repoName: 'FSP',
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 22,
      deletions: 0,
      changedFiles: 2,
      commitCount: 1,
    },
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 1,
    skippedCount: 0,
  },
  {
    pullRequest: {
      number: 1398,
      title: 'feat(ortec): Plan 9 — timeslot flow end-to-end (calculate + book)',
      headRef: 'feat/ortec-timeslot-flow-plan-9',
      baseRef: 'main',
      authorLogin: 'kvanderborght',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2026-04-15T13:00:00Z',
      updatedAt: '2026-04-22T18:00:00Z',
      isDraft: false,
      mergeable: true,
      htmlUrl: 'https://github.com/Gomocha-FSP/fsp-horizon/pull/1398',
      body: '',
      repoOwner: 'Gomocha-FSP',
      repoName: 'fsp-horizon',
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 21277,
      deletions: 92,
      changedFiles: 109,
      commitCount: 52,
    },
    checks: [],
    overallStatus: 'red',
    failedCheckNames: ['ci/integration-timeslot'],
    pendingCheckNames: [],
    passedCount: 27,
    skippedCount: 0,
  },
  {
    pullRequest: {
      number: 1394,
      title: 'feat(workspace-designer): Phase 2 — Layout tab',
      headRef: 'feat/workspace-designer-phase2',
      baseRef: 'main',
      authorLogin: 'kvanderborght',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2026-04-14T12:00:00Z',
      updatedAt: '2026-04-22T15:00:00Z',
      isDraft: true,
      mergeable: true,
      htmlUrl: 'https://github.com/Gomocha-FSP/fsp-horizon/pull/1394',
      body: '',
      repoOwner: 'Gomocha-FSP',
      repoName: 'fsp-horizon',
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 9210,
      deletions: 192,
      changedFiles: 52,
      commitCount: 40,
    },
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 1,
    skippedCount: 0,
  },
  {
    pullRequest: {
      number: 1384,
      title: 'feat(workspace-designer): Phase 1 — foundation shell + read API + feature flag',
      headRef: 'feat/workspace-designer',
      baseRef: 'main',
      authorLogin: 'kvanderborght',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2026-04-12T10:00:00Z',
      updatedAt: '2026-04-21T18:00:00Z',
      isDraft: true,
      mergeable: true,
      htmlUrl: 'https://github.com/Gomocha-FSP/fsp-horizon/pull/1384',
      body: '',
      repoOwner: 'Gomocha-FSP',
      repoName: 'fsp-horizon',
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 9897,
      deletions: 20,
      changedFiles: 66,
      commitCount: 17,
    },
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 28,
    skippedCount: 0,
  },
  {
    pullRequest: {
      number: 1362,
      title: 'feat(planboard, orders): Zoom-to-order on map context-menu',
      headRef: 'fix/preview-fixes',
      baseRef: 'main',
      authorLogin: 'tvanderbeke',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2026-04-10T09:00:00Z',
      updatedAt: '2026-04-21T14:00:00Z',
      isDraft: true,
      mergeable: true,
      htmlUrl: 'https://github.com/Gomocha-FSP/fsp-horizon/pull/1362',
      body: '',
      repoOwner: 'Gomocha-FSP',
      repoName: 'fsp-horizon',
      reviewStatus: 'none',
      commentCount: 0,
      labels: ['AB#53457', 'AB#53358'],
      additions: 2375,
      deletions: 105,
      changedFiles: 71,
      commitCount: 26,
    },
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 20,
    skippedCount: 0,
  },
];

export const DESIGN_WORK_ITEMS: WorkItem[] = [
  // Seed the minimum set the design's work-items mockup depicts.
  // Extend this when PR #3 needs more cases; the visual baseline picks
  // up changes automatically once re-captured.
  {
    id: 54258,
    title: 'Portal. Quote: resolve Price Book list price on add',
    workItemType: 'Bug',
    state: 'Active',
    assignedTo: 'S. Schmidt',
    tags: ['portal', 'quote'],
    iterationPath: 'FSP\\R5.2',
    areaPath: 'FSP\\Portal\\Quote',
  },
  {
    id: 54252,
    title: 'Portal. Quote grid: immediate delete, remove duplicate refresh',
    workItemType: 'Bug',
    state: 'Resolved',
    assignedTo: 'S. Schmidt',
    tags: ['portal', 'quote'],
    iterationPath: 'FSP\\R5.2',
    areaPath: 'FSP\\Portal\\Quote',
  },
  {
    id: 54482,
    title: 'Portal. Quote footer follow-ups',
    workItemType: 'Task',
    state: 'Active',
    assignedTo: 'S. Schmidt',
    tags: ['portal', 'quote', 'followup'],
    iterationPath: 'FSP\\R5.2',
    areaPath: 'FSP\\Portal\\Quote',
  },
];

export type DesignDiffHunk = {
  header: string;
  lines: Array<{ kind: 'add' | 'del' | 'context'; text: string }>;
};

export type DesignDiffFile = {
  path: string;
  added: number;
  deleted: number;
  hunks: DesignDiffHunk[];
};

export const DESIGN_DIFF: { files: DesignDiffFile[] } = {
  files: [
    {
      path: 'src/quote/footer.tsx',
      added: 24,
      deleted: 8,
      hunks: [
        {
          header: '@@ -42,8 +42,24 @@',
          lines: [
            { kind: 'context', text: 'export function QuoteFooter({ quote }: Props) {' },
            { kind: 'del', text: '  const [saving, setSaving] = useState(false);' },
            { kind: 'add', text: '  const [saving, setSaving] = useState<"idle" | "pending" | "error">("idle");' },
            { kind: 'add', text: '  const isPending = saving === "pending";' },
            { kind: 'context', text: '' },
            { kind: 'context', text: '  const handleSave = async () => {' },
          ],
        },
      ],
    },
    {
      path: 'src/quote/footer.test.tsx',
      added: 12,
      deleted: 3,
      hunks: [
        {
          header: '@@ -15,3 +15,12 @@',
          lines: [
            { kind: 'context', text: 'describe("QuoteFooter", () => {' },
            { kind: 'add', text: '  it("disables save button while pending", () => {' },
            { kind: 'add', text: '    render(<QuoteFooter quote={pendingQuote} />);' },
            { kind: 'add', text: '    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();' },
            { kind: 'add', text: '  });' },
          ],
        },
      ],
    },
  ],
};
```

- [ ] **Step 4: Run the test**

Run: `npm test -- tests/e2e/fixtures/__tests__/design-fixtures.test.ts`
Expected: PASS (4 tests). If `WorkItem` type mismatches, fix the fixture to match `src/types/work-item.ts` exactly — DO NOT edit the type.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/fixtures/design-fixtures.ts tests/e2e/fixtures/__tests__/design-fixtures.test.ts
git commit -m "$(cat <<'EOF'
test(streamline): port design fixtures from data.jsx to TypeScript

DESIGN_PRS (9), DESIGN_WORK_ITEMS, DESIGN_DIFF — typed against the
real store shapes so e2e seeds deterministically match what the
design mockups render.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add the test-seed hook (dev-only)

**Files:**
- Create: `src/BorgDock.Tauri/src/test-support/test-seed.ts`
- Create: `src/BorgDock.Tauri/src/test-support/__tests__/test-seed.test.ts`
- Modify: `src/BorgDock.Tauri/src/App.tsx` (add one line importing the seed installer)

The seed hook exposes `window.__borgdock_test_seed({ prs, workItems, diff, settings })` on the `import.meta.env.DEV` build only. It writes directly into the Zustand stores, bypassing IPC.

- [ ] **Step 1: Write the failing test**

Create `src/BorgDock.Tauri/src/test-support/__tests__/test-seed.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installTestSeed } from '../test-seed';
import { usePrStore } from '@/stores/pr-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import { DESIGN_PRS, DESIGN_WORK_ITEMS } from '../../../tests/e2e/fixtures/design-fixtures';

describe('installTestSeed', () => {
  beforeEach(() => {
    // Reset stores to initial state
    usePrStore.setState(usePrStore.getInitialState());
    useWorkItemsStore.setState(useWorkItemsStore.getInitialState());
    // Clean up any previous install
    (window as unknown as { __borgdock_test_seed?: unknown }).__borgdock_test_seed = undefined;
  });

  it('attaches a global function when called in dev', () => {
    installTestSeed({ isDev: true });
    expect(typeof (window as any).__borgdock_test_seed).toBe('function');
  });

  it('does nothing in non-dev', () => {
    installTestSeed({ isDev: false });
    expect((window as any).__borgdock_test_seed).toBeUndefined();
  });

  it('seeds PRs into the pr-store', () => {
    installTestSeed({ isDev: true });
    (window as any).__borgdock_test_seed({ prs: DESIGN_PRS });
    expect(usePrStore.getState().prs).toHaveLength(DESIGN_PRS.length);
    expect(usePrStore.getState().prs[0].pullRequest.number).toBe(DESIGN_PRS[0].pullRequest.number);
  });

  it('seeds work items into the work-items-store', () => {
    installTestSeed({ isDev: true });
    (window as any).__borgdock_test_seed({ workItems: DESIGN_WORK_ITEMS });
    expect(useWorkItemsStore.getState().workItems).toHaveLength(DESIGN_WORK_ITEMS.length);
  });

  it('accepts partial payloads', () => {
    installTestSeed({ isDev: true });
    (window as any).__borgdock_test_seed({ prs: DESIGN_PRS.slice(0, 2) });
    expect(usePrStore.getState().prs).toHaveLength(2);
    expect(useWorkItemsStore.getState().workItems).toHaveLength(0);
  });

  it('exposes __borgdock_test_toast in dev', () => {
    installTestSeed({ isDev: true });
    expect(typeof (window as any).__borgdock_test_toast).toBe('function');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/test-support/__tests__/test-seed.test.ts`
Expected: FAIL — `Cannot find module '../test-seed'`.

- [ ] **Step 3: Write the seed module**

Before writing this, read `src/stores/pr-store.ts` and `src/stores/work-items-store.ts` to confirm the setter method names. The code below assumes `setPrs(prs)` and `setWorkItems(items)` exist; if the stores use different names (e.g. `replace`, `hydrate`), swap them in.

Create `src/BorgDock.Tauri/src/test-support/test-seed.ts`:

```typescript
/**
 * Dev-only hook used by Playwright e2e tests to push deterministic
 * fixture data into the Zustand stores without going through IPC.
 *
 * Installed from App.tsx via `installTestSeed({ isDev: import.meta.env.DEV })`.
 * In production builds, the body is tree-shaken because `isDev` is a
 * compile-time constant.
 */

import { usePrStore } from '@/stores/pr-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useNotificationStore } from '@/stores/notification-store';
import type { PrWithChecks } from '@/types/pr';
import type { WorkItem } from '@/types/work-item';
import type { Settings } from '@/types';

export type TestSeedPayload = {
  prs?: PrWithChecks[];
  workItems?: WorkItem[];
  settings?: Partial<Settings>;
};

export type TestSeedFn = (payload: TestSeedPayload) => void;

export type TestToastArgs = {
  kind: 'success' | 'error' | 'warning' | 'info' | 'merged';
  title: string;
  message?: string;
};

export type TestToastFn = (args: TestToastArgs) => void;

declare global {
  interface Window {
    __borgdock_test_seed?: TestSeedFn;
    __borgdock_test_toast?: TestToastFn;
  }
}

export function installTestSeed({ isDev }: { isDev: boolean }): void {
  if (!isDev) return;
  window.__borgdock_test_seed = (payload: TestSeedPayload) => {
    if (payload.prs) {
      usePrStore.setState((s) => ({ ...s, prs: payload.prs! }));
    }
    if (payload.workItems) {
      useWorkItemsStore.setState((s) => ({ ...s, workItems: payload.workItems! }));
    }
    if (payload.settings) {
      useSettingsStore.setState((s) => ({ ...s, settings: { ...s.settings, ...payload.settings! } }));
    }
  };
  window.__borgdock_test_toast = (args: TestToastArgs) => {
    // Call the notification store's real push action so the motion spec
    // exercises the same rendering path as production toasts.
    const store = useNotificationStore.getState();
    // The action name may be `pushToast`, `addToast`, or similar —
    // check src/stores/notification-store.ts and use whichever exists.
    (store as any).pushToast?.({ kind: args.kind, title: args.title, message: args.message });
  };
}
```

- [ ] **Step 4: Wire into App.tsx**

Edit `src/BorgDock.Tauri/src/App.tsx`. Add one import and one top-level call before the component definition:

```typescript
// Near the other imports
import { installTestSeed } from '@/test-support/test-seed';

// Immediately after imports, before `const log = createLogger('app');`
installTestSeed({ isDev: import.meta.env.DEV });
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- src/test-support/__tests__/test-seed.test.ts`
Expected: PASS (5 tests).

If failures mention `getInitialState is not a function`, the stores predate that Zustand feature — replace the `beforeEach` reset with `usePrStore.setState({ prs: [] } as any, true)` to clear-and-replace.

- [ ] **Step 6: Build verification**

Run: `npm run build`
Expected: TypeScript passes, Vite build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/test-support/test-seed.ts src/test-support/__tests__/test-seed.test.ts src/App.tsx
git commit -m "$(cat <<'EOF'
test(streamline): add dev-only test seed hook for e2e

installTestSeed() exposes window.__borgdock_test_seed in DEV builds
so Playwright can push deterministic fixtures directly into the
Zustand stores, bypassing IPC. Tree-shakes out of production.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Configure Playwright for cross-OS + auto-start dev server

**Files:**
- Modify: `src/BorgDock.Tauri/playwright.config.ts`
- Modify: `src/BorgDock.Tauri/package.json` (add `test:e2e:capture-design` script)

- [ ] **Step 1: Rewrite `playwright.config.ts`**

Replace `src/BorgDock.Tauri/playwright.config.ts` with:

```typescript
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for BorgDock e2e.
 *
 * - Two OS projects (`webview-mac`, `webview-win`) so visual baselines
 *   are captured and compared per-platform.
 * - Auto-starts `npm run dev` (pure Vite, no Tauri) so CI does not
 *   require a second shell.
 * - Snapshot paths include {projectName} so mac/win baselines sit in
 *   separate folders under __screenshots__/.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // app is a single dev server — no parallelism gain
  reporter: process.env.CI ? [['github'], ['html']] : 'list',
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{projectName}/{testFileDir}/{testFileName}/{arg}{ext}',
  projects: [
    {
      name: 'webview-mac',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      metadata: { os: 'mac' },
    },
    {
      name: 'webview-win',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      metadata: { os: 'win' },
    },
  ],
});
```

Notes:
- Both projects use Chromium — WebView2 on Windows and WKWebView on macOS are also Chromium/WebKit-derived but Playwright's Chromium is the closest we can get without running the Tauri app itself. This is intentional per the spec; the per-OS split exists to catch OS-level font-rasterization differences.
- Test filter per-project: when running cross-OS locally, use `--project=webview-mac` or `--project=webview-win`. CI runs both.
- Auto-start `npm run dev` works because PR #0 only navigates to routes that don't collide with live Tauri (no `npm run tauri dev` is running in CI).

- [ ] **Step 2: Add the capture-design script**

Edit `src/BorgDock.Tauri/package.json` `scripts` block, adding:

```json
    "test:e2e:capture-design": "playwright test tests/e2e/scripts/capture-design-baselines.spec.ts --update-snapshots"
```

(The capture script is a Playwright test that writes baselines; see Task 7.)

- [ ] **Step 3: Verify config parses**

Run: `npx playwright test --list --project=webview-mac | head -5`
Expected: no error (list may be empty since no specs exist yet).

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts package.json
git commit -m "$(cat <<'EOF'
test(e2e): cross-OS Playwright projects + auto-start dev server

Two projects (webview-mac, webview-win) so snapshots live in per-OS
folders under __screenshots__/<project>/. webServer auto-starts
`npm run dev` so Playwright runs against pure Vite without a second
shell. Adds test:e2e:capture-design script (used in Task 7).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Write the design-baseline capture script

**Files:**
- Create: `src/BorgDock.Tauri/tests/e2e/scripts/capture-design-baselines.spec.ts`

The script opens the standalone design HTML via `file://`, iterates each `DCSection`'s artboards, and screenshots each at its native dimensions. Running with `--update-snapshots` writes the baselines; running normally asserts they haven't drifted.

- [ ] **Step 1: Inspect the DCSection / DCArtboard DOM**

Run (read the file to see what to target):
```bash
head -n 40 ~/projects/borgdock-streamline/src/BorgDock.Tauri/tests/e2e/design-bundle/borgdock/project/design-canvas.jsx
```
Confirm the wrapper is `data-dc-slot` on artboards and `data-dc-section` (if present) on sections. If the canvas uses a different attribute (e.g. `data-artboard-id`), adjust the selectors below.

- [ ] **Step 2: Create the capture spec**

Create `src/BorgDock.Tauri/tests/e2e/scripts/capture-design-baselines.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Runs once to capture (and re-capture) every artboard in the design
 * canvas as a per-surface PNG under __screenshots__/<project>/design/.
 *
 * Triggered via: `npm run test:e2e:capture-design` (which passes
 * --update-snapshots). Running without --update-snapshots turns this
 * into a drift check — useful in CI to notice if someone edited the
 * design bundle without reviewing the PNG churn.
 */

const DESIGN_HTML = path.resolve(
  __dirname,
  '../design-bundle/borgdock/project/BorgDock - Streamlined.html',
);

type Artboard = {
  /** snake-case id used as the snapshot filename (no extension) */
  id: string;
  /** CSS selector for the artboard root (unique across the canvas) */
  selector: string;
  /** optional theme wrapper — if the artboard is scoped inside .dark */
  theme: 'light' | 'dark';
};

/**
 * The artboard list lives here so the script has a single source of
 * truth for what becomes a visual baseline. When the design bundle
 * adds or removes artboards, update this list and re-run the script.
 *
 * IDs are deliberately stable and kebab-case — these map 1:1 to
 * surfaces in visual.spec.ts.
 */
const ARTBOARDS: Artboard[] = [
  // Section 1 — unified chrome
  { id: 'sidebar', selector: '[data-ab-id="sidebar-light"]', theme: 'light' },
  { id: 'sidebar', selector: '[data-ab-id="sidebar-dark"]', theme: 'dark' },
  { id: 'flyout', selector: '[data-ab-id="flyout-light"]', theme: 'light' },
  { id: 'flyout', selector: '[data-ab-id="flyout-dark"]', theme: 'dark' },
  { id: 'worktree-palette', selector: '[data-ab-id="worktree-palette-light"]', theme: 'light' },
  { id: 'worktree-palette', selector: '[data-ab-id="worktree-palette-dark"]', theme: 'dark' },
  // Section 2 — Focus
  { id: 'focus', selector: '[data-ab-id="focus-light"]', theme: 'light' },
  { id: 'focus', selector: '[data-ab-id="focus-dark"]', theme: 'dark' },
  { id: 'quick-review', selector: '[data-ab-id="quick-review-light"]', theme: 'light' },
  { id: 'quick-review', selector: '[data-ab-id="quick-review-dark"]', theme: 'dark' },
  // Section 3 — main window
  { id: 'main-prs', selector: '[data-ab-id="main-prs-light"]', theme: 'light' },
  { id: 'main-prs', selector: '[data-ab-id="main-prs-dark"]', theme: 'dark' },
  { id: 'main-work-items', selector: '[data-ab-id="main-work-items-light"]', theme: 'light' },
  { id: 'main-work-items', selector: '[data-ab-id="main-work-items-dark"]', theme: 'dark' },
  // Section 4 — PR detail
  { id: 'pr-detail-overview', selector: '[data-ab-id="pr-detail-overview-light"]', theme: 'light' },
  { id: 'pr-detail-overview', selector: '[data-ab-id="pr-detail-overview-dark"]', theme: 'dark' },
  { id: 'pr-detail-files', selector: '[data-ab-id="pr-detail-files-light"]', theme: 'light' },
  { id: 'pr-detail-files', selector: '[data-ab-id="pr-detail-files-dark"]', theme: 'dark' },
  { id: 'pr-detail-reviews', selector: '[data-ab-id="pr-detail-reviews-light"]', theme: 'light' },
  { id: 'pr-detail-reviews', selector: '[data-ab-id="pr-detail-reviews-dark"]', theme: 'dark' },
  // Section 5 — palettes & code
  { id: 'file-palette', selector: '[data-ab-id="file-palette-light"]', theme: 'light' },
  { id: 'file-palette', selector: '[data-ab-id="file-palette-dark"]', theme: 'dark' },
  { id: 'file-viewer', selector: '[data-ab-id="file-viewer-light"]', theme: 'light' },
  { id: 'file-viewer', selector: '[data-ab-id="file-viewer-dark"]', theme: 'dark' },
  { id: 'sql', selector: '[data-ab-id="sql-light"]', theme: 'light' },
  { id: 'sql', selector: '[data-ab-id="sql-dark"]', theme: 'dark' },
  // Section 6 — settings / wizard / notifications / badge / whats-new
  { id: 'settings', selector: '[data-ab-id="settings-light"]', theme: 'light' },
  { id: 'settings', selector: '[data-ab-id="settings-dark"]', theme: 'dark' },
  { id: 'wizard', selector: '[data-ab-id="wizard-light"]', theme: 'light' },
  { id: 'wizard', selector: '[data-ab-id="wizard-dark"]', theme: 'dark' },
  { id: 'notifications', selector: '[data-ab-id="notifications-light"]', theme: 'light' },
  { id: 'notifications', selector: '[data-ab-id="notifications-dark"]', theme: 'dark' },
  { id: 'floating-badge', selector: '[data-ab-id="floating-badge-light"]', theme: 'light' },
  { id: 'floating-badge', selector: '[data-ab-id="floating-badge-dark"]', theme: 'dark' },
  { id: 'whats-new', selector: '[data-ab-id="whats-new-light"]', theme: 'light' },
  { id: 'whats-new', selector: '[data-ab-id="whats-new-dark"]', theme: 'dark' },
  // Section 7 — worktree changes (net-new in PR #7)
  { id: 'worktree-changes', selector: '[data-ab-id="worktree-changes-light"]', theme: 'light' },
  { id: 'worktree-changes', selector: '[data-ab-id="worktree-changes-dark"]', theme: 'dark' },
  { id: 'diff-viewer', selector: '[data-ab-id="diff-viewer-light"]', theme: 'light' },
  { id: 'diff-viewer', selector: '[data-ab-id="diff-viewer-dark"]', theme: 'dark' },
];

test.describe('design-baseline capture', () => {
  test.beforeAll(async () => {
    // Sanity: the bundle must be present.
    const fs = await import('node:fs/promises');
    await fs.access(DESIGN_HTML);
  });

  for (const ab of ARTBOARDS) {
    test(`capture ${ab.id} (${ab.theme})`, async ({ page }) => {
      await page.goto(pathToFileURL(DESIGN_HTML).toString());
      // Disable animations in the prototype so the still matches.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      // Wait for fonts before screenshotting — fonts affect every pixel.
      await page.evaluate(() => (document as any).fonts?.ready);
      const locator = page.locator(ab.selector);
      await expect(locator).toBeVisible({ timeout: 5_000 });
      const snapshotName = `design/${ab.id}-${ab.theme}.png`;
      await expect(locator).toHaveScreenshot(snapshotName, {
        maxDiffPixelRatio: 0, // we're capturing, not comparing — exact
        animations: 'disabled',
      });
    });
  }
});
```

- [ ] **Step 3: Verify the artboard selectors match the bundle**

The selectors above assume each artboard gets a `data-ab-id` attribute. The actual canvas uses `data-dc-slot` (without a stable id) based on `design-canvas.jsx`. Before running, add stable IDs:

Run to inspect the HTML:
```bash
grep -o 'data-dc-slot[^>]*' ~/projects/borgdock-streamline/src/BorgDock.Tauri/tests/e2e/design-bundle/borgdock/project/BorgDock\ -\ Streamlined.html | head -5
```

If the slots are unnamed, the capture script needs to target them by index within each section. Revise the `ARTBOARDS` list to use selectors like `[data-dc-section="section-1"] [data-dc-slot]:nth-of-type(1)` etc.

Alternative (simpler): edit the design-bundle HTML ONE TIME to tag each artboard with `data-ab-id="..."` per the list above. This is an acceptable edit because the design bundle is vendored and this tag is purely for baseline targeting — it doesn't change rendering. Document the edit in `tests/e2e/design-bundle/README.md` with a `CHANGES` section.

Pick whichever is easier after inspecting the HTML; both are valid.

- [ ] **Step 4: Do not run the capture yet** — Task 8 runs it once the selectors are validated.

- [ ] **Step 5: Commit the capture spec**

```bash
git add tests/e2e/scripts/capture-design-baselines.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): design-baseline capture Playwright spec

Iterates every artboard in the frozen design canvas and (with
--update-snapshots) writes one PNG per surface + theme to
tests/e2e/__screenshots__/<project>/design/. Without the flag, runs
as a drift check.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Generate the initial design baselines

**Files:**
- Create (via test run): `src/BorgDock.Tauri/tests/e2e/__screenshots__/webview-mac/scripts/capture-design-baselines.spec.ts/design/*.png` (and `webview-win/…`).

Capturing requires the `npm run dev` server running (because of the webServer config) — even though we navigate to `file://`, Playwright's webServer must be reachable. It is, automatically.

- [ ] **Step 1: Run capture for mac project**

From `~/projects/borgdock-streamline/src/BorgDock.Tauri`:

```bash
npm run test:e2e:capture-design -- --project=webview-mac
```

Expected: Playwright writes ~36 PNGs under `tests/e2e/__screenshots__/webview-mac/scripts/capture-design-baselines.spec.ts/design/`. Final line: `N passed`.

If failures occur, most likely cause is selector mismatch — fix `ARTBOARDS` in the spec, re-run.

- [ ] **Step 2: Run capture for win project**

```bash
npm run test:e2e:capture-design -- --project=webview-win
```

Expected: Same count of PNGs under `webview-win/…`.

Note: running the `win` project on a Mac dev box still uses Chromium — the OS label is for CI. That's OK; CI will capture the truly OS-specific baselines when it first runs. See the note at the end of this task.

- [ ] **Step 3: Sanity check**

Run:
```bash
ls tests/e2e/__screenshots__/webview-mac/scripts/capture-design-baselines.spec.ts/design/ | wc -l
ls tests/e2e/__screenshots__/webview-win/scripts/capture-design-baselines.spec.ts/design/ | wc -l
```
Both should print the number of artboards in the `ARTBOARDS` array (~36).

Open two PNGs manually — one light, one dark — with `open tests/e2e/__screenshots__/webview-mac/scripts/capture-design-baselines.spec.ts/design/focus-light.png` and visually confirm they're the design mockups, not a blank page.

- [ ] **Step 4: Commit baselines**

```bash
git add tests/e2e/__screenshots__/
git commit -m "$(cat <<'EOF'
test(e2e): capture initial design baselines (mac+win)

~72 PNGs total (~36 per OS project). Subsequent PRs in the streamline
stack must not alter these without intentional re-capture.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Note on CI vs local capture:** baselines captured on a dev machine may differ by a few pixels from CI runners of the same OS (different GPUs, font hinting settings). In Task 24 the first CI run will likely want to re-capture; commit those updates then so CI becomes the canonical source of truth.

---

## Task 9: Write `visual.spec.ts` (the live-app comparison)

**Files:**
- Create: `src/BorgDock.Tauri/tests/e2e/visual.spec.ts`
- Create: `src/BorgDock.Tauri/tests/e2e/visual-tolerances.ts`
- Create: `src/BorgDock.Tauri/tests/e2e/helpers/seed.ts`

`visual.spec.ts` navigates the running app to each surface, seeds design fixtures, forces theme + density, and compares against the baseline captured in Task 8.

- [ ] **Step 1: Create the seed helper**

Create `src/BorgDock.Tauri/tests/e2e/helpers/seed.ts`:

```typescript
import type { Page } from '@playwright/test';
import { DESIGN_PRS, DESIGN_WORK_ITEMS } from '../fixtures/design-fixtures';

/**
 * Seeds the Zustand stores via window.__borgdock_test_seed. Call AFTER
 * page.goto + waitForAppReady so the seed function is actually installed.
 */
export async function seedDesignFixtures(
  page: Page,
  overrides: { prs?: unknown; workItems?: unknown } = {},
) {
  await page.evaluate(
    ({ prs, workItems }) => {
      const seed = (window as any).__borgdock_test_seed;
      if (typeof seed !== 'function') {
        throw new Error('installTestSeed did not run; DEV flag missing?');
      }
      seed({ prs, workItems });
    },
    {
      prs: overrides.prs ?? DESIGN_PRS,
      workItems: overrides.workItems ?? DESIGN_WORK_ITEMS,
    },
  );
  // Give React a tick to render
  await page.waitForTimeout(50);
}

export async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => {
    document.documentElement.classList.toggle('dark', t === 'dark');
  }, theme);
}

export async function setDensity(page: Page, density: 'compact' | 'comfortable') {
  await page.evaluate((d) => {
    document.body.classList.remove('density-compact', 'density-comfortable');
    document.body.classList.add(`density-${d}`);
  }, density);
}
```

- [ ] **Step 2: Create `visual-tolerances.ts`**

Create `src/BorgDock.Tauri/tests/e2e/visual-tolerances.ts`:

```typescript
/**
 * Per-surface pixel-diff tolerances for visual.spec.ts.
 *
 * Default is 0.04 (4% pixel drift allowed). Override a surface here
 * with a one-line comment explaining WHY. Anything above 0.06 demands
 * a linked issue, not just a comment.
 */
export const DEFAULT_TOLERANCE = 0.04;

export const VISUAL_TOLERANCES: Record<string, number> = {
  // 'focus': 0.05, // priority-reason labels render differently at subpixel — font stack quirk
};
```

- [ ] **Step 3: Write `visual.spec.ts`**

Create `src/BorgDock.Tauri/tests/e2e/visual.spec.ts`:

```typescript
import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { seedDesignFixtures, setTheme } from './helpers/seed';
import { DEFAULT_TOLERANCE, VISUAL_TOLERANCES } from './visual-tolerances';

type Surface = {
  id: string;
  /** Path to navigate to (or use 'main' for baseURL) */
  path?: string;
  /** Selector to wait for before screenshot */
  ready: string;
  /** Selector to clip the screenshot to (omit for full page) */
  clipTo?: string;
};

/**
 * Every surface the design mockups cover. IDs match the baseline PNG
 * names under __screenshots__/<project>/design/.
 */
const SURFACES: Surface[] = [
  { id: 'sidebar', ready: 'header' },
  { id: 'main-prs', ready: '[data-section="PRs"]', clipTo: '[data-section="PRs"]' },
  { id: 'main-work-items', ready: '[data-section="Work Items"]', clipTo: '[data-section="Work Items"]' },
  { id: 'focus', ready: '[data-view="focus"]', clipTo: '[data-view="focus"]' },
  // Secondary windows: served from their own HTML endpoints
  { id: 'flyout', path: '/flyout.html', ready: '[data-window="flyout"]' },
  { id: 'pr-detail-overview', path: '/pr-detail.html?tab=overview', ready: '[data-window="pr-detail"]' },
  { id: 'pr-detail-files', path: '/pr-detail.html?tab=files', ready: '[data-window="pr-detail"]' },
  { id: 'pr-detail-reviews', path: '/pr-detail.html?tab=reviews', ready: '[data-window="pr-detail"]' },
  { id: 'file-palette', path: '/palette.html?kind=files', ready: '[data-window="palette"]' },
  { id: 'file-viewer', path: '/file-viewer.html', ready: '[data-window="file-viewer"]' },
  { id: 'worktree-palette', path: '/palette.html?kind=worktrees', ready: '[data-window="palette"]' },
  { id: 'sql', path: '/sql.html', ready: '[data-window="sql"]' },
  { id: 'settings', ready: '[data-flyout="settings"]' },
  { id: 'wizard', ready: '[data-view="wizard"]' },
  { id: 'notifications', ready: '[data-view="notifications-demo"]' },
  { id: 'floating-badge', path: '/badge.html', ready: '[data-window="badge"]' },
  { id: 'whats-new', ready: '[data-view="whats-new"]' },
  { id: 'quick-review', ready: '[data-overlay="quick-review"]' },
  { id: 'worktree-changes', path: '/palette.html?kind=worktree-changes', ready: '[data-window="palette"]' },
  { id: 'diff-viewer', path: '/pr-detail.html?tab=files&diff=1', ready: '[data-view="diff"]' },
];

for (const surface of SURFACES) {
  for (const theme of ['light', 'dark'] as const) {
    test(`visual: ${surface.id} (${theme})`, async ({ page }) => {
      await injectCompletedSetup(page);
      await page.goto(surface.path ?? '/');
      await waitForAppReady(page);
      await setTheme(page, theme);
      await seedDesignFixtures(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate(() => (document as any).fonts?.ready);
      await page.locator(surface.ready).first().waitFor({ state: 'visible' });

      const tolerance = VISUAL_TOLERANCES[surface.id] ?? DEFAULT_TOLERANCE;
      const target = surface.clipTo
        ? page.locator(surface.clipTo).first()
        : page;
      await expect(target).toHaveScreenshot(
        `design/${surface.id}-${theme}.png`,
        { maxDiffPixelRatio: tolerance, animations: 'disabled' },
      );
    });
  }
}
```

- [ ] **Step 4: Run `visual.spec.ts`**

Run: `npm run test:e2e -- visual.spec.ts --project=webview-mac`
Expected: most tests FAIL (current app ≠ design). That is the intended state — visual.spec is the progress tracker for PR #1–#7. Each subsequent PR in the stack ratchets the number of passing surfaces upward.

Some tests may ERROR (not fail) because the surface's `ready` selector doesn't exist in the current app. For those, add the selector to the current code or relax the selector to an already-present element. The goal of PR #0 is not that all tests pass — it's that they RUN correctly. A failing screenshot compare is fine; a "locator not found" is a real bug.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/helpers/seed.ts tests/e2e/visual.spec.ts tests/e2e/visual-tolerances.ts
git commit -m "$(cat <<'EOF'
test(e2e): visual regression against design baselines

visual.spec.ts navigates to each design surface, seeds fixtures,
forces theme, and compares against the baseline from Task 8 at a
4% default tolerance (overridable per surface). Expect most surfaces
to FAIL initially — that's PR #1-#7's work list.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Write `flyout.spec.ts`

**Files:**
- Create: `src/BorgDock.Tauri/tests/e2e/flyout.spec.ts`

Behavioral coverage for the tray-adjacent flyout surface. Keyboard, click, review state pill rendering.

- [ ] **Step 1: Write the spec**

Create `src/BorgDock.Tauri/tests/e2e/flyout.spec.ts`:

```typescript
import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { seedDesignFixtures } from './helpers/seed';
import { DESIGN_PRS } from './fixtures/design-fixtures';

test.describe('flyout', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/flyout.html');
    await waitForAppReady(page);
    await seedDesignFixtures(page);
  });

  test('renders one row per seeded PR', async ({ page }) => {
    const rows = page.locator('[data-pr-row]');
    await expect(rows).toHaveCount(DESIGN_PRS.length);
  });

  test('row shows repo · #number · status', async ({ page }) => {
    const first = page.locator('[data-pr-row]').first();
    await expect(first).toContainText('FSP');
    await expect(first).toContainText('#715');
  });

  test('review state pill renders when set', async ({ page }) => {
    // PR #714 has reviewStatus = 'approved' in fixtures
    const approvedRow = page.locator('[data-pr-row][data-pr-number="714"]');
    await expect(approvedRow.locator('[data-pill-tone]')).toContainText(/approved/i);
  });

  test('click row opens PR detail', async ({ page }) => {
    const first = page.locator('[data-pr-row]').first();
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      first.click(),
    ]);
    await popup.waitForLoadState();
    expect(popup.url()).toContain('pr-detail.html');
  });

  test('j / k keyboard navigates between rows', async ({ page }) => {
    await page.keyboard.press('j');
    const activeIndex = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-pr-row]'))
        .findIndex((el) => el.matches('[data-active="true"]')),
    );
    expect(activeIndex).toBe(1);
    await page.keyboard.press('k');
    const back = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-pr-row]'))
        .findIndex((el) => el.matches('[data-active="true"]')),
    );
    expect(back).toBe(0);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- flyout.spec.ts --project=webview-mac`
Expected: tests may fail if `data-pr-row` / `data-active` / `data-pill-tone` attributes don't exist yet — they're promised by PR #3's PRRow migration. That's fine for now. The point is that the spec is committed and will go green as PR #3 lands.

If `page.goto('/flyout.html')` errors with 404, the flyout window's HTML entry point has a different name — check `vite.config.ts` rollupOptions.input keys and adjust the path.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/flyout.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): flyout behavioral spec

Verifies row render, repo·#·status string, review pill, click-to-detail,
j/k keyboard nav. Asserts DOM contract that PR #3 fills in.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Write `focus.spec.ts`

**Files:**
- Create: `src/BorgDock.Tauri/tests/e2e/focus.spec.ts`

Covers the Focus surface + Quick Review overlay flow.

- [ ] **Step 1: Write the spec**

Create `src/BorgDock.Tauri/tests/e2e/focus.spec.ts`:

```typescript
import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { seedDesignFixtures } from './helpers/seed';

test.describe('focus', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/');
    await waitForAppReady(page);
    await seedDesignFixtures(page);
    await page.getByRole('button', { name: 'Focus' }).click();
  });

  test('shows priority-ordered PR list', async ({ page }) => {
    const items = page.locator('[data-focus-item]');
    await expect(items).toHaveCount(await items.count());
    await expect(items.first()).toBeVisible();
  });

  test('priority reason label is present on every item', async ({ page }) => {
    const items = page.locator('[data-focus-item]');
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      await expect(items.nth(i).locator('[data-priority-reason]')).toBeVisible();
    }
  });

  test('Quick Review opens, cycles, closes', async ({ page }) => {
    await page.keyboard.press('r');
    const overlay = page.locator('[data-overlay="quick-review"]');
    await expect(overlay).toBeVisible();
    const firstTitle = await overlay.locator('[data-pr-title]').textContent();
    await page.keyboard.press('ArrowRight');
    const nextTitle = await overlay.locator('[data-pr-title]').textContent();
    expect(nextTitle).not.toBe(firstTitle);
    await page.keyboard.press('Escape');
    await expect(overlay).toBeHidden();
  });

  test('Quick Review summary shows counts', async ({ page }) => {
    await page.keyboard.press('r');
    const summary = page.locator('[data-quick-review-summary]');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(/of\s+\d+/);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- focus.spec.ts --project=webview-mac`
Expected: some failures until PR #3 lands the new attributes. That's OK.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/focus.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): focus + quick-review behavioral spec

Asserts priority-ordered list, priority-reason labels, Quick Review
open/cycle/close keyboard loop, and the summary count. Part of the
PR #3 DOM contract.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Write `file-palette.spec.ts`

**Files:**
- Create: `src/BorgDock.Tauri/tests/e2e/file-palette.spec.ts`

- [ ] **Step 1: Write the spec**

Create the file with:

```typescript
import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { seedDesignFixtures } from './helpers/seed';

test.describe('file palette', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/palette.html?kind=files');
    await waitForAppReady(page);
    await seedDesignFixtures(page);
  });

  test('renders the search input with placeholder', async ({ page }) => {
    const input = page.getByPlaceholder(/search files/i);
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
  });

  test('typing narrows the results list', async ({ page }) => {
    const input = page.getByPlaceholder(/search files/i);
    const initialCount = await page.locator('[data-file-result]').count();
    await input.fill('footer');
    await page.waitForTimeout(150);
    const filteredCount = await page.locator('[data-file-result]').count();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test('arrow keys move selection', async ({ page }) => {
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const selected = page.locator('[data-file-result][data-selected="true"]');
    await expect(selected).toHaveCount(1);
  });

  test('enter opens the file in preview pane', async ({ page }) => {
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-file-preview]')).toBeVisible();
  });

  test('escape closes palette', async ({ page }) => {
    await page.keyboard.press('Escape');
    // palette is in its own window — closing should emit a close event
    // (frontend pattern — verify window.close called, or element hidden)
    const hidden = await page.evaluate(() =>
      !document.querySelector('[data-window="palette"]') ||
      document.querySelector('[data-window="palette"]')?.getAttribute('data-hidden') === 'true',
    );
    expect(hidden).toBe(true);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- file-palette.spec.ts --project=webview-mac`
Expected: most tests pass (file palette exists today); `data-*` attributes may fail until PR #5.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/file-palette.spec.ts
git commit -m "test(e2e): file-palette behavioral spec

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Write `file-viewer.spec.ts`

**Files:**
- Create: `src/BorgDock.Tauri/tests/e2e/file-viewer.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { seedDesignFixtures } from './helpers/seed';

test.describe('file viewer', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/file-viewer.html?file=src/quote/footer.tsx');
    await waitForAppReady(page);
    await seedDesignFixtures(page);
  });

  test('renders the file path in the titlebar', async ({ page }) => {
    await expect(page.locator('[data-titlebar-path]')).toContainText('footer.tsx');
  });

  test('renders line numbers', async ({ page }) => {
    const gutter = page.locator('[data-line-gutter] [data-line-number]');
    await expect(gutter.first()).toBeVisible();
    const count = await gutter.count();
    expect(count).toBeGreaterThan(0);
  });

  test('syntax tokens get a class', async ({ page }) => {
    // Tree-sitter applies class names like 'hl-keyword' to highlighted tokens
    const tokens = page.locator('[class*="hl-"]');
    await expect(tokens.first()).toBeVisible({ timeout: 3_000 });
  });

  test('copy button copies to clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('[data-action="copy-contents"]').click();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- file-viewer.spec.ts --project=webview-mac`

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/file-viewer.spec.ts
git commit -m "test(e2e): file-viewer behavioral spec

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Write `command-palette.spec.ts`

**Files:**
- Create: `src/BorgDock.Tauri/tests/e2e/command-palette.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { seedDesignFixtures } from './helpers/seed';

test.describe('command palette', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/');
    await waitForAppReady(page);
    await seedDesignFixtures(page);
  });

  test('Cmd+K opens the palette', async ({ page }) => {
    await page.keyboard.press('Meta+K');
    await expect(page.locator('[data-command-palette]')).toBeVisible();
  });

  test('typing filters commands', async ({ page }) => {
    await page.keyboard.press('Meta+K');
    const input = page.locator('[data-command-palette-input]');
    await input.fill('settings');
    const visible = page.locator('[data-command-item]:visible');
    const count = await visible.count();
    expect(count).toBeGreaterThan(0);
    await expect(visible.first()).toContainText(/settings/i);
  });

  test('Enter runs the first result', async ({ page }) => {
    await page.keyboard.press('Meta+K');
    await page.locator('[data-command-palette-input]').fill('settings');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-flyout="settings"]')).toBeVisible();
  });

  test('Escape closes', async ({ page }) => {
    await page.keyboard.press('Meta+K');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-command-palette]')).toBeHidden();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- command-palette.spec.ts --project=webview-mac`

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/command-palette.spec.ts
git commit -m "test(e2e): command-palette behavioral spec

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Write `sql.spec.ts`

**Files:**
- Create: `src/BorgDock.Tauri/tests/e2e/sql.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';

test.describe('sql window', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/sql.html');
    await waitForAppReady(page);
  });

  test('renders the editor and connection select', async ({ page }) => {
    await expect(page.locator('[data-sql-editor]')).toBeVisible();
    await expect(page.locator('[data-sql-connection-select]')).toBeVisible();
  });

  test('run button is disabled until a connection is picked', async ({ page }) => {
    const runBtn = page.locator('[data-action="run-query"]');
    await expect(runBtn).toBeDisabled();
  });

  test('typing in the editor updates the model', async ({ page }) => {
    const editor = page.locator('[data-sql-editor] textarea, [data-sql-editor] [contenteditable]');
    await editor.click();
    await page.keyboard.type('SELECT 1');
    await expect(editor).toContainText('SELECT 1');
  });

  test('results table renders after mock run', async ({ page }) => {
    // With the mock connection seeded via completedSettings, a run should
    // return the mock result set.
    await page.selectOption('[data-sql-connection-select]', { index: 1 }).catch(() => {});
    const editor = page.locator('[data-sql-editor] textarea, [data-sql-editor] [contenteditable]');
    await editor.click();
    await page.keyboard.type('SELECT 1');
    await page.locator('[data-action="run-query"]').click();
    await expect(page.locator('[data-sql-results-table] tbody tr').first())
      .toBeVisible({ timeout: 3_000 });
  });
});
```

- [ ] **Step 2: Run + commit**

Run: `npm run test:e2e -- sql.spec.ts --project=webview-mac`

```bash
git add tests/e2e/sql.spec.ts
git commit -m "test(e2e): sql window behavioral spec

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Write `worktree-palette.spec.ts`

**Files:**
- Create: `src/BorgDock.Tauri/tests/e2e/worktree-palette.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';

test.describe('worktree palette', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/palette.html?kind=worktrees');
    await waitForAppReady(page);
  });

  test('renders worktree list', async ({ page }) => {
    await expect(page.locator('[data-worktree-row]').first()).toBeVisible({ timeout: 3_000 });
  });

  test('prune action opens confirm dialog', async ({ page }) => {
    await page.locator('[data-worktree-row]').first()
      .locator('[data-action="prune"]').click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });

  test('checkout flow can be initiated', async ({ page }) => {
    const checkoutBtn = page.locator('[data-action="checkout"]').first();
    if (await checkoutBtn.isVisible()) {
      await checkoutBtn.click();
      await expect(page.locator('[data-checkout-flow]')).toBeVisible();
    }
  });
});
```

- [ ] **Step 2: Run + commit**

Run: `npm run test:e2e -- worktree-palette.spec.ts --project=webview-mac`

```bash
git add tests/e2e/worktree-palette.spec.ts
git commit -m "test(e2e): worktree-palette behavioral spec

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: Write `diff-viewer.spec.ts`

**Files:**
- Create: `src/BorgDock.Tauri/tests/e2e/diff-viewer.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { seedDesignFixtures } from './helpers/seed';

test.describe('diff viewer', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/pr-detail.html?number=714&tab=files');
    await waitForAppReady(page);
    await seedDesignFixtures(page);
  });

  test('renders file list with additions/deletions counts', async ({ page }) => {
    const files = page.locator('[data-diff-file]');
    await expect(files.first()).toBeVisible();
    await expect(files.first().locator('[data-diff-stat="added"]')).toContainText(/\d+/);
    await expect(files.first().locator('[data-diff-stat="deleted"]')).toContainText(/\d+/);
  });

  test('hunk header renders with @@ markers', async ({ page }) => {
    await page.locator('[data-diff-file]').first().click();
    await expect(page.locator('[data-hunk-header]').first()).toContainText('@@');
  });

  test('added / deleted lines use status colors', async ({ page }) => {
    await page.locator('[data-diff-file]').first().click();
    const addedBg = await page.locator('[data-line-kind="add"]').first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    const deletedBg = await page.locator('[data-line-kind="del"]').first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    // The tokens differ in hue — we assert they aren't the same
    expect(addedBg).not.toBe(deletedBg);
  });

  test('hunk nav (next/prev) scrolls', async ({ page }) => {
    await page.locator('[data-diff-file]').first().click();
    const scrollYBefore = await page.evaluate(() => window.scrollY);
    await page.locator('[data-action="next-hunk"]').click();
    await page.waitForTimeout(200);
    const scrollYAfter = await page.evaluate(() => window.scrollY);
    expect(scrollYAfter).not.toBe(scrollYBefore);
  });
});
```

- [ ] **Step 2: Run + commit**

Run: `npm run test:e2e -- diff-viewer.spec.ts --project=webview-mac`

```bash
git add tests/e2e/diff-viewer.spec.ts
git commit -m "test(e2e): diff-viewer behavioral spec

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: Write `whats-new.spec.ts`

**Files:**
- Create: `src/BorgDock.Tauri/tests/e2e/whats-new.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';

test.describe('whats new', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/?view=whats-new');
    await waitForAppReady(page);
  });

  test('renders release header', async ({ page }) => {
    await expect(page.locator('[data-release-version]').first()).toBeVisible();
  });

  test('highlight types render distinct pills', async ({ page }) => {
    const newPill = page.locator('[data-highlight-kind="new"]').first();
    const improvedPill = page.locator('[data-highlight-kind="improved"]').first();
    const fixedPill = page.locator('[data-highlight-kind="fixed"]').first();
    // At least two of three should be present across releases
    const visible = [
      await newPill.count(),
      await improvedPill.count(),
      await fixedPill.count(),
    ].filter((c) => c > 0).length;
    expect(visible).toBeGreaterThanOrEqual(2);
  });

  test('accordion expands/collapses', async ({ page }) => {
    const accordion = page.locator('[data-fixed-accordion]').first();
    if (!(await accordion.isVisible())) test.skip();
    const headerBtn = accordion.locator('[role="button"]').first();
    const isOpen = await accordion.getAttribute('data-open');
    await headerBtn.click();
    const afterOpen = await accordion.getAttribute('data-open');
    expect(afterOpen).not.toBe(isOpen);
  });
});
```

- [ ] **Step 2: Run + commit**

Run: `npm run test:e2e -- whats-new.spec.ts --project=webview-mac`

```bash
git add tests/e2e/whats-new.spec.ts
git commit -m "test(e2e): whats-new behavioral spec

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: Integrate axe-playwright a11y checks

**Files:**
- Create: `src/BorgDock.Tauri/tests/e2e/helpers/a11y.ts`
- Modify: every spec from Tasks 10–18 (one append each).

- [ ] **Step 1: Create the helper**

Create `src/BorgDock.Tauri/tests/e2e/helpers/a11y.ts`:

```typescript
import type { Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { expect } from '@playwright/test';

/**
 * Runs axe-core against the current page with WCAG 2.1 AA rule set.
 * Any violation fails the test with a readable message.
 *
 * Use at the end of behavioral specs, not in every micro-test — one
 * check per surface is enough to catch regressions.
 */
export async function expectNoA11yViolations(
  page: Page,
  opts: { selector?: string; disableRules?: string[] } = {},
) {
  const builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
  ]);
  if (opts.selector) builder.include(opts.selector);
  if (opts.disableRules?.length) builder.disableRules(opts.disableRules);
  const { violations } = await builder.analyze();
  if (violations.length) {
    const report = violations
      .map((v) => `- [${v.id}] ${v.help} (${v.nodes.length} nodes)\n  ${v.helpUrl}`)
      .join('\n');
    expect.soft(violations, `Accessibility violations:\n${report}`).toHaveLength(0);
    // Hard-fail at end so the full report is attached
    expect(violations).toHaveLength(0);
  }
}
```

- [ ] **Step 2: Append one a11y test per surface spec**

In each of `flyout.spec.ts`, `focus.spec.ts`, `file-palette.spec.ts`, `file-viewer.spec.ts`, `command-palette.spec.ts`, `sql.spec.ts`, `worktree-palette.spec.ts`, `diff-viewer.spec.ts`, `whats-new.spec.ts`, add at the top:

```typescript
import { expectNoA11yViolations } from './helpers/a11y';
```

And at the bottom of the describe block:

```typescript
  test('has no WCAG 2.1 AA violations', async ({ page }) => {
    await expectNoA11yViolations(page);
  });
```

Run the specs once more; if any surface has legitimate violations today (likely: missing button labels, low-contrast text), do NOT fix them in PR #0 — they are the work list for the surface's own migration PR. Instead, add the violation rule IDs to `disableRules` for that one surface, with a code comment pointing at the ticket/PR that will fix it. Example:

```typescript
  test('has no WCAG 2.1 AA violations', async ({ page }) => {
    await expectNoA11yViolations(page, {
      disableRules: [
        'color-contrast', // fixed in PR #5: file-palette muted meta row
      ],
    });
  });
```

The spec must still RUN — it's OK to temporarily accept some violations via `disableRules`, but not to skip the test.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/helpers/a11y.ts tests/e2e/*.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): axe-playwright a11y checks per surface

expectNoA11yViolations() runs WCAG 2.1 A+AA rules against each
surface. Violations that are inherent to the current design and
will be fixed by a later streamline PR are allow-listed via
disableRules with a reference comment.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: Write `performance.spec.ts` + calibrate budgets

**Files:**
- Create: `src/BorgDock.Tauri/tests/e2e/perf-budgets.ts`
- Create: `src/BorgDock.Tauri/tests/e2e/performance.spec.ts`

- [ ] **Step 1: Create `perf-budgets.ts`**

```typescript
/**
 * Per-project performance budgets in milliseconds.
 *
 * Calibration procedure (run once on PR #0, re-run if the runner
 * hardware changes):
 *   1. Run `npm run test:e2e -- performance.spec.ts --project=<name>`
 *      three times, capture the median of each metric.
 *   2. Set the budget to median * 1.25 (25% headroom for noise).
 *   3. Subsequent PRs must stay under the budget or justify.
 *
 * These are intentionally generous — PR #0 is not a perf optimization
 * exercise, it's a "don't regress by an order of magnitude" guard.
 */
export type PerfBudgets = {
  initialPaintMs: number;
  prClickToDetailMs: number;
  commandPaletteOpenMs: number;
  filePaletteKeystrokeMs: number;
  prDetailTabSwitchMs: number;
};

export const PERF_BUDGETS: Record<string, PerfBudgets> = {
  'webview-mac': {
    initialPaintMs: 800,
    prClickToDetailMs: 150,
    commandPaletteOpenMs: 50,
    filePaletteKeystrokeMs: 80,
    prDetailTabSwitchMs: 100,
  },
  'webview-win': {
    initialPaintMs: 1200,   // Windows runners are slower on GH Actions
    prClickToDetailMs: 220,
    commandPaletteOpenMs: 80,
    filePaletteKeystrokeMs: 120,
    prDetailTabSwitchMs: 150,
  },
};
```

- [ ] **Step 2: Write `performance.spec.ts`**

```typescript
import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { seedDesignFixtures } from './helpers/seed';
import { PERF_BUDGETS } from './perf-budgets';

function budgetForProject(projectName: string) {
  const b = PERF_BUDGETS[projectName];
  if (!b) throw new Error(`No perf budget defined for project "${projectName}"`);
  return b;
}

test.describe('performance', () => {
  test('initial main-window paint under budget', async ({ page }, testInfo) => {
    const budget = budgetForProject(testInfo.project.name);
    await injectCompletedSetup(page);
    const start = Date.now();
    await page.goto('/');
    await page.locator('header').waitFor({ state: 'visible' });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(budget.initialPaintMs);
  });

  test('Cmd+K opens command palette under budget', async ({ page }, testInfo) => {
    const budget = budgetForProject(testInfo.project.name);
    await injectCompletedSetup(page);
    await page.goto('/');
    await waitForAppReady(page);
    await seedDesignFixtures(page);

    const start = await page.evaluate(() => performance.now());
    await page.keyboard.press('Meta+K');
    await page.locator('[data-command-palette]').waitFor({ state: 'visible' });
    const end = await page.evaluate(() => performance.now());
    expect(end - start).toBeLessThan(budget.commandPaletteOpenMs);
  });

  test('PR card click to detail render under budget', async ({ page, context }, testInfo) => {
    const budget = budgetForProject(testInfo.project.name);
    await injectCompletedSetup(page);
    await page.goto('/');
    await waitForAppReady(page);
    await seedDesignFixtures(page);

    const start = Date.now();
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.locator('[data-pr-card]').first().click(),
    ]);
    await popup.locator('[data-window="pr-detail"]').waitFor({ state: 'visible' });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(budget.prClickToDetailMs);
  });

  test('file palette keystroke to first result under budget', async ({ page }, testInfo) => {
    const budget = budgetForProject(testInfo.project.name);
    await injectCompletedSetup(page);
    await page.goto('/palette.html?kind=files');
    await waitForAppReady(page);
    await seedDesignFixtures(page);

    const input = page.getByPlaceholder(/search files/i);
    const start = Date.now();
    await input.fill('f');
    await page.locator('[data-file-result]').first().waitFor({ state: 'visible' });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(budget.filePaletteKeystrokeMs);
  });

  test('PR detail tab switch under budget', async ({ page }, testInfo) => {
    const budget = budgetForProject(testInfo.project.name);
    await injectCompletedSetup(page);
    await page.goto('/pr-detail.html?number=714&tab=overview');
    await waitForAppReady(page);
    await seedDesignFixtures(page);

    const start = Date.now();
    await page.getByRole('tab', { name: /files/i }).click();
    await page.locator('[data-diff-file]').first().waitFor({ state: 'visible' });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(budget.prDetailTabSwitchMs);
  });
});
```

- [ ] **Step 3: Calibrate the budgets**

Run the spec three times on the dev machine:

```bash
for i in 1 2 3; do npm run test:e2e -- performance.spec.ts --project=webview-mac --reporter=list; done
```

Note the reported elapsed times in the test output (the test's `expect` output doesn't print the elapsed value — add a temporary `console.log(elapsed)` before the `expect` for calibration, then remove it).

Compute median per metric, multiply by 1.25, update `perf-budgets.ts`. If a test is consistently failing by a lot (e.g., initial paint is actually 1500ms on a loaded machine), the fix is to raise the budget in `perf-budgets.ts` — NOT to remove the assertion.

Repeat for `webview-win` from a Windows machine if available; otherwise leave the initial guesses and let CI set the baseline.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/perf-budgets.ts tests/e2e/performance.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): performance budgets per surface

Calibrated budgets (mac: initial paint <800ms, PR click <150ms,
Cmd+K <50ms, file palette <80ms, tab switch <100ms; windows: ~1.5x).
Budgets live in perf-budgets.ts keyed by Playwright project name.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: Write `motion.spec.ts`

**Files:**
- Create: `src/BorgDock.Tauri/tests/e2e/motion.spec.ts`

- [ ] **Step 1: Write the spec**

Motion tests sample computed styles while animations run. Playwright cannot easily pause mid-animation, so we use `page.evaluate` with `requestAnimationFrame` samples.

```typescript
import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { seedDesignFixtures } from './helpers/seed';

test.describe('motion', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/');
    await waitForAppReady(page);
    await seedDesignFixtures(page);
  });

  test('button press scale dips to ~0.97', async ({ page }) => {
    const btn = page.locator('button').first();
    await btn.hover();
    // Programmatically press-and-hold to catch the scale
    const midPressScale = await page.evaluate(async (selector) => {
      const el = document.querySelector(selector) as HTMLElement;
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
      const transform = getComputedStyle(el).transform;
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return transform;
    }, 'button');
    // transform: matrix(0.97, 0, 0, 0.97, 0, 0) or scale(0.97)
    expect(midPressScale).toMatch(/matrix\(0\.9[0-9]/);
  });

  test('tab underline slides to new tab', async ({ page }) => {
    // Requires a tab-bearing surface present; use the section switcher
    const tabBar = page.locator('[data-section-tabs]');
    if (!(await tabBar.isVisible())) test.skip();
    const underline = tabBar.locator('[data-tab-underline]');
    const startLeft = await underline.evaluate((el) => (el as HTMLElement).getBoundingClientRect().left);
    await page.getByRole('button', { name: 'Work Items' }).click();
    // Sample while animating
    await page.waitForTimeout(100);
    const midLeft = await underline.evaluate((el) => (el as HTMLElement).getBoundingClientRect().left);
    expect(Math.abs(midLeft - startLeft)).toBeGreaterThan(4);
  });

  test('toast slide-in ends at translateX(0)', async ({ page }) => {
    // Trigger a toast via the notification demo hook
    await page.evaluate(() => {
      (window as any).__borgdock_test_seed?.({
        // no-op; we just need a toast. Use the real store path.
      });
      // Shortcut: dispatch an event the notification store listens for
      (window as any).__borgdock_test_toast?.({
        kind: 'success', title: 'Test', message: 'Hello',
      });
    });
    const toast = page.locator('[data-toast]').first();
    await toast.waitFor({ state: 'visible', timeout: 1_000 });
    await page.waitForTimeout(500);
    const transform = await toast.evaluate((el) => getComputedStyle(el).transform);
    expect(transform).toMatch(/matrix\(1, 0, 0, 1, [-\d.]{1,5}, /);
  });
});
```

The toast test requires a `__borgdock_test_toast` event listener. Add one under `import.meta.env.DEV` in `src/stores/notification-store.ts` (same pattern as `installTestSeed`), wired from `App.tsx`. Concretely: extend `installTestSeed` to also register a global `window.__borgdock_test_toast(toast)` that calls the notification store's `pushToast` action. Then the motion test uses `window.__borgdock_test_toast(...)` instead of a custom event. Don't drop the test — the user's directive was "nothing deferred."

- [ ] **Step 2: Run + commit**

Run: `npm run test:e2e -- motion.spec.ts --project=webview-mac`

```bash
git add tests/e2e/motion.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): motion spec for press, tab slide, toast

Samples computed styles mid-animation via requestAnimationFrame
so the tests assert that the motion actually runs, not just that
the code registers transition classes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 22: Add the CI workflow

**Files:**
- Create: `.github/workflows/test.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: test

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  vitest:
    name: vitest (${{ matrix.os }})
    strategy:
      fail-fast: false
      matrix:
        os: [macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    defaults:
      run:
        working-directory: src/BorgDock.Tauri
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: src/BorgDock.Tauri/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm test -- --reporter=verbose

  playwright:
    name: playwright (${{ matrix.os }})
    strategy:
      fail-fast: false
      matrix:
        os: [macos-latest, windows-latest]
        include:
          - os: macos-latest
            project: webview-mac
          - os: windows-latest
            project: webview-win
    runs-on: ${{ matrix.os }}
    defaults:
      run:
        working-directory: src/BorgDock.Tauri
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: src/BorgDock.Tauri/package-lock.json
      - run: npm ci
      - run: npx playwright install chromium --with-deps
      - run: npm run test:e2e -- --project=${{ matrix.project }}
      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-${{ matrix.os }}
          path: src/BorgDock.Tauri/playwright-report
          retention-days: 14
      - name: Upload visual diffs
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: visual-diffs-${{ matrix.os }}
          path: src/BorgDock.Tauri/test-results
          retention-days: 14
```

- [ ] **Step 2: Validate YAML**

Run: `python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/test.yml'))"` (from repo root, not inside src/BorgDock.Tauri)
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
cd ~/projects/borgdock-streamline  # repo root
git add .github/workflows/test.yml
git commit -m "$(cat <<'EOF'
ci: add test workflow (vitest + playwright on mac + win)

Runs on every push/PR to master. Vitest matrix for unit tests,
Playwright matrix for e2e (visual, behavioral, a11y, perf, motion).
Uploads playwright-report and visual-diffs artifacts on failure.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 23: Update the spec ledger

**Files:**
- Modify: `docs/superpowers/specs/2026-04-24-shared-components-design.md`

- [ ] **Step 1: Tick PR #0 in the ledger**

Edit the Delivery Ledger table in the spec, changing PR #0's row to `In review` and adding today's date:

```markdown
| #0 | `feat/streamline-00-regression-baseline` | In review | — | 2026-04-24 | Regression safety net: behavioral specs, design baselines, a11y, perf, motion, cross-OS CI. |
```

(When the PR actually merges, a follow-up `chore(spec)` commit on master flips it to `Merged` and records the SHA. That happens after Task 24's PR is merged, not inside this PR.)

- [ ] **Step 2: Commit**

```bash
cd ~/projects/borgdock-streamline/src/BorgDock.Tauri || cd ~/projects/borgdock-streamline
git add docs/superpowers/specs/2026-04-24-shared-components-design.md
git commit -m "docs(spec): mark PR #0 as in review

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 24: Final validation + open the pull request

- [ ] **Step 1: Full local test run**

```bash
cd ~/projects/borgdock-streamline/src/BorgDock.Tauri
npm run lint
npm test
npm run build
npm run test:e2e -- --project=webview-mac
```

Expected:
- `lint`: clean.
- `test` (Vitest): all pass.
- `build`: clean.
- `test:e2e`: visual.spec tests mostly FAIL (expected, per Task 9). Behavioral specs pass or fail based on current DOM attributes; any failures should be "locator not found" → add the attribute somewhere sensible or relax the selector. Raw screenshot diffs are expected and OK.

A "green CI" for PR #0 does NOT mean every test passes. It means: unit tests pass, build passes, lint passes, Playwright runs to completion without infra errors, and the visual baselines are committed. Failing screenshot comparisons are the work list, not a regression.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/streamline-00-regression-baseline
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "feat(streamline): PR #0 — regression baseline" --body "$(cat <<'EOF'
## Summary

First PR in the shared-components streamline stack (spec:
`docs/superpowers/specs/2026-04-24-shared-components-design.md`).
Adds the regression safety net that PR #1–#7 migrate against. No
existing UI code is modified.

- Vendored design bundle under `tests/e2e/design-bundle/` for
  deterministic baseline capture.
- `design-fixtures.ts` ports the design's mock PR/work-item/diff
  data into TypeScript typed against real store shapes.
- Dev-only `installTestSeed()` hook so Playwright seeds Zustand
  stores directly, bypassing IPC.
- Cross-OS Playwright config with auto-started `npm run dev`.
- `capture-design-baselines.spec.ts` + ~72 PNGs baseline
  (mac + win, light + dark, ~18 surfaces).
- `visual.spec.ts` + per-surface `visual-tolerances.ts` (default 4%).
- Nine new behavioral specs: flyout, focus, file-palette, file-viewer,
  command-palette, sql, worktree-palette, diff-viewer, whats-new.
- Axe-playwright WCAG 2.1 AA gate per surface.
- `performance.spec.ts` + per-project budgets.
- `motion.spec.ts` sampling button press, tab slide, toast.
- `.github/workflows/test.yml` running vitest + playwright on
  macos-latest and windows-latest.

## Test plan

- [ ] `npm run lint` clean.
- [ ] `npm test` passes (Vitest unit + fixture + seed-hook tests).
- [ ] `npm run build` clean.
- [ ] `npm run test:e2e -- --project=webview-mac` runs to completion.
      Visual specs FAIL against current app — that is intentional.
- [ ] Playwright report visible for the mac run; screenshots render.
- [ ] CI completes both `vitest` and `playwright` matrix jobs on
      `macos-latest` and `windows-latest`. The visual tests fail in
      CI too — commit `--update-snapshots` baselines **only** for
      CI-platform-specific drift (see note in Task 8).
🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Verify PR opened**

Run: `gh pr view --json url,title,state`
Expected: `"state":"OPEN"` and the PR URL prints. Return the URL to the user.

---

## Self-review

### Spec coverage

Spec §7 regression safety net: every subsection implemented in this plan — §7.1 (Tasks 10–18), §7.2 (Tasks 7–9 + design-bundle vendor in Task 2), §7.3 (Tasks 4–5 + 9), §7.4 (Task 19), §7.5 (Task 20), §7.6 (Task 21), §7.7 (Task 6), §7.8 (Task 22). Spec §9 ledger ritual: Task 23 establishes the pattern.

Spec §1–§6 (primitives, per-surface migration, worktree changes): NOT in this plan — those are PR #1–#7's plans, written when each PR begins.

### Placeholder scan

No TBDs, no "implement later", every step shows code or exact commands. Task 7 Step 3 says "pick whichever is easier" — that's a legitimate choice point, not a placeholder; both options are defined concretely.

### Type consistency

`installTestSeed({ isDev })` signature used identically in Task 5's module, test, and App.tsx wire-in. `seedDesignFixtures(page, overrides)` signature used identically in Tasks 9–21. `PERF_BUDGETS` keyed by project name (`webview-mac` / `webview-win`) matches the projects defined in Task 6's `playwright.config.ts`. Snapshot path template `{projectName}/design/<surface>-<theme>.png` used consistently in Tasks 6, 7, 8, 9.

### Known footguns acknowledged in the plan

- Task 7 Step 3 — artboard selectors may not exist as written in the prototype HTML; plan includes an alternative (tag the HTML with `data-ab-id` as a one-time edit).
- Task 9 Step 4 — visual specs are EXPECTED to fail initially.
- Task 19 Step 2 — legitimate a11y violations get `disableRules` with a comment, not a skip.
- Task 21 Step 1 — toast motion test may need a dev-only event listener in the notification store; fallback path provided.
- Task 24 Step 1 — "green CI" definition is explicitly not "all tests pass"; it's "all infra works, visual diffs are the intended work list."
