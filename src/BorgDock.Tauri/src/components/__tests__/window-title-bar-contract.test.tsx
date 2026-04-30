import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PullRequestWithChecks } from '@/types';

/**
 * Title-bar contract for pop-out windows that use the unified BorgDock chrome.
 *
 * All pop-out windows that ship a min/max/close cluster must render their
 * title bar as a SINGLE flex row: the `.bd-title-bar` element gets
 * `display: flex; align-items: center; height: 36px`, and every visible
 * element (logo, title, custom buttons, the WindowControls cluster) must be
 * a DIRECT child so flex layout actually arranges them on one row.
 *
 * Concretely:
 *   - exactly one element has class `bd-title-bar` AND `data-tauri-drag-region`
 *   - the WindowControls cluster (`.bd-wc-group`) is a direct child of that
 *     element (so it participates in the flex row, not a stacked sub-row)
 *   - the spacer span (`.bd-title-bar__spacer`) is a direct child too — it
 *     pushes the right-side controls to the end via `flex: 1`
 *   - the title text (`.bd-title-bar__title`) is a direct child
 *
 * Regression context: the title bars across SQL / Work-Item detail / PR detail
 * / What's new diverged structurally during the streamline-redesign refactor —
 * some windows had extra wrapper divs around the right-side cluster, which
 * defeats the flex row and stacks min/max/close below the title text. This
 * test fails if any of those windows reintroduce a wrapper.
 *
 * Palette windows (file palette, worktree palette, work-item palette) are
 * intentionally NOT covered here — they use bespoke titlebar styles
 * (`bd-fp-titlebar`, `bd-wt-titlebar`, custom drag handle) because they don't
 * carry the OS min/max/close cluster.
 */

// Mocks shared across the windowed-app tests below ────────────────────────

const tauriWindowMock = {
  close: vi.fn(() => Promise.resolve()),
  minimize: vi.fn(() => Promise.resolve()),
  maximize: vi.fn(() => Promise.resolve()),
  unmaximize: vi.fn(() => Promise.resolve()),
  isMaximized: vi.fn(() => Promise.resolve(false)),
  setTitle: vi.fn(),
  startDragging: vi.fn(() => Promise.resolve()),
  onMoved: vi.fn(() => Promise.resolve(() => {})),
  outerPosition: vi.fn(() => Promise.resolve({ x: 0, y: 0 })),
  scaleFactor: vi.fn(() => Promise.resolve(1)),
  setPosition: vi.fn(() => Promise.resolve()),
};

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => tauriWindowMock),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock('@tauri-apps/api/dpi', () => ({
  LogicalPosition: vi.fn((x: number, y: number) => ({ x, y })),
}));

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn(() => Promise.resolve()),
}));

// Tabs in PrDetailPanel — keep them stubbed so the panel renders without
// loading every tab's dependencies.
vi.mock('@/components/pr-detail/OverviewTab', () => ({
  OverviewTab: () => <div />,
}));
vi.mock('@/components/pr-detail/CommitsTab', () => ({
  CommitsTab: () => <div />,
}));
vi.mock('@/components/pr-detail/FilesTab', () => ({
  FilesTab: () => <div />,
}));
vi.mock('@/components/pr-detail/ChecksTab', () => ({
  ChecksTab: () => <div />,
}));
vi.mock('@/components/pr-detail/ReviewsTab', () => ({
  ReviewsTab: () => <div />,
}));
vi.mock('@/components/pr-detail/CommentsTab', () => ({
  CommentsTab: () => <div />,
}));

// Heavy SqlApp dependencies — schema fetching + editor — are not part of
// this contract; stub them so the title bar can render in isolation.
vi.mock('@/components/sql/use-sql-schema', () => ({
  useSqlSchema: () => ({
    state: { kind: 'idle' as const },
    refresh: vi.fn(),
    cmSchema: {},
  }),
}));
vi.mock('@/components/sql/SqlEditor', () => ({
  SqlEditor: () => <div data-testid="sql-editor" />,
}));
vi.mock('@/components/sql/ResultsTable', () => ({
  ResultsTable: () => <div data-testid="results-table" />,
}));

