import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));

import type { CheckRun } from '@/types';
import { ChecksGrouped } from '../ChecksGrouped';
import {
  checkStateOf,
  durationOf,
  groupChecks,
  groupSummary,
  isOpenByDefault,
  OTHER_CHECKS,
  suiteNameOf,
} from '../check-groups';

let nextId = 1;
function check(
  name: string,
  state: 'failed' | 'running' | 'passed' | 'skipped' | 'cancelled',
  suite = 10,
): CheckRun {
  const id = nextId++;
  const base = {
    id,
    name,
    htmlUrl: `https://github.com/acme/app/actions/runs/1/job/${id}`,
    checkSuiteId: suite,
    startedAt: '2026-09-25T10:00:00Z',
    completedAt: '2026-09-25T10:01:05Z',
  };
  switch (state) {
    case 'failed':
      return { ...base, status: 'completed', conclusion: 'failure' };
    case 'running':
      return { ...base, status: 'in_progress', completedAt: undefined };
    case 'passed':
      return { ...base, status: 'completed', conclusion: 'success' };
    case 'skipped':
      return { ...base, status: 'completed', conclusion: 'skipped' };
    case 'cancelled':
      return { ...base, status: 'completed', conclusion: 'cancelled' };
  }
}

describe('suiteNameOf', () => {
  it.each([
    ['CI / build', 'CI'],
    ['test (ubuntu-latest, 20)', 'test'],
    ['lint: biome', 'lint'],
    ['e2e (chromium) / shard 1', 'e2e (chromium)'],
    ['typecheck', null],
    ['(odd)', null],
  ])('%s → %s', (name, suite) => {
    expect(suiteNameOf(check(name, 'passed'))).toBe(suite);
  });
});

describe('groupChecks', () => {
  const checks = [
    check('Docs / build', 'passed', 1),
    check('Docs / links', 'passed', 1),
    check('CI / lint', 'passed', 2),
    check('CI / unit', 'failed', 2),
    check('CI / e2e', 'running', 2),
    check('CI / types', 'skipped', 2),
    check('CI / api', 'failed', 3),
    check('Release / publish', 'running', 4),
    check('Nightly / soak', 'cancelled', 5),
    check('typecheck', 'passed', 6),
    check('storybook', 'failed', 7),
  ];
  const groups = groupChecks(checks);

  it('orders suites failing, running, passing, skipped', () => {
    expect(groups.map((g) => [g.name, g.state])).toEqual([
      ['CI', 'failed'],
      [OTHER_CHECKS, 'failed'],
      ['Release', 'running'],
      ['Docs', 'passed'],
      ['Nightly', 'skipped'],
    ]);
  });

  it('orders rows failed, running, passed, skipped, then by name', () => {
    const ci = groups[0]!;
    expect(ci.runs.map((r) => [r.name, checkStateOf(r)])).toEqual([
      ['CI / api', 'failed'],
      ['CI / unit', 'failed'],
      ['CI / e2e', 'running'],
      ['CI / lint', 'passed'],
      ['CI / types', 'skipped'],
    ]);
  });

  it('collects checks without a suite into one group', () => {
    const other = groups.find((g) => g.name === OTHER_CHECKS)!;
    expect(other.runs.map((r) => r.name)).toEqual(['storybook', 'typecheck']);
  });

  it('gives a lone check without a suite its own group', () => {
    expect(groupChecks([check('typecheck', 'passed')]).map((g) => g.name)).toEqual(['typecheck']);
  });

  it('offers a rerun for groups with failed runs it can rerun', () => {
    expect(groups.map((g) => [g.name, g.canRerun])).toEqual([
      ['CI', true],
      [OTHER_CHECKS, true],
      ['Release', false],
      ['Docs', false],
      ['Nightly', false],
    ]);
  });

  it('groups job-only Actions runs by their workflow name', () => {
    const named = (name: string, suite: number, workflowName?: string) => ({
      ...check(name, 'passed', suite),
      workflowName,
    });
    const byWorkflow = groupChecks([
      named('build', 10, 'CI'),
      named('test', 10, 'CI'),
      // The same workflow run again for the push event: one "CI" group.
      named('lint', 11, 'CI'),
      named('links', 12, 'Docs'),
      named('codecov/patch', 13),
    ]);
    expect(byWorkflow.map((g) => [g.name, g.runs.map((r) => r.name)])).toEqual([
      ['CI', ['build', 'lint', 'test']],
      ['codecov/patch', ['codecov/patch']],
      ['Docs', ['links']],
    ]);
  });

  it('names a suite without a workflow name after the prefix its runs share', () => {
    const sameSuite = groupChecks([
      check('e2e (chromium)', 'passed', 20),
      check('e2e (webkit)', 'passed', 20),
      check('build', 'passed', 21),
      check('test', 'passed', 21),
    ]);
    // Suite 21 has neither a workflow name nor a shared prefix: its runs are loose.
    expect(sameSuite.map((g) => [g.name, g.runs.length])).toEqual([
      ['e2e', 2],
      [OTHER_CHECKS, 2],
    ]);
  });

  it('opens failing suites only', () => {
    expect(groups.map(isOpenByDefault)).toEqual([true, true, false, false, false]);
  });

  it('summarises each suite', () => {
    expect(groups.map(groupSummary)).toEqual([
      '2 failing',
      '1 failing',
      '0 of 1',
      '2 passed',
      '1 skipped',
    ]);
  });
});

