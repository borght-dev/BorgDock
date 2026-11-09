import { APPROVAL_UNDO_MS } from '@/components/focus/quick-review-approval';
import { prRowKey } from '@/components/pr/pr-card-data';
import { getClientForRepo } from '@/services/github/singleton';
import { showPr } from '@/services/navigation';
import { submitPrReview } from '@/services/pr-review';
import { useDependencyUpdatesStore } from '@/stores/dependency-updates-store';
import { showToast, type ToastTone } from '@/stores/toast-store';
import type { PullRequestWithChecks } from '@/types';
import { parseError } from '@/utils/parse-error';

/**
 * Approving dependency updates without Quick Review: one PR from its row, or
 * a batch from the sheet. Each approval waits for Undo, is sent only while
 * the PR's head is still the commit that was on screen, and can turn on
 * auto-merge. Rules: design/dependency-approve/mockups.html.
 */

/** Whether an approval also turns on auto-merge; remembered in `localStorage`. */
const MERGE_PREFERENCE_KEY = 'borgdock-dependency-merge';

export function readMergePreference(): boolean {
  try {
    return localStorage.getItem(MERGE_PREFERENCE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function writeMergePreference(merge: boolean): void {
  try {
    localStorage.setItem(MERGE_PREFERENCE_KEY, String(merge));
  } catch {
    // Not remembered; the toggle still applies to this approval.
  }
}

export interface ApprovalTarget {
  owner: string;
  repo: string;
  number: number;
  /** The head commit on screen: the approval names it and goes only if it is still the head. */
  headSha: string;
}

export type ApprovalResult =
  | { status: 'approved'; merge?: 'enabled' | 'merged'; mergeError?: string }
  | { status: 'skipped' | 'failed'; reason: string };

export interface ApprovalOutcome {
  target: ApprovalTarget;
  result: ApprovalResult;
}

export function targetOf(pr: PullRequestWithChecks): ApprovalTarget | null {
  const p = pr.pullRequest;
  if (!p.headSha) return null;
  return { owner: p.repoOwner, repo: p.repoName, number: p.number, headSha: p.headSha };
}

interface PullHead {
  state: string;
  merged?: boolean;
  head: { sha: string };
}

async function approveOne(target: ApprovalTarget, merge: boolean): Promise<ApprovalResult> {
  const { owner, repo, number, headSha } = target;
  const client = getClientForRepo(owner, repo);
  if (!client) return { status: 'failed', reason: 'not signed in to GitHub' };
  try {
    const current = await client.get<PullHead>(`repos/${owner}/${repo}/pulls/${number}`);
    if (current.merged) return { status: 'skipped', reason: 'merged already' };
    if (current.state !== 'open') return { status: 'skipped', reason: 'closed' };
    if (current.head.sha !== headSha)
      return { status: 'skipped', reason: 'changed after you looked' };
    const { autoMerge } = await submitPrReview(
      client,
      owner,
      repo,
      number,
      'APPROVE',
      undefined,
      { commit_id: headSha, comments: [] },
      merge ? 'auto' : undefined,
    );
    if (!autoMerge) return { status: 'approved' };
    try {
      return { status: 'approved', merge: await autoMerge };
    } catch (error) {
      return { status: 'approved', mergeError: parseError(error).message };
    }
  } catch (error) {
    return { status: 'failed', reason: parseError(error).message };
  }
}

/** One PR after another: GitHub throttles bursts of writes. */
export async function approveDependencyPrs(
  targets: readonly ApprovalTarget[],
  merge: boolean,
): Promise<ApprovalOutcome[]> {
  const outcomes: ApprovalOutcome[] = [];
  for (const target of targets) {
    outcomes.push({ target, result: await approveOne(target, merge) });
  }
  return outcomes;
}

function numbers(outcomes: readonly ApprovalOutcome[]): string {
  return outcomes.map((o) => `#${o.target.number}`).join(', ');
}

/** The toast after a run: what was approved, merged, and what wasn't and why. */
export function approvalSummary(outcomes: readonly ApprovalOutcome[]): {
  tone: ToastTone;
  title?: string;
  message: string;
} {
  const approved = outcomes.filter((o) => o.result.status === 'approved');
  const withMerge = (merge: 'enabled' | 'merged') =>
    outcomes.filter((o) => o.result.status === 'approved' && o.result.merge === merge);
  const merged = withMerge('merged');
  const enabled = withMerge('enabled');
  const reasons = outcomes.flatMap(({ target, result }) => {
    if (result.status !== 'approved') return [`#${target.number} ${result.reason}`];
    if (result.mergeError)
      return [`#${target.number} approved, auto-merge not on: ${result.mergeError}`];
    return [];
  });

  if (outcomes.length === 1) {
    const only = outcomes[0] as ApprovalOutcome;
    const n = `#${only.target.number}`;
    if (only.result.status !== 'approved')
      return { tone: 'error', title: `${n} not approved`, message: only.result.reason };
    if (only.result.mergeError)
      return {
        tone: 'error',
        title: `Approved ${n}; auto-merge not on`,
        message: only.result.mergeError,
      };
    const follow =
      only.result.merge === 'merged'
        ? ' and merged'
        : only.result.merge === 'enabled'
          ? ' · auto-merge on'
          : '';
    return { tone: 'success', message: `Approved ${n}${follow}` };
  }

  const merging = [
    enabled.length > 0 ? `auto-merge on for ${numbers(enabled)}` : '',
    merged.length > 0 ? `merged ${numbers(merged)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  if (reasons.length === 0)
    return {
      tone: 'success',
      title: `Approved ${approved.length} dependency updates`,
      message: merging || numbers(approved),
    };
  return {
    tone: 'error',
    title: `Approved ${approved.length} of ${outcomes.length}`,
    message: reasons.join('; '),
  };
}

/** The first PR that needs a look after a run: not approved, or approved without its merge. */
export function firstMissed(outcomes: readonly ApprovalOutcome[]): ApprovalTarget | null {
  const missed = outcomes.find((o) => o.result.status !== 'approved' || o.result.mergeError);
  return missed?.target ?? null;
}

/** The summary, with "Open #N" on the first PR that needs a look. */
function summaryToast(outcomes: readonly ApprovalOutcome[]) {
  const summary = approvalSummary(outcomes);
  const missed = firstMissed(outcomes);
  if (!missed) return summary;
  return {
    ...summary,
    actionLabel: `Open #${missed.number}`,
    onAction: () => void showPr({ owner: missed.owner, repo: missed.repo, number: missed.number }),
    durationMs: 0,
  };
}

/**
 * Approves `prs` after an Undo toast; the result is a second toast. While the
 * approvals wait and run, the rows offer no Approve and the strip and sheet
 * leave them out.
 */
export function holdDependencyApprovals(prs: readonly PullRequestWithChecks[], merge: boolean) {
  const targets = prs.map(targetOf).filter((t): t is ApprovalTarget => t !== null);
  if (targets.length === 0) return;
  const keys = prs.map((pr) => prRowKey(pr.pullRequest));
  const store = useDependencyUpdatesStore.getState();
  store.setPending(keys, true);
  const release = () => useDependencyUpdatesStore.getState().setPending(keys, false);
  const follow = merge ? ' · merges when green' : '';
  const single = targets.length === 1 ? (targets[0] as ApprovalTarget) : null;
  showToast({
    tone: 'success',
    ...(single
      ? { message: `Approving #${single.number}${follow}` }
      : {
          title: `Approving ${targets.length} dependency updates`,
          message: merge ? 'Then each merges when its checks pass' : 'Approvals only, no merge',
        }),
    actionLabel: 'Undo',
    countdown: true,
    // Only Undo takes it back: a close button would look like it did.
    dismissible: false,
    durationMs: APPROVAL_UNDO_MS,
    onAction: release,
    onExpire: () => {
      void approveDependencyPrs(targets, merge)
        .then((outcomes) => showToast(summaryToast(outcomes)))
        .finally(release);
    },
  });
}
