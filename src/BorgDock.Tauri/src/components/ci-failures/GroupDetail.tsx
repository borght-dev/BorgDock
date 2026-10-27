import { openUrl } from '@tauri-apps/plugin-opener';
import { useEffect, useMemo, useState } from 'react';
import { useReviewReadiness } from '@/hooks/useReviewReadiness';
import {
  mergeGroups,
  notRelated,
  openSheet,
  reopenGroup,
  resolveGroup,
  setClassification,
  setFixPr,
  splitFingerprint,
} from '@/services/ci-failures/actions';
import { askAgent, comparePrompt } from '@/services/ci-failures/compare';
import {
  HYPOTHESIS_LABEL,
  type HypothesisKind,
  hypothesesOf,
} from '@/services/ci-failures/hypothesis';
import * as store from '@/services/ci-failures/store-api';
import type { CiGroupDetail, CiGroupSummary } from '@/services/ci-failures/types';
import {
  CI_FAILURES_CHANGED_EVENT,
  type CiFailuresChange,
  factsOf,
} from '@/stores/ci-failures-store';
import type { PullRequestWithChecks } from '@/types';
import { parseError } from '@/utils/parse-error';
import { formatAgo } from '@/utils/relative-time';
import { excerptOf, matchReasons, shortSha } from './copy';

interface GroupDetailProps {
  id: string;
  groupId: string;
  pr: PullRequestWithChecks;
  branch: string;
}

const CLASSIFICATIONS: (HypothesisKind | 'unknown')[] = [
  'infrastructure',
  'base-branch',
  'flaky',
  'branch-specific',
  'unknown',
];

function useGroupDetail(groupId: string) {
  const [detail, setDetail] = useState<CiGroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const read = () =>
      void store
        .loadGroup(groupId)
        .then((result) => {
          if (!cancelled) setDetail(result);
        })
        .catch((err) => {
          if (!cancelled) setError(parseError(err).message);
        });
    read();
    void import('@tauri-apps/api/event')
      .then(({ listen }) => listen<CiFailuresChange>(CI_FAILURES_CHANGED_EVENT, () => read()))
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [groupId]);
  return { detail, error };
}

function open(url: string | null) {
  if (url) void openUrl(url).catch(() => {});
}

/**
 * GroupDetail — a group's evidence in place: every occurrence with its run,
 * attempt and tested commit, why they match, a representative excerpt, the
 * cause, candidate groups, history, and what can be done with the group.
 */
