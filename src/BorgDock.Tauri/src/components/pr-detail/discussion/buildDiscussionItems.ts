import type { ClaudeReviewComment, ReviewThread, ReviewVerdict } from '@/types';

interface RawReview {
  id: number;
  state: string;
  body: string | null;
  submitted_at: string;
  user: { login: string } | null;
}

export type DiscussionItem =
  | {
      kind: 'review';
      id: string;
      author: string;
      authorIsBot: boolean;
      verdict: ReviewVerdict;
      body: string | null;
      createdAt: string;
    }
  | {
      kind: 'comment';
      id: string;
      author: string;
      authorIsBot: boolean;
      body: string;
      createdAt: string;
    }
  | { kind: 'code'; thread: ReviewThread };

function isBotLogin(login: string): boolean {
  return login.endsWith('[bot]') || login.endsWith('-bot');
}

function verdictForState(state: string): ReviewVerdict | null {
  switch (state) {
    case 'APPROVED':
      return 'approved';
    case 'CHANGES_REQUESTED':
      return 'changes-requested';
    case 'COMMENTED':
      return 'commented';
    default:
      return null;
  }
}

function firstTimestamp(item: DiscussionItem): number {
  if (item.kind === 'review') return new Date(item.createdAt).getTime();
  if (item.kind === 'comment') return new Date(item.createdAt).getTime();
  const first = item.thread.comments[0];
  return first ? new Date(first.createdAt).getTime() : 0;
}

/**
 * Flatten the three GitHub data sources we surface in DiscussionTab into a
 * single chronologically-sorted timeline.
 */
export function buildDiscussionItems(
  reviews: RawReview[],
  issueComments: ClaudeReviewComment[],
  threads: ReviewThread[],
): DiscussionItem[] {
  const items: DiscussionItem[] = [];

  for (const r of reviews) {
    const verdict = verdictForState(r.state);
    if (!verdict) continue;
    const author = r.user?.login ?? '';
    items.push({
      kind: 'review',
      id: `review-${r.id}`,
      author,
      authorIsBot: isBotLogin(author),
      verdict,
      body: r.body && r.body.length > 0 ? r.body : null,
      createdAt: r.submitted_at,
    });
  }

  for (const c of issueComments) {
    items.push({
      kind: 'comment',
      id: `comment-${c.id}`,
      author: c.author,
      authorIsBot: isBotLogin(c.author),
      body: c.body,
      createdAt: c.createdAt,
    });
  }

  for (const t of threads) {
    items.push({ kind: 'code', thread: t });
  }

  items.sort((a, b) => firstTimestamp(a) - firstTimestamp(b));
  return items;
}
