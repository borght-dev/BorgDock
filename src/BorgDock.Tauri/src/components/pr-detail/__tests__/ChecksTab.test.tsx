import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CheckRun } from '@/types';
import { ChecksTab } from '../ChecksTab';

const mockOpenUrl = vi.fn().mockResolvedValue(undefined);
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: (...args: unknown[]) => mockOpenUrl(...args),
}));

vi.mock('@/hooks/useClaudeActions', () => ({
  useClaudeActions: () => ({
    fixWithClaude: vi.fn().mockResolvedValue(undefined),
    resolveConflicts: vi.fn().mockResolvedValue(undefined),
    monitorPr: vi.fn().mockResolvedValue(undefined),
    getMonitorPrompt: vi.fn(),
    getFixPrompt: vi.fn(),
  }),
}));

function makeCheck(overrides: Partial<CheckRun> = {}): CheckRun {
  return {
    id: 1,
    name: 'build',
    status: 'completed',
    conclusion: 'success',
    startedAt: '2026-01-15T10:00:00Z',
    completedAt: '2026-01-15T10:02:30Z',
    htmlUrl: 'https://github.com/owner/repo/runs/1',
    checkSuiteId: 100,
    ...overrides,
  };
}

describe('ChecksTab', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders empty state when no checks', () => {
    render(<ChecksTab checks={[]} />);
    expect(screen.getByText('No CI checks configured')).toBeTruthy();
  });

  it('renders check run names', () => {
    const checks = [
      makeCheck({ id: 1, name: 'build', conclusion: 'success' }),
      makeCheck({ id: 2, name: 'lint', conclusion: 'failure' }),
    ];
    render(<ChecksTab checks={checks} />);
    expect(screen.getByText('build')).toBeTruthy();
    expect(screen.getByText('lint')).toBeTruthy();
  });

  it('shows summary counts for passed checks', () => {
    const checks = [
      makeCheck({ id: 1, name: 'build', conclusion: 'success' }),
      makeCheck({ id: 2, name: 'test', conclusion: 'success' }),
    ];
    render(<ChecksTab checks={checks} />);
    expect(screen.getByText('2 passed')).toBeTruthy();
  });

  it('shows summary counts for failed checks', () => {
    const checks = [makeCheck({ id: 1, name: 'build', conclusion: 'failure' })];
    render(<ChecksTab checks={checks} />);
    expect(screen.getByText('1 failed')).toBeTruthy();
  });

  it('shows summary counts for pending checks', () => {
    const checks = [
      makeCheck({ id: 1, name: 'deploy', status: 'in_progress', conclusion: undefined }),
    ];
    render(<ChecksTab checks={checks} />);
    expect(screen.getByText('1 in progress')).toBeTruthy();
  });

  it('shows summary counts for skipped checks', () => {
    const checks = [makeCheck({ id: 1, name: 'optional', conclusion: 'skipped' })];
    render(<ChecksTab checks={checks} />);
    expect(screen.getByText('1 skipped')).toBeTruthy();
  });

  it('classifies queued checks as pending', () => {
    const checks = [
      makeCheck({ id: 1, name: 'queued-job', status: 'queued', conclusion: undefined }),
    ];
    render(<ChecksTab checks={checks} />);
    expect(screen.getByText('1 in progress')).toBeTruthy();
  });

  it('classifies timed_out checks as failed', () => {
    const checks = [makeCheck({ id: 1, name: 'slow-job', conclusion: 'timed_out' })];
    render(<ChecksTab checks={checks} />);
    expect(screen.getByText('1 failed')).toBeTruthy();
  });

  it('classifies cancelled checks as skipped', () => {
    const checks = [makeCheck({ id: 1, name: 'cancelled-job', conclusion: 'cancelled' })];
    render(<ChecksTab checks={checks} />);
    expect(screen.getByText('1 skipped')).toBeTruthy();
  });

  it('classifies neutral checks as skipped', () => {
    const checks = [makeCheck({ id: 1, name: 'neutral-job', conclusion: 'neutral' })];
    render(<ChecksTab checks={checks} />);
    expect(screen.getByText('1 skipped')).toBeTruthy();
  });

  it('opens the check URL via the opener plugin on click', () => {
    mockOpenUrl.mockClear();
    const checks = [makeCheck({ id: 1, name: 'build', htmlUrl: 'https://github.com/runs/1' })];
    render(<ChecksTab checks={checks} />);
    const row = screen.getByText('build').closest('[role="button"]') as HTMLElement | null;
    expect(row).toBeTruthy();
    fireEvent.click(row!);
    expect(mockOpenUrl).toHaveBeenCalledWith('https://github.com/runs/1');
  });

  it('shows "running" label for pending checks', () => {
    const checks = [
      makeCheck({ id: 1, name: 'deploy', status: 'in_progress', conclusion: undefined }),
    ];
    render(<ChecksTab checks={checks} />);
    expect(screen.getByText('running')).toBeTruthy();
  });

  it('shows duration for completed checks', () => {
    const checks = [
      makeCheck({
        id: 1,
        name: 'build',
        startedAt: '2026-01-15T10:00:00Z',
        completedAt: '2026-01-15T10:02:30Z',
      }),
    ];
    render(<ChecksTab checks={checks} />);
    expect(screen.getByText('2m 30s')).toBeTruthy();
  });

  it('shows duration in seconds when less than 60s', () => {
    const checks = [
      makeCheck({
        id: 1,
        name: 'lint',
        startedAt: '2026-01-15T10:00:00Z',
        completedAt: '2026-01-15T10:00:45Z',
      }),
    ];
    render(<ChecksTab checks={checks} />);
    expect(screen.getByText('45s')).toBeTruthy();
  });

  it('does not show duration when timestamps are missing', () => {
    const checks = [
      makeCheck({ id: 1, name: 'build', startedAt: undefined, completedAt: undefined }),
    ];
    const { container } = render(<ChecksTab checks={checks} />);
    // Duration node would be the small monospace text after the row label.
    // With timestamps missing, no element should match "2m 30s" / "45s" patterns.
    expect(container.textContent).not.toMatch(/\d+m \d+s/);
    expect(container.textContent).not.toMatch(/\b\d+s\b/);
  });

  it('groups checks by suite ID', () => {
    const checks = [
      makeCheck({ id: 1, name: 'build', checkSuiteId: 100 }),
      makeCheck({ id: 2, name: 'test', checkSuiteId: 100 }),
      makeCheck({ id: 3, name: 'deploy', checkSuiteId: 200 }),
    ];
    const { container } = render(<ChecksTab checks={checks} />);
    // All three checks are rendered as data-check-row entries.
    const rows = container.querySelectorAll('[data-check-row]');
    expect(rows.length).toBe(3);
  });

  it('sorts failed checks before passed checks', () => {
    const checks = [
      makeCheck({ id: 1, name: 'passing-suite', checkSuiteId: 100, conclusion: 'success' }),
      makeCheck({ id: 2, name: 'failing-suite', checkSuiteId: 200, conclusion: 'failure' }),
    ];
    const { container } = render(<ChecksTab checks={checks} />);
    const rows = container.querySelectorAll('[data-check-row]');
    expect(rows.length).toBe(2);
    // Failed row should come first.
    expect(rows[0]?.getAttribute('data-check-state')).toBe('failed');
    expect(rows[1]?.getAttribute('data-check-state')).toBe('passed');
  });

  it('shows mixed summary with passed, failed, and pending', () => {
    const checks = [
      makeCheck({ id: 1, name: 'build', conclusion: 'success', checkSuiteId: 100 }),
      makeCheck({ id: 2, name: 'test', conclusion: 'failure', checkSuiteId: 100 }),
      makeCheck({
        id: 3,
        name: 'deploy',
        status: 'in_progress',
        conclusion: undefined,
        checkSuiteId: 200,
      }),
    ];
    render(<ChecksTab checks={checks} />);
    expect(screen.getByText('1 passed')).toBeTruthy();
    expect(screen.getByText('1 failed')).toBeTruthy();
    expect(screen.getByText('1 in progress')).toBeTruthy();
  });

  // ── New PR #4 assertions ────────────────────────────

  it('renders one [data-check-row] per check', () => {
    const checks = [
      makeCheck({ id: 1, name: 'ci/build', conclusion: 'success', checkSuiteId: 100 }),
      makeCheck({ id: 2, name: 'ci/test', conclusion: 'failure', checkSuiteId: 100 }),
      makeCheck({
        id: 3,
        name: 'ci/lint',
        status: 'in_progress',
        conclusion: undefined,
        checkSuiteId: 101,
      }),
    ];
    const { container } = render(<ChecksTab checks={checks} />);
    expect(container.querySelectorAll('[data-check-row]')).toHaveLength(3);
  });

  it('marks failed checks with data-check-state="failed"', () => {
    const checks = [
      makeCheck({ id: 1, name: 'ci/build', conclusion: 'success', checkSuiteId: 100 }),
      makeCheck({ id: 2, name: 'ci/test', conclusion: 'failure', checkSuiteId: 100 }),
    ];
    const { container } = render(<ChecksTab checks={checks} />);
    expect(
      container.querySelector('[data-check-row][data-check-state="failed"]'),
    ).toBeTruthy();
  });

  it('renders LinearProgress in the summary', () => {
    const checks = [
      makeCheck({ id: 1, name: 'ci/build', conclusion: 'success' }),
      makeCheck({ id: 2, name: 'ci/test', conclusion: 'failure' }),
    ];
    const { container } = render(<ChecksTab checks={checks} />);
    expect(container.querySelector('.bd-linear')).toBeTruthy();
  });

  it('renders count Pills with data-check-count', () => {
    const checks = [
      makeCheck({ id: 1, name: 'ci/build', conclusion: 'success' }),
      makeCheck({ id: 2, name: 'ci/test', conclusion: 'failure' }),
    ];
    const { container } = render(<ChecksTab checks={checks} />);
    const pills = container.querySelectorAll('[data-check-count]');
    expect(pills.length).toBeGreaterThanOrEqual(2);
  });

  it('renders Fix button on failed checks when pr is provided', () => {
    const checks = [
      makeCheck({ id: 1, name: 'ci/build', conclusion: 'success', checkSuiteId: 100 }),
      makeCheck({ id: 2, name: 'ci/test', conclusion: 'failure', checkSuiteId: 100 }),
    ];
    const pr = {
      pullRequest: {
        repoOwner: 'o',
        repoName: 'r',
        number: 1,
        headRef: 'b',
        baseRef: 'main',
        authorLogin: 'a',
        state: 'open',
        isDraft: false,
        mergeable: true,
        htmlUrl: '',
        body: '',
        labels: [],
        additions: 0,
        deletions: 0,
        changedFiles: 0,
        commitCount: 0,
        createdAt: '',
        updatedAt: '',
        commentCount: 0,
        reviewStatus: 'none',
      },
      checks: [],
      overallStatus: 'red',
      failedCheckNames: ['ci/test'],
      pendingCheckNames: [],
      passedCount: 1,
      skippedCount: 0,
    };
    // biome-ignore lint/suspicious/noExplicitAny: fixture-only any cast for narrow type
    const { container } = render(<ChecksTab checks={checks} pr={pr as any} />);
    const failedRow = container.querySelector(
      '[data-check-row][data-check-state="failed"]',
    );
    expect(failedRow).toBeTruthy();
    expect(failedRow?.querySelector('.bd-btn')).toBeTruthy();
  });
});
