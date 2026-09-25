import clsx from 'clsx';
import type { HTMLAttributes } from 'react';
import { checkCountsFor, reviewStateFor } from '@/components/pr/pr-card-data';
import type { PullRequestWithChecks } from '@/types';

/** Colour of the readiness dot: the three status colours plus a quiet grey. */
export type ReadinessTone = 'ok' | 'bad' | 'run' | 'neutral';

export interface Readiness {
  tone: ReadinessTone;
  /** The sentence, e.g. "Not ready: 2 checks failing". */
  text: string;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The detail header's readiness sentence (plans/ui-overhaul-workbench.md,
 * phase 3, after the iteration-2 mockup's `openInsp()`). It replaces the
 * merge-score ring: one line that says whether the PR can merge and, if not,
 * what it is waiting on. Built from the same fields as the row's card data
 * (`checkCountsFor`, `reviewStateFor`) and the action resolver's `ready`
 * rule, so the header and the row never disagree.
 *
 * Order: merged and closed first, then blockers (failing checks, conflicts;
 * a draft says "Draft" instead of "Not ready"), then a draft without
 * blockers, running checks, and finally what the reviewers said.
 */
export function readinessFor(prw: PullRequestWithChecks): Readiness {
  const p = prw.pullRequest;
  if (p.mergedAt) return { tone: 'neutral', text: 'Merged' };
  if (p.state === 'closed' || p.closedAt)
    return { tone: 'neutral', text: 'Closed without merging' };

  const checks = checkCountsFor(prw);
  const blockers: string[] = [];
  if (checks.fail > 0) blockers.push(`${plural(checks.fail, 'check')} failing`);
  if (p.mergeable === false) blockers.push(`merge conflicts with ${p.baseRef}`);
  if (blockers.length > 0) {
    return { tone: 'bad', text: `${p.isDraft ? 'Draft' : 'Not ready'}: ${blockers.join(' and ')}` };
  }
  if (p.isDraft) return { tone: 'neutral', text: 'Draft: not ready for review' };
  if (checks.run > 0) {
    return { tone: 'run', text: `Waiting: ${plural(checks.run, 'check')} still running` };
  }

  const relevant = prw.totalCheckCount - prw.skippedCount;
  switch (reviewStateFor(p.reviewStatus)) {
    case 'approved':
      return {
        tone: 'ok',
        text:
          relevant > 0 ? 'Ready to merge: approved, all checks passed' : 'Ready to merge: approved',
      };
    case 'changes':
      return { tone: 'run', text: 'Waiting: changes requested' };
    case 'commented':
      return { tone: 'run', text: 'Waiting: review comments to answer' };
    default:
      return { tone: 'run', text: 'Waiting for review' };
  }
}

export interface ReadinessLineProps extends HTMLAttributes<HTMLDivElement> {
  pr: PullRequestWithChecks;
}

/** ReadinessLine — the dot and sentence under the detail view's title. */
export function ReadinessLine({ pr, className, ...rest }: ReadinessLineProps) {
  const { tone, text } = readinessFor(pr);
  return (
    <div
      className={clsx('bd-readiness', className)}
      data-tone={tone}
      role="status"
      aria-live="polite"
      {...rest}
    >
      <span className="bd-readiness__dot" aria-hidden="true" />
      <span className="bd-readiness__text">{text}</span>
    </div>
  );
}
