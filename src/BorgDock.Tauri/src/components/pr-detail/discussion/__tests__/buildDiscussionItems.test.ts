import { describe, expect, it } from 'vitest';
import { buildDiscussionItems } from '../buildDiscussionItems';
import type { ReviewThread } from '@/types';

const review = (id: number, state: string, when: string, login = 'u', body: string | null = null) => ({
  id,
  state,
  body,
  submitted_at: when,
  user: { login },
});

const issueComment = (id: string, when: string, body = 'b') => ({
  id,
  author: 'u',
  body,
  severity: 'unknown' as const,
  createdAt: when,
  htmlUrl: '',
});

const thread = (id: string, when: string, body = 'b'): ReviewThread => ({
  id,
  filePath: 'a.ts',
  line: 1,
  isResolved: false,
  snippet: [],
  comments: [
    {
      id: `${id}-c1`,
      databaseId: 1,
      author: 'u',
      authorIsBot: false,
      body,
      createdAt: when,
    },
  ],
});

describe('buildDiscussionItems', () => {
  it('returns three kinds: review, comment, code', () => {
    const items = buildDiscussionItems(
      [review(1, 'APPROVED', '2026-05-01T00:00:00Z')],
      [issueComment('1', '2026-05-01T01:00:00Z')],
      [thread('t1', '2026-05-01T02:00:00Z')],
    );
    expect(items.map((i) => i.kind)).toEqual(['review', 'comment', 'code']);
  });

  it('sorts items by their first timestamp ascending', () => {
    const items = buildDiscussionItems(
      [review(1, 'APPROVED', '2026-05-01T03:00:00Z')],
      [issueComment('1', '2026-05-01T01:00:00Z')],
      [thread('t1', '2026-05-01T02:00:00Z')],
    );
    expect(items.map((i) => i.kind)).toEqual(['comment', 'code', 'review']);
  });

  it('skips review events with state="PENDING"', () => {
    const items = buildDiscussionItems(
      [review(1, 'PENDING', '2026-05-01T00:00:00Z')],
      [],
      [],
    );
    expect(items).toHaveLength(0);
  });

  it('keeps a comment-only review verdict', () => {
    const items = buildDiscussionItems(
      [review(1, 'COMMENTED', '2026-05-01T00:00:00Z', 'u', 'good work')],
      [],
      [],
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe('review');
    if (items[0]!.kind === 'review') {
      expect(items[0]!.verdict).toBe('commented');
      expect(items[0]!.body).toBe('good work');
    }
  });
});
