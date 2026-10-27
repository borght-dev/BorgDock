import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/shared/primitives';
import { useBranchStory } from '@/hooks/useBranchStory';
import { outsideCauseOf } from '@/services/ci-failures/lens';
import {
  healModeOf,
  type RerunOutcome,
  rerunAffected,
  rerunTargets,
  type UpdateOutcome,
  updateAffected,
} from '@/services/ci-failures/rerun';
import * as store from '@/services/ci-failures/store-api';
import type { CiGroupDetail, CiGroupSummary } from '@/services/ci-failures/types';
import { useCiBranch } from '@/stores/ci-failures-store';
import { usePrStore } from '@/stores/pr-store';
import { parseError } from '@/utils/parse-error';

interface RerunAffectedSheetProps {
  groupId: string;
  onClose: () => void;
}

type Outcome = RerunOutcome | UpdateOutcome;

function outcomeText(outcome: Outcome): string {
  if (outcome.error) return ` · failed: ${outcome.error}`;
  if (!('action' in outcome)) return ' · rerun requested';
  return outcome.action === 'updated'
    ? ' · branch updated, CI starts again'
    : ' · already up to date, rerun requested';
}

/** Stands in for the group until its detail is read; it never failed on the default branch. */
const NO_GROUP = {
  id: '',
  lastObservedAt: '',
  defaultBranchRuns: [] as number[],
} as unknown as CiGroupSummary;

/**
 * RerunAffectedSheet — the open PRs still red with the group's failure and
 * what brings them back. Once a fix is on the base branch (a linked fix
 * merged, or the base branch passes again) each branch is updated from the
 * base, which starts its CI with the fix; a branch that already has it gets
 * a rerun. For a cause that was never the code (infrastructure, flaky) the
 * failed jobs are rerun. Nothing runs until you confirm.
 */
export function RerunAffectedSheet({ groupId, onClose }: RerunAffectedSheetProps) {
  const prs = usePrStore((s) => s.pullRequests);
  const [detail, setDetail] = useState<CiGroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const branch = useCiBranch(detail?.summary.scope ?? null) ?? 'the default branch';
  const story = useBranchStory(detail?.summary ?? NO_GROUP);

  useEffect(() => {
    let cancelled = false;
    store
      .loadGroup(groupId)
      .then((result) => !cancelled && setDetail(result))
      .catch((err) => !cancelled && setError(parseError(err).message));
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const targets = useMemo(() => (detail ? rerunTargets(detail, prs) : []), [detail, prs]);
  // `wait`: the base branch has the failure and no fix yet; a rerun would only fail again.
  const mode = !detail
    ? 'rerun'
    : (healModeOf(detail.summary, !!story?.recovered, branch) ??
      (outsideCauseOf(detail.summary, branch) === 'base-branch' ? 'wait' : 'rerun'));
  const update = mode === 'update';
  const runs = targets.reduce((sum, t) => sum + Math.max(1, t.workflowRunIds.length), 0);
  const count = `${targets.length} ${targets.length === 1 ? 'PR' : 'PRs'}`;

  const confirm = () => {
    setRunning(true);
    void (update ? updateAffected(targets) : rerunAffected(targets))
      .then(setOutcomes)
      .catch((err) => setError(parseError(err).message))
      .finally(() => setRunning(false));
  };

  return (
    <div className="bd-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="bd-modal bd-dp-sheet bd-dp-sheet--run"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bd-ci-rerun-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="bd-dp-sheet__head">
          <h2 id="bd-ci-rerun-title">
            {mode === 'update'
              ? 'Update affected PRs'
              : mode === 'wait'
                ? 'Affected PRs'
                : 'Rerun affected PRs'}
          </h2>
          <p className="bd-dp-sheet__lede">
            {mode === 'update'
              ? `Merges ${branch} into each branch, like GitHub's Update branch, so its CI runs again with the fix. This adds a merge commit to each PR. A branch that already has ${branch} gets its failed jobs rerun instead.`
              : mode === 'wait'
                ? `This failure is on ${branch} too, with no fix yet. A rerun reuses each run's original merge commit, so it would fail again. Once ${branch} passes, update these branches from it.`
                : `Reruns the failed jobs of ${runs} workflow ${runs === 1 ? 'run' : 'runs'}. GitHub retries every failed job in each run, not only the ones in this group.`}
          </p>
        </header>
        <div className="bd-dp-sheet__body">
          <section aria-label="Pull requests" className="bd-dp-sheet__pick">
            {error && <p className="bd-ci-dialog__error">{error}</p>}
            {detail && targets.length === 0 && (
              <p className="bd-dp-sheet__hint">No open PR is still red with this failure.</p>
            )}
            <div className="bd-ci-sheet__occurrences">
              {targets.map((target) => {
                const p = target.pr.pullRequest;
                const outcome = outcomes?.find((o) => o.prNumber === p.number);
                return (
                  <div
                    key={`${p.repoOwner}/${p.repoName}#${p.number}`}
                    className="bd-ci-sheet__occurrence"
                  >
                    <em>#{p.number}</em>
                    <span>
                      {p.title} · {target.checks.map((c) => c.name).join(', ')}
                      {outcome && outcomeText(outcome)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        <footer className="bd-dp-sheet__foot">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {outcomes || mode === 'wait' ? 'Close' : 'Cancel'}
          </Button>
          {!outcomes && mode !== 'wait' && (
            <Button
              variant="primary"
              size="sm"
              disabled={running || targets.length === 0}
              onClick={confirm}
            >
              {running
                ? update
                  ? 'Updating…'
                  : 'Rerunning…'
                : `${update ? 'Update' : 'Rerun'} ${count}`}
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
