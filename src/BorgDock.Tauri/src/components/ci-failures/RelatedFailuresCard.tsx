import { useState } from 'react';
import { useBranchStory } from '@/hooks/useBranchStory';
import type { PrCiFailures } from '@/hooks/usePrCiFailures';
import {
  claimForMe,
  openOwner,
  openSheet,
  releaseClaim,
  renewClaim,
  resolveGroup,
  showGroupPrs,
} from '@/services/ci-failures/actions';
import { HYPOTHESIS_LABEL, hypothesesOf } from '@/services/ci-failures/hypothesis';
import { ownerLabel, ownerStatusOf } from '@/services/ci-failures/ownership';
import { healModeOf } from '@/services/ci-failures/rerun';
import { ciFailureSettings } from '@/services/ci-failures/settings';
import type { CiGroupSummary } from '@/services/ci-failures/types';
import { factsOf, useBlockedPrs } from '@/stores/ci-failures-store';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useT3SessionStore } from '@/stores/t3-session-store';
import type { CheckRun, PullRequestWithChecks } from '@/types';
import { parseError } from '@/utils/parse-error';
import { formatAgo } from '@/utils/relative-time';
import { BranchStoryLine } from './BranchStoryLine';
import { confidenceOf, evidenceText, excerptOf, headlineOf } from './copy';
import { GroupDetail } from './GroupDetail';
import { type GroupRow, relatedView } from './related-rows';

interface RelatedFailuresCardProps {
  pr: PullRequestWithChecks;
  checks: readonly CheckRun[];
  failures: PrCiFailures;
}

/** Runs a group action, keeping its error next to the row (the pop-out has no toasts). */
function useGroupAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    void work()
      .catch((err) => setError(parseError(err).message))
      .finally(() => setBusy(false));
  };
  return { busy, error, run };
}

function OwnerLine({
  group,
  act,
}: {
  group: CiGroupSummary;
  act: ReturnType<typeof useGroupAction>;
}) {
  const threads = useDispatchStore((s) => s.threads);
  const sessions = useT3SessionStore((s) => s.sessions);
  const claim = group.claim;
  if (!claim) return null;
  const status = ownerStatusOf(claim, { threads, sessions, now: new Date() });
  const reach =
    claim.ownerKind === 'github_issue'
      ? null
      : group.trackingIssue
        ? `tracked in ${group.trackingIssue.replace(/^.*\/issues\//, '#')}`
        : 'this machine';
  return (
    <div className="bd-ci-group__owner" data-stale={status.stale || undefined}>
      <span>
        Owner <strong>{ownerLabel(claim)}</strong> · {status.label} · {formatAgo(claim.claimedAt)}
        {reach ? ` · ${reach}` : ''}
      </span>
      {(claim.ownerKind === 't3' || claim.ownerKind === 'github_issue') && (
        <button
          type="button"
          className="bd-ci-link"
          disabled={act.busy}
          onClick={() => act.run(() => openOwner(claim))}
        >
          Open
        </button>
      )}
      {status.finished ? (
        <>
          <span>Investigation finished?</span>
          <button
            type="button"
            className="bd-ci-link"
            disabled={act.busy}
            onClick={() => act.run(() => resolveGroup(group))}
          >
            Resolved
          </button>
          <button
            type="button"
            className="bd-ci-link"
            disabled={act.busy}
            onClick={() => act.run(() => renewClaim(claim))}
          >
            Keep
          </button>
        </>
      ) : (
        status.stale &&
        claim.state !== 'launch_failed' && (
          <button
            type="button"
            className="bd-ci-link"
            disabled={act.busy}
            onClick={() => act.run(() => renewClaim(claim))}
          >
            Still on it
          </button>
        )
      )}
      <button
        type="button"
        className="bd-ci-link bd-ci-link--quiet"
        disabled={act.busy}
        onClick={() => act.run(() => releaseClaim(claim))}
      >
        Release
      </button>
    </div>
  );
}