describe('durationOf', () => {
  it('formats seconds, minutes and hours', () => {
    const at = (s: number) => new Date(Date.parse('2026-09-25T10:00:00Z') + s * 1000).toISOString();
    const run = (s: number) => ({ ...check('x', 'passed'), completedAt: at(s) });
    expect(durationOf(run(42))).toBe('42s');
    expect(durationOf(run(185))).toBe('3m 05s');
    expect(durationOf(run(3720))).toBe('1h 02m');
    expect(durationOf(check('x', 'running'))).toBe('');
  });
});

describe('ChecksGrouped', () => {
  const checks = [
    check('Docs / build', 'passed', 1),
    check('CI / unit', 'failed', 2),
    check('CI / lint', 'passed', 2),
    check('Release / publish', 'running', 4),
  ];

  function suites() {
    return [...document.querySelectorAll<HTMLDetailsElement>('details[data-suite]')];
  }

  it('renders failing suites first and open, the rest collapsed', () => {
    render(<ChecksGrouped checks={checks} />);
    expect(suites().map((d) => [d.dataset.suite, d.open])).toEqual([
      ['CI', true],
      ['Release', false],
      ['Docs', false],
    ]);
    expect(screen.getByRole('heading', { name: /Checks/ })).toHaveTextContent(
      '2 of 4 passed in 3 suites',
    );
  });

  it('leaves skipped checks out of the count, like the Checks tab badge', () => {
    render(
      <ChecksGrouped
        checks={[
          check('CI / unit', 'passed', 2),
          check('CI / lint', 'failed', 2),
          check('Release / publish', 'skipped', 4),
        ]}
      />,
    );
    expect(screen.getByRole('heading', { name: /Checks/ })).toHaveTextContent(
      '1 of 2 passed in 2 suites, 1 skipped',
    );
  });

  it('shows rows failed first with the duration on the right', () => {
    render(<ChecksGrouped checks={checks} />);
    const ci = suites()[0]!;
    const rows = ci.querySelectorAll<HTMLElement>('[data-check-row]');
    expect([...rows].map((r) => r.dataset.checkState)).toEqual(['failed', 'passed']);
    expect(rows[1]).toHaveTextContent('1m 05s');
  });

  it('offers Fix with Claude on failed rows only and Rerun on failing suites', () => {
    const onFix = vi.fn();
    const onRerun = vi.fn().mockResolvedValue(true);
    render(<ChecksGrouped checks={checks} onFix={onFix} onRerun={onRerun} />);
    const fixes = screen.getAllByRole('button', { name: 'Fix with Claude' });
    expect(fixes).toHaveLength(1);
    fireEvent.click(fixes[0]!);
    expect(onFix).toHaveBeenCalledWith(expect.objectContaining({ name: 'CI / unit' }));

    const rerun = screen.getByRole('button', { name: 'Rerun CI' });
    fireEvent.click(rerun);
    expect(onRerun).toHaveBeenCalledWith(expect.objectContaining({ name: 'CI', canRerun: true }));
    expect(screen.queryByRole('button', { name: 'Rerun Docs' })).not.toBeInTheDocument();
  });

  it('shows the first failure excerpt under the suites', () => {
    render(
      <ChecksGrouped
        checks={checks}
        firstFailure={{ checkName: 'CI / unit', lines: ['src/a.test.ts:12', 'Expected 1, got 2'] }}
      />,
    );
    const section = screen.getByRole('region', { name: 'First failure' });
    expect(within(section).getByText('CI / unit')).toBeInTheDocument();
    expect(section.querySelector('pre')).toHaveTextContent('src/a.test.ts:12 Expected 1, got 2');
  });
});