export function GroupDetail({ id, groupId, pr, branch }: GroupDetailProps) {
  const { detail, error } = useGroupDetail(groupId);
  const readiness = useReviewReadiness(pr.pullRequest);
  const required = useMemo(
    () => new Set((readiness.result?.checks ?? []).map((check) => check.name)),
    [readiness.result],
  );
  const [picked, setPicked] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mergeTargets, setMergeTargets] = useState<CiGroupSummary[] | null>(null);
  const [fixDraft, setFixDraft] = useState('');
  const [comparing, setComparing] = useState<{ other: string; prompt: string } | null>(null);

  if (error)
    return (
      <div id={id} className="bd-ci-detail bd-ci-group__error">
        {error}
      </div>
    );
  if (!detail)
    return (
      <div id={id} className="bd-ci-detail bd-ci-related__quiet">
        Loading the group…
      </div>
    );

  const { summary } = detail;
  const act = (work: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    void work()
      .catch((err) => setActionError(parseError(err).message))
      .finally(() => setBusy(false));
  };
  const occurrences = detail.occurrences;
  const representative = occurrences[Math.min(picked, occurrences.length - 1)];
  const reasons = matchReasons(detail);
  const hypotheses = hypothesesOf(factsOf(summary, branch));
  const fingerprints = [
    ...new Map(
      occurrences.flatMap((o) =>
        o.signals
          .filter((s) => s.groupId === summary.id)
          .map(
            (s) =>
              [
                s.fingerprint,
                {
                  fingerprint: s.fingerprint,
                  version: s.fingerprintVersion,
                  title: s.signal.testId ?? s.signal.message,
                },
              ] as const,
          ),
      ),
    ).values(),
  ];
  const evidence = representative ? excerptOf(representative, summary.id) : null;
  const evidenceLines = representative
    ? representative.signals
        .filter((s) => s.groupId === summary.id)
        .flatMap((s) => [s.signal.message, ...s.signal.excerpt])
        .slice(0, 30)
    : [];

  const loadMergeTargets = () =>
    act(async () => {
      const snapshot = await store.loadScope([summary.scope]);
      setMergeTargets(snapshot.groups.filter((g) => g.id !== summary.id && g.status !== 'merged'));
    });

  return (
    <div id={id} className="bd-ci-detail" data-ci-detail="">
      <section className="bd-ci-detail__section" aria-label="Occurrences">
        <h4 className="bd-ci-detail__label">Occurrences ({occurrences.length})</h4>
        <table className="bd-ci-detail__table">
          <thead>
            <tr>
              <th>Where</th>
              <th>Job</th>
              <th>Attempt</th>
              <th>Tested</th>
              <th>When</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {occurrences.map((o, index) => {
              const occ = o.occurrence;
              const outdated =
                occ.prNumber === pr.pullRequest.number &&
                pr.pullRequest.headSha &&
                occ.testedSha !== pr.pullRequest.headSha;
              return (
                <tr key={occ.id}>
                  <td>
                    {occ.prNumber !== null ? `#${occ.prNumber}` : branch}
                    {occ.prNumber === pr.pullRequest.number && (
                      <span className="bd-ci-detail__tag">this PR</span>
                    )}
                  </td>
                  <td>
                    {occ.workflowName ? `${occ.workflowName} › ` : ''}
                    {occ.jobName}
                    {occ.prNumber !== null && required.has(occ.jobName) && (
                      <span className="bd-ci-detail__tag">required</span>
                    )}
                  </td>
                  <td>
                    {occ.runAttempt ?? '–'}
                    {o.outcome?.kind === 'passed_on_retry' && (
                      <span className="bd-ci-detail__tag" data-tone="pass">
                        passed on retry
                      </span>
                    )}
                  </td>
                  <td>
                    <code>{shortSha(occ.testedSha)}</code>
                    {outdated && (
                      <span className="bd-ci-detail__tag" data-tone="old">
                        outdated
                      </span>
                    )}
                  </td>
                  <td>{formatAgo(occ.completedAt ?? occ.observedAt)}</td>
                  <td>
                    <button type="button" className="bd-ci-link" onClick={() => setPicked(index)}>
                      Evidence
                    </button>
                    {occ.htmlUrl && (
                      <button
                        type="button"
                        className="bd-ci-link"
                        onClick={() => open(occ.htmlUrl)}
                      >
                        Job
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {occurrences.length > 0 && (
          <span className="bd-ci-related__quiet">
            Earliest failure BorgDock knows of: {formatAgo(summary.firstObservedAt)}. Older ones may
            exist.
          </span>
        )}
      </section>

      {reasons.length > 0 && (
        <section className="bd-ci-detail__section" aria-label="Why these match">
          <h4 className="bd-ci-detail__label">Why these match</h4>
          <ul className="bd-ci-detail__reasons">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>
      )}

      {representative && (
        <section className="bd-ci-detail__section" aria-label="Evidence">
          <h4 className="bd-ci-detail__label">
            Evidence ·{' '}
            {representative.occurrence.prNumber !== null
              ? `#${representative.occurrence.prNumber}`
              : branch}{' '}
            › {representative.occurrence.jobName}
          </h4>
          {representative.occurrence.evidenceReason && (
            <span className="bd-ci-related__quiet">{representative.occurrence.evidenceReason}</span>
          )}
          <pre className="bd-ci-detail__evidence">
            {evidenceLines.join('\n') || evidence || 'No excerpt.'}
          </pre>
        </section>
      )}

      <section className="bd-ci-detail__section" aria-label="Cause">
        <h4 className="bd-ci-detail__label">Cause</h4>
        {hypotheses.map((h) => (
          <span key={h.kind} className="bd-ci-related__quiet">
            Suggested: {HYPOTHESIS_LABEL[h.kind]}. {h.reason}
          </span>
        ))}
        <label className="bd-ci-detail__row">
          Classification
          <select
            value={summary.classification ?? ''}
            disabled={busy}
            onChange={(e) => act(() => setClassification(summary, e.target.value || null))}
          >
            <option value="">Not classified</option>
            {CLASSIFICATIONS.map((kind) => (
              <option key={kind} value={kind}>
                {kind === 'unknown' ? 'Unknown' : HYPOTHESIS_LABEL[kind]}
              </option>
            ))}
          </select>
        </label>
      </section>

      {detail.candidates.length > 0 && (
        <section className="bd-ci-detail__section" aria-label="Possibly related">
          <h4 className="bd-ci-detail__label">Possibly related</h4>
          {detail.candidates.map((candidate) => {
            const verdict = candidate.agentVerdict as { same?: boolean; reason?: string } | null;
            return (
              <div key={candidate.group.id} className="bd-ci-detail__candidate">
                <span>
                  <strong>{candidate.group.title}</strong> · {candidate.reasons.join(', ')}
                </span>
                {verdict && typeof verdict.same === 'boolean' && (
                  <span className="bd-ci-related__quiet">
                    Agent thinks: {verdict.same ? 'same cause' : 'different causes'}.{' '}
                    {verdict.reason}
                  </span>
                )}
                <div className="bd-ci-detail__row">
                  <button
                    type="button"
                    className="bd-ci-link"
                    disabled={busy}
                    onClick={() => act(() => mergeGroups(summary, candidate.group))}
                  >
                    Same cause
                  </button>
                  <button
                    type="button"
                    className="bd-ci-link"
                    disabled={busy}
                    onClick={() => act(() => notRelated(summary, candidate.group))}
                  >
                    Not related
                  </button>
                  <button
                    type="button"
                    className="bd-ci-link bd-ci-link--quiet"
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        const other = await store.loadGroup(candidate.group.id);
                        setComparing({
                          other: candidate.group.id,
                          prompt: comparePrompt(detail, other),
                        });
                      })
                    }
                  >
                    Ask an agent…
                  </button>
                </div>
                {comparing?.other === candidate.group.id && (
                  <div className="bd-ci-detail__section">
                    <span className="bd-ci-related__quiet">
                      This goes to the summary agent (Settings → Summaries):
                    </span>
                    <pre className="bd-ci-detail__evidence">{comparing.prompt}</pre>
                    <div className="bd-ci-detail__row">
                      <button
                        type="button"
                        className="bd-ci-link"
                        disabled={busy}
                        onClick={() =>
                          act(async () => {
                            const verdict = await askAgent(comparing.prompt);
                            const [a, b] =
                              summary.id < candidate.group.id
                                ? [summary.id, candidate.group.id]
                                : [candidate.group.id, summary.id];
                            await store.setCandidateVerdict(a, b, verdict);
                            setComparing(null);
                          })
                        }
                      >
                        Send
                      </button>
                      <button
                        type="button"
                        className="bd-ci-link bd-ci-link--quiet"
                        onClick={() => setComparing(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      <section className="bd-ci-detail__section" aria-label="Fix">
        <h4 className="bd-ci-detail__label">Fix</h4>
        {summary.fixPr ? (
          <div className="bd-ci-detail__row">
            <button type="button" className="bd-ci-link" onClick={() => open(summary.fixPr)}>
              {summary.fixPr.replace(/^https:\/\/github\.com\//, '')}
            </button>
            <span className="bd-ci-related__quiet">
              {summary.fixMergedAt ? `merged ${formatAgo(summary.fixMergedAt)}` : 'not merged yet'}
            </span>
            <button
              type="button"
              className="bd-ci-link bd-ci-link--quiet"
              disabled={busy}
              onClick={() => act(() => setFixPr(summary, null))}
            >
              Unlink
            </button>
          </div>
        ) : (
          <form
            className="bd-ci-detail__row"
            onSubmit={(e) => {
              e.preventDefault();
              const url = fixDraft.trim();
              if (/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(url)) {
                act(() => setFixPr(summary, url));
                setFixDraft('');
              } else {
                setActionError('Paste the fix pull request URL from GitHub.');
              }
            }}
          >
            <input
              aria-label="Fix pull request URL"
              placeholder="https://github.com/owner/repo/pull/123"
              value={fixDraft}
              onChange={(e) => setFixDraft(e.target.value)}
            />
            <button type="submit" className="bd-ci-link" disabled={busy}>
              Link fix
            </button>
          </form>
        )}
      </section>

      <section className="bd-ci-detail__section" aria-label="History">
        <h4 className="bd-ci-detail__label">History</h4>
        <ul className="bd-ci-detail__history">
          <li>
            First failed {formatAgo(summary.firstObservedAt)}, last failed{' '}
            {formatAgo(summary.lastObservedAt)}
          </li>
          {detail.claimEvents.map((event) => (
            <li key={`${event.claimId}:${event.at}:${event.kind}`}>
              {event.kind.replace(/_/g, ' ')} {formatAgo(event.at)}
              {event.detail ? ` · ${event.detail}` : ''}
            </li>
          ))}
          {detail.decisions.map((decision) => (
            <li key={decision.id}>
              {decision.kind === 'must_link' ? 'Merged' : 'Split'} {formatAgo(decision.createdAt)}
              {decision.ambiguous ? ' · needs a look after a rules update' : ''}
            </li>
          ))}
        </ul>
      </section>

      <div className="bd-ci-detail__row">
        {summary.status === 'resolved' ? (
          <button
            type="button"
            className="bd-ci-link"
            disabled={busy}
            onClick={() => act(() => reopenGroup(summary))}
          >
            Reopen
          </button>
        ) : (
          <button
            type="button"
            className="bd-ci-link"
            disabled={busy}
            onClick={() => act(() => resolveGroup(summary))}
          >
            Mark resolved
          </button>
        )}
        {!summary.trackingIssue && (
          <button
            type="button"
            className="bd-ci-link"
            disabled={busy}
            onClick={() => act(() => openSheet({ kind: 'track', groupId: summary.id }))}
          >
            Track on GitHub…
          </button>
        )}
        {mergeTargets === null ? (
          <button
            type="button"
            className="bd-ci-link bd-ci-link--quiet"
            disabled={busy}
            onClick={loadMergeTargets}
          >
            Merge with…
          </button>
        ) : (
          <select
            aria-label="Merge with group"
            defaultValue=""
            disabled={busy}
            onChange={(e) => {
              const other = mergeTargets.find((g) => g.id === e.target.value);
              if (!other) return;
              const keepClaimOf = summary.claim && other.claim ? summary.id : null;
              act(() => mergeGroups(summary, other, keepClaimOf));
            }}
          >
            <option value="" disabled>
              Merge with…
            </option>
            {mergeTargets.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title} ({g.prNumbers.length} PRs)
              </option>
            ))}
          </select>
        )}
        {fingerprints.length > 1 &&
          fingerprints.map((fp) => (
            <button
              key={fp.fingerprint}
              type="button"
              className="bd-ci-link bd-ci-link--quiet"
              disabled={busy}
              title={fp.title}
              onClick={() =>
                act(() =>
                  splitFingerprint(summary, fp.fingerprint, fp.version, fp.title.slice(0, 90)),
                )
              }
            >
              Split out “{fp.title.slice(0, 32)}
              {fp.title.length > 32 ? '…' : ''}”
            </button>
          ))}
      </div>
      {actionError && <div className="bd-ci-group__error">{actionError}</div>}
    </div>
  );
}
