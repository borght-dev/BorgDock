import type { ReactNode } from 'react';
import { ROW_CHIP_LABEL, rowChipFor, toPrCardData } from '@/components/pr/pr-card-data';
import { LinkedWorkItemBadge } from '@/components/pr-detail/LinkedWorkItemBadge';
import { PrDescription } from '@/components/shared/PrDescription';
import { Pill } from '@/components/shared/primitives';
import { useReviewReadiness } from '@/hooks/useReviewReadiness';
import { useWorkItemLinks } from '@/hooks/useWorkItemLinks';
import { reviewProgress } from '@/services/quick-review';
import type { PullRequest, PullRequestWithChecks } from '@/types';
import { QuickReviewChecks } from './QuickReviewChecks';
import { QuickReviewFolders } from './QuickReviewFolders';
import { ciNote } from './quick-review-status';

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function QuickReviewOverview({
  pr,
  detail: p,
  files,
  reviewed,
  proof,
  onFileSelect,
}: {
  pr: PullRequestWithChecks;
  detail: PullRequest;
  files: readonly string[] | null;
  reviewed: readonly string[];
  proof?: ReactNode;
  onFileSelect?: (path: string) => void;
}) {
  const links = useWorkItemLinks(p);
  const linkedItems = new Map(links.workItems.map((item) => [item.id, item]));
  const readiness = useReviewReadiness(p);
  const progress = files ? reviewProgress(files, reviewed) : null;
  return (
    <>
      <QuickReviewStatus pr={pr} detail={p} progress={progress} readiness={readiness} />
      <div className="qr-overview-grid">
        <div className="qr-overview-reading">
          {!!links.workItemIds.length && (
            <section className="qr-overview-section" aria-label="Linked work items">
              <h3>
                Linked work items <small>Hover to preview · Click to read</small>
              </h3>
              <div className="qr-linked-items">
                {links.workItemIds.map((id) => (
                  <LinkedWorkItemBadge key={id} workItemId={id} workItem={linkedItems.get(id)} />
                ))}
              </div>
            </section>
          )}
          <section className="qr-overview-section" aria-label="Description">
            <h3>Description</h3>
            {p.body ? (
              <PrDescription body={p.body} />
            ) : (
              <p className="qr-muted">No description provided.</p>
            )}
          </section>
          {proof}
        </div>
        <aside className="qr-overview-sidebar" aria-label="Review overview">
          <QuickReviewProgress detail={p} progress={progress} />
          <QuickReviewChecks pr={pr} readiness={readiness} />
          <QuickReviewFolders files={files} reviewed={reviewed} onFileSelect={onFileSelect} />
        </aside>
      </div>
    </>
  );
}

type Progress = ReturnType<typeof reviewProgress> | null;

function QuickReviewStatus({
  pr,
  detail: p,
  progress,
  readiness,
}: {
  pr: PullRequestWithChecks;
  detail: PullRequest;
  progress: Progress;
  readiness: ReturnType<typeof useReviewReadiness>;
}) {
  const requiredIssues =
    readiness.result?.checks.filter((check) => !['success', 'neutral'].includes(check.state)) ?? [];
  const parent = /stacked\s+on\s+(?:\[)?#(\d+)/i.exec(p.body)?.[1];
  const chip = rowChipFor(toPrCardData({ ...pr, pullRequest: p }, false));
  return (
    <div className="qr-overview-status" aria-label="Review status">
      <Pill tone={p.mergeable === false ? 'error' : 'neutral'}>
        {p.mergeable === false ? 'Conflicts' : ROW_CHIP_LABEL[chip]}
      </Pill>
      {!!requiredIssues.length && (
        <Pill tone="warning">
          {requiredIssues.length} required{' '}
          {requiredIssues.length === 1 ? 'check needs' : 'checks need'} attention
        </Pill>
      )}
      {!readiness.loading && !readiness.result?.complete && (
        <Pill tone="neutral">Required checks unverified</Pill>
      )}
      {p.isDraft && <Pill tone="neutral">Draft</Pill>}
      {parent && <Pill tone="warning">Stacked on #{parent}</Pill>}
      <Pill tone="neutral">Targets {p.baseRef}</Pill>
      <Pill
        tone={
          pr.failedCheckNames.length ? 'error' : pr.pendingCheckNames.length ? 'warning' : 'neutral'
        }
      >
        {ciNote(pr)}
      </Pill>
      {progress && (
        <Pill tone="neutral">
          {progress.toReview - progress.left}/{progress.toReview} reviewed
        </Pill>
      )}
    </div>
  );
}

function QuickReviewProgress({ detail: p, progress }: { detail: PullRequest; progress: Progress }) {
  return (
    <section className="qr-overview-section" aria-label="Review progress">
      <h3>Review progress</h3>
      {progress ? (
        <>
          <strong className="qr-progress-number">
            {progress.toReview - progress.left}
            <span> / {progress.toReview} reviewed</span>
          </strong>
          <progress
            max={Math.max(1, progress.toReview)}
            value={progress.toReview - progress.left}
            aria-label="Required files reviewed"
          />
          <p>
            {progress.left
              ? `${progress.left} files left to review`
              : 'All required files reviewed'}
            {progress.generated ? ` · ${progress.generated} generated excluded` : ''}
          </p>
        </>
      ) : (
        <p>Loading files…</p>
      )}
      <dl className="qr-card__meta">
        <div>
          <dt>{plural(p.changedFiles, 'file')}</dt>
          <dd>{plural(p.commitCount, 'commit')}</dd>
        </div>
        <div>
          <dt>
            <span className="qr-positive">+{p.additions}</span>{' '}
            <span className="qr-negative">−{p.deletions}</span>
          </dt>
          <dd>lines</dd>
        </div>
      </dl>
      <p className="qr-overview-branch">
        <code>{p.headRef}</code>
        <br />
        into <code>{p.baseRef}</code>
      </p>
    </section>
  );
}