// Imports must come after mocks ────────────────────────────────────────────
import { PrDetailPanel } from '../pr-detail/PRDetailPanel';
import { WhatsNewApp } from '../whats-new/WhatsNewApp';

function makePr(): PullRequestWithChecks {
  return {
    pullRequest: {
      number: 42,
      title: 'Add feature X',
      headRef: 'feature-x',
      baseRef: 'main',
      authorLogin: 'dev',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-01-15T10:00:00Z',
      isDraft: false,
      mergeable: true,
      htmlUrl: 'https://github.com/owner/repo/pull/42',
      body: '',
      repoOwner: 'owner',
      repoName: 'repo',
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 10,
      deletions: 5,
      changedFiles: 3,
      commitCount: 1,
      requestedReviewers: [],
    },
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 0,
    skippedCount: 0,
  };
}

/**
 * Resolve the unique title-bar root element in `container`. Throws (with a
 * descriptive message including the component name) if zero or multiple are
 * found — both are bugs the contract catches.
 */
function getTitleBarRoot(container: HTMLElement, componentName: string): HTMLElement {
  const matches = container.querySelectorAll<HTMLElement>('.bd-title-bar');
  expect(
    matches.length,
    `${componentName}: expected exactly one .bd-title-bar element, found ${matches.length}`,
  ).toBe(1);
  return matches[0]!;
}

function assertTitleBarContract(
  container: HTMLElement,
  componentName: string,
  expectations: { hasTitleText?: boolean; hasWindowControls?: boolean },
) {
  const root = getTitleBarRoot(container, componentName);

  // The drag region must be the root itself, not a child wrapper, so the
  // entire bar is grabbable (and so OS-level dragging doesn't intercept
  // clicks on the controls — the WindowControls cluster has its own
  // app-region:no-drag rule).
  expect(
    root.hasAttribute('data-tauri-drag-region'),
    `${componentName}: title-bar root must carry data-tauri-drag-region`,
  ).toBe(true);

  // Spacer must be a direct child so `flex: 1` shoves the right cluster to
  // the end of the row. If a wrapper appears around the spacer, alignment
  // collapses.
  const spacer = root.querySelector('.bd-title-bar__spacer');
  expect(
    spacer,
    `${componentName}: expected a .bd-title-bar__spacer inside the title bar`,
  ).not.toBeNull();
  expect(
    spacer?.parentElement,
    `${componentName}: .bd-title-bar__spacer must be a direct child of .bd-title-bar`,
  ).toBe(root);

  if (expectations.hasTitleText) {
    const title = root.querySelector('.bd-title-bar__title');
    expect(
      title,
      `${componentName}: expected a .bd-title-bar__title inside the title bar`,
    ).not.toBeNull();
    expect(
      title?.parentElement,
      `${componentName}: .bd-title-bar__title must be a direct child of .bd-title-bar`,
    ).toBe(root);
  }

  if (expectations.hasWindowControls) {
    const controls = root.querySelector('.bd-wc-group');
    expect(
      controls,
      `${componentName}: expected a .bd-wc-group (WindowControls) inside the title bar`,
    ).not.toBeNull();
    // CRITICAL: the cluster must be a DIRECT child. If anything (even a
    // <div> from a wrapper React component) sits between root and cluster,
    // the cluster falls out of the flex row and stacks below the title.
    expect(
      controls?.parentElement,
      `${componentName}: .bd-wc-group must be a direct child of .bd-title-bar`,
    ).toBe(root);
  }
}

