import { describe, expect, it } from 'vitest';
import { listPr } from '../__fixtures__/pr-list-data';
import {
  checkCountsFor,
  type PrCardData,
  prRowKey,
  ROW_CHIP_LABEL,
  rowChipFor,
  toPrCardData,
} from '../pr-card-data';

function card(overrides: Partial<PrCardData> = {}): PrCardData {
  return {
    number: 1,
    title: 'T',
    repoOwner: 'o',
    repoName: 'r',
    authorLogin: 'a',
    isMine: false,
    status: 'green',
    statusLabel: '',
    reviewState: 'none',
    isDraft: false,
    isMerged: false,
    isClosed: false,
    hasConflict: false,
    ...overrides,
  };
}

describe('rowChipFor', () => {
  it.each([
    ['approved', 'approved'],
    ['changes', 'changes'],
    ['commented', 'commented'],
    ['pending', 'requested'],
    ['none', 'none'],
  ] as const)('maps review state %s to the %s chip', (reviewState, chip) => {
    expect(rowChipFor(card({ reviewState }))).toBe(chip);
  });

  it('shows "Review requested" for a PR with pending reviewers and no reviews yet', () => {
    expect(rowChipFor(card({ reviewState: 'none', reviewRequested: true }))).toBe('requested');
  });

  it('puts merged over closed over conflicts over draft over the review state', () => {
    const everything = card({
      isMerged: true,
      isClosed: true,
      hasConflict: true,
      isDraft: true,
      reviewState: 'approved',
    });
    expect(rowChipFor(everything)).toBe('merged');
    expect(rowChipFor({ ...everything, isMerged: false })).toBe('closed');
    expect(rowChipFor({ ...everything, isMerged: false, isClosed: false })).toBe('conflicts');
    expect(
      rowChipFor({ ...everything, isMerged: false, isClosed: false, hasConflict: false }),
    ).toBe('draft');
  });

  it('labels every chip in sentence case', () => {
    for (const label of Object.values(ROW_CHIP_LABEL)) {
      expect(label[0]).toBe(label[0]!.toUpperCase());
      expect(label.slice(1)).toBe(label.slice(1).toLowerCase());
    }
  });
});

describe('toPrCardData (Workbench fields)', () => {
  it('carries check counts, the update time and pending review requests', () => {
    const prw = listPr({
      number: 7,
      title: 'x',
      repo: 'acme/app',
      requestedReviewers: ['koen'],
      checks: { total: 80, fail: 2, run: 3, skip: 1 },
    });
    const data = toPrCardData(prw, false);
    expect(data.checks).toEqual({ ok: 74, fail: 2, run: 3, total: 80 });
    expect(data.checks).toEqual(checkCountsFor(prw));
    expect(data.updatedAt).toBe(prw.pullRequest.updatedAt);
    expect(data.reviewRequested).toBe(true);
  });

  it('counts team review requests as requested', () => {
    const prw = listPr({ number: 7, title: 'x', repo: 'acme/app' });
    prw.pullRequest.requestedTeams = ['platform'];
    expect(toPrCardData(prw, false).reviewRequested).toBe(true);
  });

  it('is not requested without pending reviewers', () => {
    const prw = listPr({ number: 7, title: 'x', repo: 'acme/app' });
    expect(toPrCardData(prw, false).reviewRequested).toBe(false);
  });
});

describe('prRowKey', () => {
  it('keeps same-numbered PRs of different repositories apart', () => {
    expect(prRowKey({ repoOwner: 'a', repoName: 'x', number: 1 })).toBe('a/x#1');
    expect(prRowKey({ repoOwner: 'a', repoName: 'y', number: 1 })).not.toBe(
      prRowKey({ repoOwner: 'a', repoName: 'x', number: 1 }),
    );
  });
});
