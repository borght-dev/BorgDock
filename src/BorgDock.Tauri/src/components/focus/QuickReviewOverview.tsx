import { LinkedWorkItemBadge } from '@/components/pr-detail/LinkedWorkItemBadge';
import { PrDescription } from '@/components/shared/PrDescription';
import type { useReviewReadiness } from '@/hooks/useReviewReadiness';
import { reviewProgress } from '@/services/quick-review';
import type { PullRequest, PullRequestWithChecks, WorkItem } from '@/types';
import { QuickReviewChecks } from './QuickReviewChecks';
import { QuickReviewFolders } from './QuickReviewFolders';

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The card's body: the description to read, and beside it what you decide
 * with, in that order: linked work items, checks, the files by folder with
 * the PR's size, and how far the review has come.
 */
export function QuickReviewOverview({
  pr,
  detail: p,
  files,
  filesFailed,
  onReloadFiles,
  reviewed,
  readiness,
  linkedWorkItemIds,
  linkedWorkItems,
  onFileSelect,
}: {
  pr: PullRequestWithChecks;
  detail: PullRequest;
  files: readonly string[] | null;
  filesFailed?: boolean;
  onReloadFiles?: () => void;
  reviewed: readonly string[];
  readiness: ReturnType<typeof useReviewReadiness>;
  linkedWorkItemIds: readonly number[];
  linkedWorkItems: ReadonlyMap<number, WorkItem>;
  onFileSelect?: (path: string) => void;
}) {
  const progress = files ? reviewProgress(files, reviewed) : null;
  return (
    <div className="qr-overview-grid">
      <div className="qr-overview-reading">
        <section className="qr-overview-section" aria-label="PR description">
          <h3>PR description</h3>
          {p.body ? (
            <PrDescription body={p.body} />
          ) : (
            <p className="qr-muted">No description provided.</p>
          )}
        </section>
      </div>
      <aside className="qr-overview-sidebar" aria-label="Review overview">
        {!!linkedWorkItemIds.length && (
          <section className="qr-overview-section" aria-label="Linked work items">
            <h3>
              Linked work items <small>Hover to preview · Click to read</small>
            </h3>
            <div className="qr-linked-items">
              {linkedWorkItemIds.map((id) => (
                <LinkedWorkItemBadge key={id} workItemId={id} workItem={linkedWorkItems.get(id)} />
              ))}
            </div>
          </section>
        )}
        <QuickReviewChecks pr={pr} readiness={readiness} />
        <QuickReviewFolders
          files={files}
          failed={filesFailed}
          onRetry={onReloadFiles}
          reviewed={reviewed}
          onFileSelect={onFileSelect}
          scope={
            <>
              {plural(p.changedFiles, 'file')} · <span className="qr-positive">+{p.additions}</span>{' '}
              <span className="qr-negative">−{p.deletions}</span> ·{' '}
              {plural(p.commitCount, 'commit')}
            </>
          }
        />
        <section className="qr-overview-section qr-progress" aria-label="Review progress">
          <h3>Review progress</h3>
          {progress ? (
            <>
              <p data-quick-review-left="">
                {progress.left} of {progress.toReview} to review, {progress.generated} generated
              </p>
              <progress
                max={Math.max(1, progress.toReview)}
                value={progress.toReview - progress.left}
                aria-label="Required files reviewed"
              />
            </>
          ) : (
            <p>{filesFailed ? "Files didn't load" : 'Loading files…'}</p>
          )}
        </section>
      </aside>
    </div>
  );
}
