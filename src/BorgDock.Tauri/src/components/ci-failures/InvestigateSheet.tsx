import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { LaunchChoiceFields, useLaunchChoice } from '@/components/dispatch/LaunchChoice';
import { Button } from '@/components/shared/primitives';
import { parseScope } from '@/services/ci-failures/identity';
import { AlreadyOwnedError, launchInvestigation } from '@/services/ci-failures/investigate';
import {
  investigationCandidates,
  investigationPrompt,
  PROMPT_LIMIT,
  shortGroupId,
} from '@/services/ci-failures/prompts';
import * as store from '@/services/ci-failures/store-api';
import type { CiGroupDetail } from '@/services/ci-failures/types';
import { useCiBranch } from '@/stores/ci-failures-store';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { showToast } from '@/stores/toast-store';
import { parseError } from '@/utils/parse-error';
import { formatAgo } from '@/utils/relative-time';

/** Occurrences preselected for the first message. */
const PRESELECTED = 5;

interface InvestigateSheetProps {
  groupId: string;
  onClose: () => void;
}

function useGroup(groupId: string) {
  const [detail, setDetail] = useState<CiGroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  return { detail, error };
}

/**
 * InvestigateSheet — one agent for a whole failure group. Pick where it runs in
 * T3 and the model (or a terminal session), pick the evidence the first message carries
 * and read it before it goes out. Launching claims the group first.
 */
export function InvestigateSheet({ groupId, onClose }: InvestigateSheetProps) {
  const { detail, error } = useGroup(groupId);
  const t3Known = useDispatchStore((s) => s.projects.length > 0);
  const defaultProvider = useSettingsStore((s) => s.settings.agents?.defaultProvider ?? 'claude');
  const parts = detail ? parseScope(detail.summary.scope) : null;
  const choice = useLaunchChoice({ repository: parts ? `${parts.owner}/${parts.repo}` : null });
  const [mode, setMode] = useState<'t3' | 'terminal'>(t3Known ? 't3' : 'terminal');
  const candidates = useMemo(() => (detail ? investigationCandidates(detail) : []), [detail]);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [edited, setEdited] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

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

  const chosenIds = picked ?? new Set(candidates.slice(0, PRESELECTED).map((c) => c.occurrence.id));
  const chosen = candidates.filter((c) => chosenIds.has(c.occurrence.id));
  const branch = useCiBranch(detail?.summary.scope ?? null) ?? 'the default branch';
  const prompt =
    edited ??
    (detail && parts
      ? investigationPrompt(detail.summary, chosen, {
          owner: parts.owner,
          repo: parts.repo,
          branch,
          shortId: shortGroupId(detail.summary.id),
        })
      : '');
  const ready = !!detail && chosen.length > 0 && (mode === 'terminal' || choice.ready);

  const toggle = (id: string) => {
    setEdited(null);
    setPicked(() => {
      const next = new Set(chosenIds);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  const start = async (openInT3: boolean) => {
    if (!detail) return;
    setStarting(true);
    setLaunchError(null);
    try {
      await launchInvestigation(
        detail,
        prompt,
        mode === 't3' && choice.target
          ? {
              kind: 't3',
              target: choice.target,
              model: choice.model,
              effort: choice.effort,
              openInT3,
            }
          : { kind: 'terminal', provider: defaultProvider },
      );
      showToast({
        tone: 'success',
        title: 'Investigation started',
        message: `${detail.summary.title}. The group shows it as its owner.`,
      });
      onClose();
    } catch (err) {
      setLaunchError(
        err instanceof AlreadyOwnedError ? err.message : `Not started: ${parseError(err).message}`,
      );
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="bd-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="bd-modal bd-dp-sheet bd-dp-sheet--run"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bd-ci-investigate-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="bd-dp-sheet__head">
          <h2 id="bd-ci-investigate-title">
            Investigate {detail ? `“${detail.summary.title}”` : 'the group'}
          </h2>
          <p className="bd-dp-sheet__lede">
            One agent looks at every PR this failure affects. It may fix the cause in its own pull
            request, never in an affected PR, and never reruns or skips checks.
          </p>
        </header>
        <div className="bd-dp-sheet__body">
          <section aria-label="Evidence" className="bd-dp-sheet__pick">
            <div className="bd-dp-sheet__pickhead">
              <h3 className="bd-dp-sheet__label">
                Evidence · {chosen.length} of {candidates.length}
              </h3>
            </div>
            {error && <p className="bd-ci-dialog__error">{error}</p>}
            <div className="bd-ci-sheet__occurrences">
              {candidates.map((c) => (
                <label key={c.occurrence.id} className="bd-ci-sheet__occurrence">
                  <input
                    type="checkbox"
                    checked={chosenIds.has(c.occurrence.id)}
                    onChange={() => toggle(c.occurrence.id)}
                  />
                  <em>
                    {c.occurrence.prNumber !== null ? `#${c.occurrence.prNumber}` : 'default'}
                  </em>
                  <span>
                    {c.occurrence.jobName} ·{' '}
                    {formatAgo(c.occurrence.completedAt ?? c.occurrence.observedAt)}
                  </span>
                </label>
              ))}
            </div>
          </section>
          <div className="bd-dp-sheet__side">
            <section aria-label="Runs in">
              <h3 className="bd-dp-sheet__label">
                <span>Runs in</span>
              </h3>
              <div className="bd-dp-sheet__days" role="radiogroup" aria-label="Runs in">
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === 't3'}
                  className={clsx('bd-dp-sheet__day', mode === 't3' && 'bd-dp-sheet__day--on')}
                  disabled={!t3Known}
                  onClick={() => setMode('t3')}
                >
                  T3 thread
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === 'terminal'}
                  className={clsx(
                    'bd-dp-sheet__day',
                    mode === 'terminal' && 'bd-dp-sheet__day--on',
                  )}
                  onClick={() => setMode('terminal')}
                >
                  Terminal ({defaultProvider === 'codex' ? 'Codex' : 'Claude'})
                </button>
              </div>
              {!t3Known && (
                <p className="bd-dp-sheet__hint">
                  Pair T3 in Settings → Agents to run it as a thread BorgDock can follow.
                </p>
              )}
              {mode === 'terminal' && (
                <p className="bd-dp-sheet__hint">
                  A terminal session has no status: BorgDock asks you to check in after the lease.
                </p>
              )}
            </section>
            {mode === 't3' && <LaunchChoiceFields choice={choice} />}
            <section aria-label="First message" className="bd-dp-sheet__instructions">
              <h3 className="bd-dp-sheet__label">
                <span>First message</span>
                <span
                  className="bd-ci-sheet__count"
                  data-over={prompt.length > PROMPT_LIMIT || undefined}
                >
                  {prompt.length.toLocaleString()} / {PROMPT_LIMIT.toLocaleString()}
                </span>
              </h3>
              <textarea
                className="bd-dp-sheet__prompt"
                aria-label="First message"
                value={prompt}
                rows={12}
                onChange={(e) => setEdited(e.target.value)}
              />
            </section>
          </div>
        </div>
        <footer className="bd-dp-sheet__foot">
          {launchError && <span className="bd-ci-dialog__error">{launchError}</span>}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          {mode === 't3' && (
            <Button
              variant="secondary"
              size="sm"
              disabled={!ready || starting}
              onClick={() => void start(true)}
            >
              Start and open in T3
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            disabled={!ready || starting}
            onClick={() => void start(false)}
          >
            {starting ? 'Starting…' : 'Start investigation'}
          </Button>
        </footer>
      </div>
    </div>
  );
}
