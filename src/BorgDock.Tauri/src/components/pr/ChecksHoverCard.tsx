import { RotateCcw, TriangleAlert, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import { OwnerText } from '@/components/ci-failures/CiFailureTooltip';
import { ProgressButton } from '@/components/shared/primitives';
import { useClaudeActions } from '@/hooks/useClaudeActions';
import { usePrCiFailures } from '@/hooks/usePrCiFailures';
import { useProgressAction } from '@/hooks/useProgressAction';
import { jobIndexOf, outsideCauseOf, outsideCauseText } from '@/services/ci-failures/lens';
import { ciFailureSettings } from '@/services/ci-failures/settings';
import type { CiGroupSummary, Signal } from '@/services/ci-failures/types';
import { rerunChecks } from '@/services/pr-actions';
import { useCiFailuresStore } from '@/stores/ci-failures-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequestWithChecks } from '@/types';
import { formatAgo } from '@/utils/relative-time';
import { type ChecksCardData, checksCardData, type FailingCheck } from './checks-card-data';

/** Passed and skipped checks named before "+N more". */
const NAMES_SHOWN = 6;
/** Other failures of one check named before "+N more". */
const MORE_SHOWN = 2;

function FailedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="var(--color-status-red)" />
      <path
        d="M5.5 5.5l5 5m0-5l-5 5"
        stroke="var(--color-modal-bg)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Location({ signal }: { signal: Signal }) {
  if (!signal.path) return null;
  return (
    <div className="bd-checks-card__loc">
      {signal.path}
      {signal.line ? `:${signal.line}` : ''}
    </div>
  );
}

