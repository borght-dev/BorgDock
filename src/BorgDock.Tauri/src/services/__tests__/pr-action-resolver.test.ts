import { describe, expect, it } from 'vitest';
import { FIXTURE_ME, listPr } from '@/components/pr/__fixtures__/pr-list-data';
import { workbenchPrimaryAction } from '../pr-action-resolver';

describe('workbenchPrimaryAction with a shared CI failure', () => {
  const red = listPr({
    number: 7,
    title: 'Waits on my review, red from master',
    repo: 'acme/app',
    author: 'mira',
    requestedReviewers: [FIXTURE_ME],
    reviewStatus: 'pending',
    checks: { total: 6, fail: 1 },
  });

  it('hides the review of a red PR whose failure may be its own', () => {
    expect(red.overallStatus).toBe('red');
    expect(workbenchPrimaryAction(red, FIXTURE_ME)).toBeNull();
  });

  it("offers the review when no failed check is the PR's doing", () => {
    expect(workbenchPrimaryAction(red, FIXTURE_ME, [], { failureNotCaused: true })).toBe('review');
  });

  it('never offers Merge on red checks, caused or not', () => {
    const approved = {
      ...red,
      pullRequest: {
        ...red.pullRequest,
        reviewStatus: 'approved' as const,
        requestedReviewers: [],
      },
    };
    expect(workbenchPrimaryAction(approved, FIXTURE_ME, [], { failureNotCaused: true })).toBeNull();
  });
});
