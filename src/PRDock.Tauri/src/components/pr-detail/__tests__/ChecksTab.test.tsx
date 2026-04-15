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
    const durationEls = container.querySelectorAll('.checks-run-duration');
    expect(durationEls.length).toBe(0);
  });

  it('groups checks by suite ID', () => {
    const checks = [
      makeCheck({ id: 1, name: 'build', checkSuiteId: 100 }),
      makeCheck({ id: 2, name: 'test', checkSuiteId: 100 }),
      makeCheck({ id: 3, name: 'deploy', checkSuiteId: 200 }),
    ];
    const { container } = render(<ChecksTab checks={checks} />);
    const suiteGroups = container.querySelectorAll('.checks-suite');
    expect(suiteGroups.length).toBe(2);
  });

  it('sorts failed suites before passed suites', () => {
    const checks = [
      makeCheck({ id: 1, name: 'passing-suite', checkSuiteId: 100, conclusion: 'success' }),
      makeCheck({ id: 2, name: 'failing-suite', checkSuiteId: 200, conclusion: 'failure' }),
    ];
    const { container } = render(<ChecksTab checks={checks} />);
    const suites = container.querySelectorAll('.checks-suite');
    expect(suites.length).toBe(2);
    // Failed suite should be first
    expect(suites[0]?.classList.contains('checks-suite--failed')).toBe(true);
    expect(suites[1]?.classList.contains('checks-suite--passed')).toBe(true);
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

  it('renders progress bar segments', () => {
    const checks = [
      makeCheck({ id: 1, name: 'build', conclusion: 'success' }),
      makeCheck({ id: 2, name: 'test', conclusion: 'failure' }),
    ];
    const { container } = render(<ChecksTab checks={checks} />);
    const progressBar = container.querySelector('.checks-progress-bar');
    expect(progressBar).toBeTruthy();
    const segments = progressBar?.querySelectorAll('.checks-progress-segment');
    expect(segments?.length).toBeGreaterThan(0);
  });

  it('renders skipped-only progress bar when all checks are skipped', () => {
    const checks = [
      makeCheck({ id: 1, name: 'skip1', conclusion: 'skipped' }),
      makeCheck({ id: 2, name: 'skip2', conclusion: 'skipped' }),
    ];
    const { container } = render(<ChecksTab checks={checks} />);
    const skippedSegments = container.querySelectorAll('.checks-progress-skipped');
    expect(skippedSegments.length).toBe(1);
  });
});
