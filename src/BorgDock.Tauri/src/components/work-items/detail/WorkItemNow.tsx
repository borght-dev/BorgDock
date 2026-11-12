import { AlertTriangle, ArrowRight, Check, GitPullRequest } from 'lucide-react';
import { dispatchActions } from '@/services/dispatch/actions';
import { NEEDS_YOU, THREAD_STATUS_LABEL } from '@/services/dispatch/types';
import { showPr } from '@/services/navigation';
import { checksTone, type ItemContext, type ItemPull } from './useItemContext';

const ICON = { size: 12, strokeWidth: 2, 'aria-hidden': true } as const;

export function openUrl(url: string) {
  import('@tauri-apps/plugin-opener')
    .then(({ openUrl: open }) => open(url))
    .catch((err) => console.error('openUrl failed', err));
}

export function openPull(pull: ItemPull) {
  if (pull.owner && pull.repo) {
    void showPr({ owner: pull.owner, repo: pull.repo, number: pull.number, keepSection: true });
  } else if (pull.url) {
    openUrl(pull.url);
  }
}

/** The next step the evidence asks for: a fix on the pull request, else Dispatch's verdict. */
export function nextStep(context: ItemContext): string | null {
  const pull = context.pulls.find((p) => p.state === 'open');
  if (pull?.conflicts) return `resolve the conflicts on #${pull.number}`;
  if (pull && (pull.checks?.failed ?? 0) > 0) return `fix the failing checks on #${pull.number}`;
  const verdict = context.overview?.verdict;
  if (verdict && verdict.tone !== 'mute') return verdict.label.toLowerCase();
  return null;
}

/**
 * The work item's "now": its pull request with checks and conflicts, the T3
 * thread working on it, and the next step. Nothing when BorgDock knows of none.
 */
export function WorkItemNow({ context }: { context: ItemContext }) {
  const pull = context.pulls.find((p) => p.state === 'open') ?? context.pulls[0] ?? null;
  const thread = context.thread?.open ? context.thread : null;
  const next = nextStep(context);
  if (!pull && !thread && !next) return null;
  const checks = pull ? checksTone(pull) : null;
  const waiting = thread ? NEEDS_YOU.includes(thread.status) : false;

  return (
    <div className="bd-wid-now" data-wid-now="">
      <span className="bd-wid-now__label">Now</span>
      {pull && (
        <button
          type="button"
          className="bd-wid-chip"
          onClick={() => openPull(pull)}
          title={`#${pull.number} ${pull.title}`}
        >
          <GitPullRequest
            {...ICON}
            style={{
              color:
                pull.state === 'merged'
                  ? 'var(--color-status-merged)'
                  : pull.state === 'closed'
                    ? 'var(--color-text-tertiary)'
                    : 'var(--color-status-green)',
            }}
          />
          <span className="bd-wid-chip__num">#{pull.number}</span>
          <span className="bd-wid-chip__text">{pull.title}</span>
          {pull.state === 'open' && checks && (
            <>
              <span className="bd-wid-chip__sep" />
              <span className="bd-wid-tone" data-tone={checks.tone}>
                {checks.tone === 'ok' && <Check {...ICON} />}
                {checks.label}
              </span>
            </>
          )}
          {pull.state !== 'open' && (
            <>
              <span className="bd-wid-chip__sep" />
              <span className="bd-wid-tone" data-tone="mute">
                {pull.state}
              </span>
            </>
          )}
          {pull.conflicts && (
            <>
              <span className="bd-wid-chip__sep" />
              <span className="bd-wid-tone" data-tone="warn">
                <AlertTriangle {...ICON} />
                Conflicts
              </span>
            </>
          )}
        </button>
      )}
      {thread && (
        <button
          type="button"
          className="bd-wid-chip"
          onClick={() => dispatchActions.openInT3(thread)}
          title={`Open ${thread.title} in T3`}
        >
          <span className="bd-wid-chip__tag">T3</span>
          <span className="bd-wid-chip__text" style={{ maxWidth: 200 }}>
            {thread.title || thread.place}
          </span>
          <span className="bd-wid-chip__sep" />
          <span
            className="bd-wid-tone"
            data-tone={waiting ? 'warn' : thread.status === 'running' ? 'ok' : 'mute'}
            style={{ fontWeight: 500 }}
          >
            {THREAD_STATUS_LABEL[thread.status]}
          </span>
        </button>
      )}
      {next && (
        <span className="bd-wid-next">
          <span>
            Next: <b>{next}</b>
          </span>
          <ArrowRight {...ICON} />
        </span>
      )}
    </div>
  );
}
