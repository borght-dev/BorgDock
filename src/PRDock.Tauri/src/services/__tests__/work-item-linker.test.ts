import { describe, expect, it } from 'vitest';
import { detectWorkItemIds } from '@/services/work-item-linker';
import type { PullRequest } from '@/types';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: '',
    headRef: 'feature/my-branch',
    baseRef: 'main',
    authorLogin: 'user',
    authorAvatarUrl: '',
    state: 'open',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    isDraft: false,
    htmlUrl: '',
    body: '',
    repoOwner: 'org',
    repoName: 'repo',
    reviewStatus: 'none',
    commentCount: 0,
    labels: [],
    additions: 10,
    deletions: 5,
    changedFiles: 2,
    commitCount: 1,
    requestedReviewers: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AB# pattern
// ---------------------------------------------------------------------------

describe('detectWorkItemIds — AB# pattern', () => {
  it('detects AB# in title', () => {
    const pr = makePr({ title: 'Fix AB#12345 login issue' });
    expect(detectWorkItemIds(pr)).toContain(12345);
  });

  it('detects AB# in body', () => {
    const pr = makePr({ body: 'Relates to AB#9999' });
    expect(detectWorkItemIds(pr)).toContain(9999);
  });

  it('detects AB# in headRef', () => {
    const pr = makePr({ headRef: 'feature/AB#555' });
    expect(detectWorkItemIds(pr)).toContain(555);
  });

  it('detects AB# in labels', () => {
    const pr = makePr({ labels: ['AB#200'] });
    expect(detectWorkItemIds(pr)).toContain(200);
  });

  it('detects multiple AB# references', () => {
    const pr = makePr({ title: 'AB#100 and AB#200 fixes' });
    const ids = detectWorkItemIds(pr);
    expect(ids).toContain(100);
    expect(ids).toContain(200);
  });

  it('is case insensitive for AB prefix', () => {
    const pr = makePr({ title: 'ab#777 ab#888 Ab#999' });
    const ids = detectWorkItemIds(pr);
    expect(ids).toContain(777);
    expect(ids).toContain(888);
    expect(ids).toContain(999);
  });

  it('deduplicates across sources', () => {
    const pr = makePr({ title: 'AB#100', body: 'Also AB#100' });
    const ids = detectWorkItemIds(pr);
    expect(ids.filter((id) => id === 100)).toHaveLength(1);
  });

  it('ignores AB#0', () => {
    const pr = makePr({ title: 'AB#0 is not valid' });
    expect(detectWorkItemIds(pr)).not.toContain(0);
  });
});

// ---------------------------------------------------------------------------
// Generic #NNN pattern (title & branch only, id > 100)
// ---------------------------------------------------------------------------

describe('detectWorkItemIds — generic # pattern', () => {
  it('detects #NNN in title when id > 100', () => {
    const pr = makePr({ title: 'Fix #12345' });
    expect(detectWorkItemIds(pr)).toContain(12345);
  });

  it('detects #NNN in headRef when preceded by whitespace and id > 100', () => {
    const pr = makePr({ headRef: 'feature #500-fix' });
    expect(detectWorkItemIds(pr)).toContain(500);
  });

  it('does not detect #NNN in headRef when preceded by / (no valid separator)', () => {
    const pr = makePr({ headRef: 'feature/#500-fix' });
    // The regex requires ^, whitespace, or ( before #
    expect(detectWorkItemIds(pr)).not.toContain(500);
  });

  it('ignores #NNN with id <= 100 (likely GitHub issue refs)', () => {
    const pr = makePr({ title: 'Fix #42 and #100' });
    const ids = detectWorkItemIds(pr);
    expect(ids).not.toContain(42);
    expect(ids).not.toContain(100);
  });

  it('ignores generic #NNN in body (too noisy)', () => {
    const pr = makePr({ body: 'See #5000 for details' });
    // The body text only triggers AB# matches, not generic #NNN
    expect(detectWorkItemIds(pr)).not.toContain(5000);
  });

  it('ignores generic #NNN in labels', () => {
    const pr = makePr({ labels: ['#5000'] });
    // Labels are included in AB# source but generic # only searches title + headRef
    expect(detectWorkItemIds(pr)).not.toContain(5000);
  });

  it('detects #NNN at start of title', () => {
    const pr = makePr({ title: '#200 initial commit' });
    expect(detectWorkItemIds(pr)).toContain(200);
  });

  it('detects #NNN after whitespace', () => {
    const pr = makePr({ title: 'fix: resolve #300 regression' });
    expect(detectWorkItemIds(pr)).toContain(300);
  });

  it('detects #NNN after parenthesis', () => {
    const pr = makePr({ title: 'fix(#400) something' });
    expect(detectWorkItemIds(pr)).toContain(400);
  });
});

// ---------------------------------------------------------------------------
// Combined & edge cases
// ---------------------------------------------------------------------------

describe('detectWorkItemIds — combined & edge cases', () => {
  it('returns empty array when no work items found', () => {
    const pr = makePr({ title: 'Just a normal PR' });
    expect(detectWorkItemIds(pr)).toEqual([]);
  });

  it('combines AB# and generic # results without duplicates', () => {
    const pr = makePr({ title: 'AB#300 and #300' });
    const ids = detectWorkItemIds(pr);
    expect(ids).toContain(300);
    expect(ids.filter((id) => id === 300)).toHaveLength(1);
  });

  it('finds ids from both AB# and generic # patterns', () => {
    const pr = makePr({ title: 'AB#111 and #222', headRef: 'feat/AB#333' });
    const ids = detectWorkItemIds(pr);
    expect(ids).toContain(111);
    expect(ids).toContain(222);
    expect(ids).toContain(333);
  });

  it('handles empty strings in all fields', () => {
    const pr = makePr({ title: '', body: '', headRef: '', labels: [] });
    expect(detectWorkItemIds(pr)).toEqual([]);
  });

  it('handles PR with all fields containing work item IDs', () => {
    const pr = makePr({
      title: 'AB#1',
      body: 'AB#2',
      headRef: 'AB#3',
      labels: ['AB#4'],
    });
    const ids = detectWorkItemIds(pr);
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(ids).toContain(3);
    expect(ids).toContain(4);
  });
});