/** One failure as the log reader found it: the test, what it said, expected against received, where. */
export function SignalWhy({ signal }: { signal: Signal }) {
  const message =
    signal.errorClass && !signal.message.startsWith(signal.errorClass)
      ? `${signal.errorClass}: ${signal.message}`
      : signal.message;
  const hasDiff = signal.expected !== null || signal.actual !== null;
  if (signal.kind === 'check-output') {
    return (
      <div className="bd-checks-card__why">
        <div className="bd-checks-card__test" style={{ fontFamily: 'var(--font-ui)' }}>
          {signal.message}
        </div>
        {signal.excerpt.slice(0, 3).map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: excerpt lines repeat and never move
          <div key={index} className="bd-checks-card__msg">
            {line}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="bd-checks-card__why">
      {signal.testId && <div className="bd-checks-card__test">{signal.testId}</div>}
      <div className="bd-checks-card__msg">
        {signal.code && <span className="bd-checks-card__code">{signal.code}</span>}
        {message}
      </div>
      {hasDiff && (
        <dl className="bd-checks-card__diff">
          {signal.expected !== null && (
            <>
              <dt>expected</dt>
              <dd data-side="expected">{signal.expected}</dd>
            </>
          )}
          {signal.actual !== null && (
            <>
              <dt>received</dt>
              <dd data-side="actual">{signal.actual}</dd>
            </>
          )}
        </dl>
      )}
      <Location signal={signal} />
    </div>
  );
}

function openInBrowser(url: string) {
  import('@tauri-apps/plugin-opener')
    .then(({ openUrl }) => openUrl(url))
    .catch((err) => console.error('openUrl failed', err));
}

/** Why a check failed when the log says nothing useful (yet). */
function NoReason({ check }: { check: FailingCheck }) {
  if (check.reason === 'reading') {
    return (
      <div className="bd-checks-card__why" data-plain="" aria-busy="true">
        <div className="bd-skeleton-line" style={{ width: '90%' }} />
        <div className="bd-skeleton-line" style={{ width: '64%' }} />
        <div className="bd-skeleton-line" style={{ width: '40%' }} />
      </div>
    );
  }
  const text =
    check.reason === 'off'
      ? 'Related CI failures are off, so BorgDock did not read this log.'
      : (check.reasonText ?? 'Nothing recognisable in the end of the log.');
  return (
    <div className="bd-checks-card__why" data-plain="">
      <div
        className={
          check.reasonText || check.reason === 'off'
            ? 'bd-checks-card__note'
            : 'bd-checks-card__msg'
        }
      >
        {text}
      </div>
      {check.url && (
        <button
          type="button"
          className="bd-hover-card__link bd-checks-card__loc"
          onClick={() => openInBrowser(check.url!)}
        >
          Open job log ↗
        </button>
      )}
    </div>
  );
}

/** The amber line under a failure the PR shares with other PRs or its base branch. */
function SharedLine({ group, baseRef }: { group: CiGroupSummary; baseRef: string }) {
  const cause = outsideCauseOf(group, baseRef);
  const others = group.prNumbers.length - 1;
  const reach = [
    others > 0 ? `also fails ${others} other ${others === 1 ? 'PR' : 'PRs'}` : '',
    group.defaultBranchRuns.length > 0 ? `fails on ${baseRef}` : '',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <div className="bd-checks-card__shared">
      <TriangleAlert size={13} strokeWidth={2} aria-hidden />
      <span>
        <b>{cause ? 'Not caused by this PR.' : 'Shared failure.'}</b>{' '}
        {cause ? outsideCauseText(cause, baseRef) : reach}
        {cause && ` (first ${formatAgo(group.firstObservedAt)})`}{' '}
        <span className="bd-checks-card__shared-sub">
          · <OwnerText group={group} />
        </span>
      </span>
    </div>
  );
}

function FailingRow({
  check,
  shared,
  baseRef,
}: {
  check: FailingCheck;
  shared: CiGroupSummary | undefined;
  baseRef: string;
}) {
  const unnamed = check.more.length - MORE_SHOWN;
  return (
    <div className="bd-checks-card__job" data-check-failing={check.name}>
      <div className="bd-checks-card__line">
        <FailedIcon />
        <span className="bd-checks-card__name">{check.name}</span>
        {check.workflow && <span className="bd-checks-card__wf">{check.workflow}</span>}
        {check.duration && <span className="bd-checks-card__dur">{check.duration}</span>}
      </div>
      {(check.step || check.totals) && (
        <div className="bd-checks-card__step">
          {check.step && (
            <>
              Step <b>{check.step}</b>
            </>
          )}
          {check.step && check.totals && ' · '}
          {check.totals}
        </div>
      )}
      {check.first ? <SignalWhy signal={check.first} /> : <NoReason check={check} />}
      {check.more.length > 0 && (
        <div className="bd-checks-card__more">
          +{check.more.length} more:{' '}
          {check.more.slice(0, MORE_SHOWN).map((name, index) => (
            <span key={name}>
              {index > 0 && ', '}
              <code>{name}</code>
            </span>
          ))}
          {unnamed > 0 && `, and ${unnamed} more`}
        </div>
      )}
      {shared && <SharedLine group={shared} baseRef={baseRef} />}
    </div>
  );
}

function Names({ names, count, kind }: { names: string[]; count: number; kind: 'ok' | 'skip' }) {
  if (names.length === 0) {
    return <p className="bd-checks-card__empty">{count} checks, names not loaded yet.</p>;
  }
  const hidden = Math.max(count, names.length) - NAMES_SHOWN;
  return (
    <ul className="bd-checks-card__names" data-kind={kind}>
      {names.slice(0, NAMES_SHOWN).map((name, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a matrix can repeat a check name
        <li key={`${name}:${index}`}>{name}</li>
      ))}
      {hidden > 0 && <li data-more="">+{hidden} more</li>}
    </ul>
  );
}

const SEGMENTS = ['fail', 'run', 'ok', 'skip'] as const;

interface ChecksCardViewProps {
  pr: PullRequestWithChecks;
  data: ChecksCardData;
  /** Shared groups by job id, for the amber line. */
  sharedOf: (jobId: number) => CiGroupSummary | undefined;
  /** Footer actions; null leaves only the hint. */
  actions: ReactNode;
}

/** The card itself; `ChecksHoverCard` feeds it. */
export function ChecksCardView({ pr, data, sharedOf, actions }: ChecksCardViewProps) {
  const { counts } = data;
  const baseRef = pr.pullRequest.baseRef || 'the base branch';
  const sha = pr.pullRequest.headSha?.slice(0, 7);
  return (
    <div className="bd-checks-card" data-checks-card={pr.pullRequest.number}>
      <div className="bd-checks-card__head">
        <div className="bd-checks-card__head-top">
          <b>Checks</b>
          {sha && (
            <span>
              on <code>{sha}</code>
            </span>
          )}
          {data.finishedAt && (
            <span className="bd-checks-card__ago">last finished {formatAgo(data.finishedAt)}</span>
          )}
        </div>
        <div className="bd-checks-card__bar" aria-hidden="true">
          {SEGMENTS.map((seg) =>
            counts[seg] > 0 ? <i key={seg} data-seg={seg} style={{ flex: counts[seg] }} /> : null,
          )}
        </div>
        <div className="bd-checks-card__counts">
          {counts.fail > 0 && (
            <span data-tone="fail">
              <i data-seg="fail" />
              {counts.fail} failing
            </span>
          )}
          {counts.run > 0 && (
            <span data-tone="run">
              <i data-seg="run" />
              {counts.run} running
            </span>
          )}
          <span>
            <i data-seg="ok" />
            {counts.ok} passed
          </span>
          {counts.skip > 0 && (
            <span>
              <i data-seg="skip" />
              {counts.skip} skipped
            </span>
          )}
        </div>
      </div>

      <div className="bd-hover-card__scroll">
        {data.failing.length > 0 && (
          <section className="bd-checks-card__sec" aria-label="Failing checks">
            <h4 className="bd-checks-card__label">Failing</h4>
            {data.failing.map((check) => (
              <FailingRow
                key={check.key}
                check={check}
                shared={sharedOf(check.jobId)}
                baseRef={baseRef}
              />
            ))}
          </section>
        )}
        {data.running.length > 0 && (
          <section className="bd-checks-card__sec" aria-label="Running checks">
            <h4 className="bd-checks-card__label">Running</h4>
            {data.running.map((name, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a matrix can repeat a check name
              <div key={`${name}:${index}`} className="bd-checks-card__run">
                <span className="bd-checks-card__spin" aria-hidden="true" />
                <span className="bd-checks-card__name">{name}</span>
              </div>
            ))}
          </section>
        )}
        {counts.ok > 0 && (
          <section className="bd-checks-card__sec" aria-label="Passed checks">
            <h4 className="bd-checks-card__label">
              Passed <span>{counts.ok}</span>
            </h4>
            <Names names={data.passed} count={counts.ok} kind="ok" />
          </section>
        )}
        {counts.skip > 0 && (
          <section className="bd-checks-card__sec" aria-label="Skipped checks">
            <h4 className="bd-checks-card__label">
              Skipped <span>{counts.skip}</span>
            </h4>
            <Names names={data.skipped} count={counts.skip} kind="skip" />
          </section>
        )}
      </div>

      <div className="bd-hover-card__foot">
        <span>Click opens Checks</span>
        <span className="bd-hover-card__spacer" />
        {actions}
      </div>
    </div>
  );
}

/** Rerun failed and Fix with the agent, as the PR's context menu runs them. */
function FailureActions({ pr }: { pr: PullRequestWithChecks }) {
  const { fixWithClaude } = useClaudeActions();
  const provider = useSettingsStore((s) => s.settings.agents?.defaultProvider ?? 'claude');
  const p = pr.pullRequest;
  const rerun = useProgressAction(
    () =>
      rerunChecks({ repoOwner: p.repoOwner, repoName: p.repoName, ref: p.headSha || p.headRef }),
    'Failed to re-run checks',
  );
  const fix = useProgressAction(
    () => fixWithClaude(pr, pr.failedCheckNames.length > 0 ? pr.failedCheckNames : ['unknown']),
    `Fix with ${provider === 'codex' ? 'Codex' : 'Claude'} failed`,
  );
  return (
    <>
      <ProgressButton
        variant="secondary"
        size="sm"
        leading={<RotateCcw size={11} strokeWidth={2.25} aria-hidden />}
        state={rerun.state}
        onTrigger={() => void rerun.trigger()}
        label="Rerun failed"
        busyLabel="Rerunning"
        doneLabel="Rerun started"
        data-checks-action="rerun"
      />
      <ProgressButton
        variant="primary"
        size="sm"
        leading={<Wrench size={11} strokeWidth={2.25} aria-hidden />}
        state={fix.state}
        onTrigger={() => void fix.trigger()}
        label={`Fix with ${provider === 'codex' ? 'Codex' : 'Claude'}`}
        busyLabel="Starting"
        doneLabel="Started"
        data-checks-action="fix"
      />
    </>
  );
}

/**
 * The checks of a PR's head commit for the row's hover card. Mounts only
 * while the card is open, so the CI failure store is read for PRs someone
 * hovers.
 */
export function ChecksHoverCard({ pr }: { pr: PullRequestWithChecks }) {
  const p = pr.pullRequest;
  const failures = usePrCiFailures(p.repoOwner, p.repoName, p.number);
  const collecting = useSettingsStore((s) => ciFailureSettings(s.settings).enabled);
  const groups = useCiFailuresStore((s) => s.groups);
  const data = checksCardData(pr, failures.data, collecting);
  const index = jobIndexOf(groups);
  return (
    <ChecksCardView
      pr={pr}
      data={data}
      sharedOf={(jobId) => (jobId > 0 ? index.get(jobId)?.[0] : undefined)}
      actions={data.failing.length > 0 ? <FailureActions pr={pr} /> : null}
    />
  );
}
