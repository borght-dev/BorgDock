import type { PrCardProps } from '../ui/PrCard';

/* Sample PR data used by FocusSidebar and MainPRsWindow mockups. */
export const FOCUS_PRS: PrCardProps[] = [
  {
    status: 'green',
    mine: true,
    title: 'Add rate-limit backoff for GitHub polling',
    repo: 'acme/prdock',
    author: 'JS',
    branch: 'gh-polling-backoff',
    number: 1284,
    reason: [{ kind: 'green', text: 'Ready to merge' }],
    reviewState: 'approved',
    worktree: 'slot-2',
  },
  {
    status: 'red',
    title: 'Migrate cache layer to SQLite WAL',
    repo: 'acme/prdock',
    author: 'mr',
    branch: 'sqlite-wal',
    number: 1279,
    reason: [
      { kind: 'red', text: 'Build failing' },
      { kind: null, text: 'requested 3h ago' },
    ],
    pills: [{ variant: 'error', text: '2 failing' }],
  },
  {
    status: 'yellow',
    title: 'Settings: add per-repo priority weights',
    repo: 'acme/prdock',
    author: 'hs',
    branch: 'per-repo-priority',
    number: 1271,
    reason: [
      { kind: 'yellow', text: 'Review overdue' },
      { kind: null, text: 'Stale 2d' },
    ],
    pills: [{ variant: 'warning', text: 'in progress' }],
  },
  {
    status: 'green',
    title: 'Quick Review overlay keyboard shortcuts',
    repo: 'acme/prdock',
    author: 'ct',
    branch: 'quick-review-keys',
    number: 1266,
    reason: [{ kind: null, text: 'Review requested' }],
  },
  {
    status: 'green',
    mine: true,
    title: 'File Palette: fuzzy match on path segments',
    repo: 'acme/prdock',
    author: 'JS',
    branch: 'palette-fuzzy',
    number: 1260,
    reason: [{ kind: null, text: 'Awaiting review · 1d' }],
    reviewState: 'changes',
    worktree: 'slot-4',
  },
];