function GroupRowView({
  row,
  pr,
  branch,
}: {
  row: GroupRow;
  pr: PullRequestWithChecks;
  branch: string;
}) {
  const [open, setOpen] = useState(false);
  const act = useGroupAction();
  const { group } = row;
  const medium = group.maxTier !== 'high';
  const resolved = group.status === 'resolved';
  const hypotheses = hypothesesOf(factsOf(group, branch));
  const classified =
    group.classification && group.classification !== 'unknown'
      ? (HYPOTHESIS_LABEL[group.classification as keyof typeof HYPOTHESIS_LABEL] ??
        group.classification)
      : null;
  const excerpt = excerptOf(row.occurrence, group.id);
  const excerptAddsDetail = !!excerpt && excerpt.trim() !== group.title.trim();
  const seenAfterFix = !!group.fixMergedAt && group.lastObservedAt > group.fixMergedAt;
  const otherPrs = group.prNumbers.length;
  const story = useBranchStory(group);
  const blocked = useBlockedPrs().get(group.id);
  // A pop-out window has no PR list; the group's PRs stand in for the blocked ones.
  const blockedPrs = blocked ? blocked.map((p) => p.pullRequest.number) : group.prNumbers;
  const heal = healModeOf(group, !!story?.recovered, branch);
  const detailsId = `bd-ci-detail-${group.id}`;
  return (
    <li className="bd-ci-group" data-group-id={group.id}>
      <div className="bd-ci-group__head">
        <span
          className="bd-ci-group__dot"
          data-tone={
            resolved
              ? 'resolved'
              : medium
                ? 'medium'
                : row.relatedness === 'shared'
                  ? 'shared'
                  : 'repeated'
          }
          aria-hidden
        />
        <span className="bd-ci-group__headline">
          {resolved ? 'Resolved: ' : ''}
          {headlineOf(group, row.relatedness, branch)}
        </span>
        <span className="bd-ci-group__meta">
          <b>{confidenceOf(group)}</b> · first failed {formatAgo(group.firstObservedAt)}
        </span>
      </div>
      <div className="bd-ci-group__title" title={group.title}>
        {row.checkNames.join(', ')} › {group.title}
      </div>
      {excerptAddsDetail && (
        <code className="bd-ci-group__excerpt" title={excerpt}>
          {excerpt}
        </code>
      )}
      {classified ? (
        <div className="bd-ci-group__line">Classified as {classified}</div>
      ) : (
        hypotheses[0] && (
          <div className="bd-ci-group__line">
            Likely {HYPOTHESIS_LABEL[hypotheses[0].kind].toLowerCase()}: {hypotheses[0].reason}
          </div>
        )
      )}
      {story && <BranchStoryLine group={group} story={story} blockedPrs={blockedPrs} />}
      {story?.recovered && (
        <div className="bd-ci-group__line" data-tone="good">
          Passing on {story.branch} again
        </div>
      )}
      {group.fixPr && (
        <div className="bd-ci-group__line" data-tone={seenAfterFix ? 'warn' : undefined}>
          Fix {group.fixPr.replace(/^.*\/pull\//, '#')}
          {group.fixMergedAt ? ` merged ${formatAgo(group.fixMergedAt)}` : ' open'}
          {seenAfterFix ? ' · seen again after the fix' : ''}
        </div>
      )}
      <OwnerLine group={group} act={act} />
      <div className="bd-ci-group__actions">
        {!group.claim && !resolved && (
          <>
            <button
              type="button"
              className="bd-ci-link"
              disabled={act.busy}
              onClick={() => act.run(() => claimForMe(group))}
            >
              Claim
            </button>
            <button
              type="button"
              className="bd-ci-link"
              disabled={act.busy}
              onClick={() => act.run(() => openSheet({ kind: 'investigate', groupId: group.id }))}
            >
              Investigate…
            </button>
          </>
        )}
        {heal && (
          <button
            type="button"
            className="bd-ci-link"
            disabled={act.busy}
            data-ci-heal={heal}
            onClick={() => act.run(() => openSheet({ kind: 'rerun', groupId: group.id }))}
          >
            {heal === 'update' ? 'Update affected…' : 'Rerun affected…'}
          </button>
        )}
        {otherPrs >= 2 && (
          <button
            type="button"
            className="bd-ci-link"
            disabled={act.busy}
            onClick={() =>
              act.run(() =>
                showGroupPrs({
                  groupId: group.id,
                  title: group.title,
                  scope: group.scope,
                  prNumbers: group.prNumbers,
                }),
              )
            }
          >
            Show {otherPrs} PRs
          </button>
        )}
        <button
          type="button"
          className="bd-ci-link bd-ci-link--quiet"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((was) => !was)}
        >
          {open ? 'Hide details' : 'Details'}
        </button>
      </div>
      {act.error && <div className="bd-ci-group__error">{act.error}</div>}
      {open && <GroupDetail id={detailsId} groupId={group.id} pr={pr} branch={branch} />}
    </li>
  );
}

/**
 * RelatedFailuresCard — above the Checks list: the groups this PR's failed
 * checks share with other PRs, attempts or the default branch, their
 * confidence, cause hypotheses and owner. Advisory only; it never changes
 * what a check says.
 */
export function RelatedFailuresCard({ pr, checks, failures }: RelatedFailuresCardProps) {
  const p = pr.pullRequest;
  const collecting = useSettingsStore((s) => ciFailureSettings(s.settings).enabled);
  const view = relatedView(checks, failures.data, { headSha: p.headSha, collecting });
  if (view.failedCount === 0) return null;
  const branch = p.baseRef || 'the default branch';
  const groups = view.rows.filter((row): row is GroupRow => row.kind === 'group');
  return (
    <section
      className="bd-ci-related"
      aria-labelledby={`bd-ci-related-${p.number}`}
      data-ci-related=""
    >
      <h3 className="bd-ci-related__heading" id={`bd-ci-related-${p.number}`}>
        Related failures
        <span>
          {groups.length > 0
            ? `${groups.length} ${groups.length === 1 ? 'group' : 'groups'} for ${view.failedCount} failed ${view.failedCount === 1 ? 'check' : 'checks'}`
            : `${view.failedCount} failed ${view.failedCount === 1 ? 'check' : 'checks'}`}
        </span>
      </h3>
      {!collecting ? (
        <p className="bd-ci-related__quiet">
          Grouping is off. Turn on Related CI failures in Settings → GitHub to compare failures
          across PRs.
        </p>
      ) : view.rows.length === 0 ? (
        <p className="bd-ci-related__quiet">
          {failures.loading
            ? 'Comparing with other PRs…'
            : `No related failures in other open PRs or on ${branch}.`}
        </p>
      ) : (
        <ul className="bd-ci-related__list">
          {view.rows.map((row) =>
            row.kind === 'group' ? (
              <GroupRowView key={row.group.id} row={row} pr={pr} branch={branch} />
            ) : (
              <li key={`evidence:${row.checkName}`} className="bd-ci-evidence-row">
                <strong>{row.checkName}</strong>
                <span>{evidenceText(row)}</span>
              </li>
            ),
          )}
        </ul>
      )}
      {collecting && view.unmatched.length > 0 && view.rows.length > 0 && (
        <p className="bd-ci-related__quiet">
          {view.unmatched.join(', ')}: no confident match elsewhere.
        </p>
      )}
    </section>
  );
}