describe('Pop-out window title bars — structural contract', () => {
  afterEach(() => {
    cleanup();
  });

  it('PrDetailPanel (popOutWindow=true) satisfies the title-bar contract', () => {
    const { container } = render(<PrDetailPanel pr={makePr()} popOutWindow={true} />);

    assertTitleBarContract(container, 'PrDetailPanel', {
      hasTitleText: true,
      hasWindowControls: true,
    });

    // PR detail keeps a BorgDock logo (window identification in Alt+Tab) and
    // an external-link "open on GitHub" button. Both must be direct children
    // so the bar reads as one row.
    const root = getTitleBarRoot(container, 'PrDetailPanel');
    const logo = root.querySelector('.bd-title-bar__logo');
    expect(logo, 'PrDetailPanel: expected a .bd-title-bar__logo span').not.toBeNull();
    expect(logo?.parentElement, 'logo must be a direct child of .bd-title-bar').toBe(root);

    const externalButton = root.querySelector('button[aria-label="Open in browser"]');
    expect(
      externalButton,
      'PrDetailPanel: expected an external-link button in the title bar',
    ).not.toBeNull();
    expect(
      externalButton?.parentElement,
      'external-link button must be a direct child of .bd-title-bar',
    ).toBe(root);
  });

  /**
   * The title bar must identify WHICH PR is open — the previous render said
   * just "BorgDock", which is redundant with the BorgDock logo right next to
   * it and gave the user no context about which window they were looking at.
   * Other pop-out windows already show contextful titles ("BorgDock SQL",
   * "Work Item #1234 — …"), so this asserts PR detail does the same.
   */
  it('PrDetailPanel title text identifies the PR (number + repo)', () => {
    const { container } = render(<PrDetailPanel pr={makePr()} popOutWindow={true} />);
    const root = getTitleBarRoot(container, 'PrDetailPanel');
    const title = root.querySelector('.bd-title-bar__title');
    expect(title, 'PrDetailPanel: expected a title element').not.toBeNull();
    const text = title?.textContent ?? '';

    expect(text, `expected PR number in title, got "${text}"`).toContain('#42');
    expect(text, `expected repo path in title, got "${text}"`).toContain('owner/repo');
    expect(
      text.trim(),
      'title must not be the bare brand string "BorgDock" (no PR context)',
    ).not.toBe('BorgDock');
  });

  it('PrDetailPanel (inline mode) does NOT render the pop-out title bar', () => {
    const { container } = render(<PrDetailPanel pr={makePr()} popOutWindow={false} />);
    const matches = container.querySelectorAll('.bd-title-bar');
    expect(
      matches.length,
      'PrDetailPanel inline mode should not render the OS-style title bar',
    ).toBe(0);
  });

  it('WhatsNewApp satisfies the title-bar contract', () => {
    const { container } = render(<WhatsNewApp />);
    assertTitleBarContract(container, 'WhatsNewApp', {
      hasTitleText: true,
      hasWindowControls: true,
    });
  });
});

describe('Pop-out window title bars — drag region clickability', () => {
  afterEach(() => {
    cleanup();
  });

  /**
   * The WindowControls cluster sits inside a drag-region parent. The OS would
   * eat clicks on the buttons unless they're rendered with the
   * `bd-wc-group` class (CSS rule `-webkit-app-region: no-drag`). This is the
   * specific failure mode the user hit when the cluster was wrapped in an
   * extra div: the wrapper inherited the drag region, the no-drag class on
   * the inner cluster never fired, and clicks were swallowed.
   */
  it('PrDetailPanel: WindowControls cluster carries bd-wc-group (no-drag escape hatch)', () => {
    const { container } = render(<PrDetailPanel pr={makePr()} popOutWindow={true} />);
    const cluster = container.querySelector('.bd-wc-group');
    expect(cluster, 'PrDetailPanel: cluster missing — buttons would not be clickable').not.toBeNull();
  });

  it('WhatsNewApp: WindowControls cluster carries bd-wc-group', () => {
    const { container } = render(<WhatsNewApp />);
    const cluster = container.querySelector('.bd-wc-group');
    expect(cluster, 'WhatsNewApp: cluster missing — buttons would not be clickable').not.toBeNull();
  });
});
