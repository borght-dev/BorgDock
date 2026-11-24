import { describe, expect, it } from 'vitest';
import { listPr } from '@/components/pr/__fixtures__/pr-list-data';
import { prBranches, pruneStatus } from '../worktree-prune-model';

const SHOP = { owner: 'acme', name: 'shop' };

function pr(number: number, repo = 'acme/shop', merged = false) {
  return listPr({
    number,
    title: `Change ${number}`,
    repo,
    mergedHoursAgo: merged ? 3 : undefined,
  });
}

describe('pruneStatus', () => {
  const branches = prBranches([pr(1), pr(3)], [pr(2, 'acme/shop', true), pr(3, 'acme/shop', true)]);

  it('reads open, merged or closed, and no pull request at all', () => {
    expect(pruneStatus(SHOP, 'feature/1', branches)).toBe('open');
    expect(pruneStatus(SHOP, 'feature/2', branches)).toBe('closed');
    expect(pruneStatus(SHOP, 'spike/nothing', branches)).toBe('orphaned');
    expect(pruneStatus(SHOP, '', branches)).toBe('orphaned');
  });

  it('keeps a branch that was merged once and has a new pull request', () => {
    expect(pruneStatus(SHOP, 'feature/3', branches)).toBe('open');
  });

  it('matches whatever the case and with a refs/heads/ prefix', () => {
    expect(pruneStatus({ owner: 'Acme', name: 'Shop' }, 'refs/heads/Feature/2', branches)).toBe(
      'closed',
    );
  });

  it('never reads another repository’s pull request as this branch’s', () => {
    const other = prBranches([], [pr(2, 'acme/billing', true)]);
    expect(pruneStatus(SHOP, 'feature/2', other)).toBe('orphaned');
  });

  it('knows nothing without pull request data', () => {
    expect(pruneStatus(SHOP, 'feature/2', null)).toBe('unknown');
  });
});
