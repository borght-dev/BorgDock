import { FocusTrap } from 'focus-trap-react';
import { useEffect, useState } from 'react';
import { LaunchTargetFields, useLaunchTarget } from '@/components/dispatch/LaunchTarget';
import { Button } from '@/components/shared/primitives';
import { openPrThread, type PrThreadStart } from '@/services/t3-thread';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useT3ThreadStore } from '@/stores/t3-thread-store';
import type { PullRequest } from '@/types';
import { parseError } from '@/utils/parse-error';

function dismiss() {
  useT3ThreadStore.getState().setPendingPr(null);
}

/**
 * "Open a new thread in T3", or Fix / Resolve / Monitor when T3 is the agent
 * provider: pick the environment and where the thread works, a checkout of
 * the pull request's branch or an earlier thread's. Mounted in the main
 * window; other windows ask it through `requestT3Thread`.
 */
export function T3PrThreadDialog() {
  const pr = useT3ThreadStore((s) => s.pendingPr);
  const start = useT3ThreadStore((s) => s.pendingStart);
  if (!pr) return null;
  return <PrThreadSheet key={pr.htmlUrl} pr={pr} start={start} />;
}

function PrThreadSheet({ pr, start }: { pr: PullRequest; start: PrThreadStart | null }) {
  const threads = useDispatchStore((s) => s.threads);
  const onBranch = threads
    .filter((t) => t.branch === pr.headRef || t.pullRequests.some((p) => p.url === pr.htmlUrl))
    .map((t) => t.id);
  const place = useLaunchTarget({
    repository: `${pr.repoOwner}/${pr.repoName}`,
    pullRequestBranch: pr.headRef,
    threadIds: onBranch,
  });
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { target } = place;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        dismiss();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  const open = async () => {
    if (!target) return;
    setOpening(true);
    setError(null);
    try {
      await openPrThread(pr, target, start ?? undefined);
      dismiss();
    } catch (err) {
      setError(`Not opened: ${parseError(err).message}`);
    } finally {
      setOpening(false);
    }
  };

  return (
    <FocusTrap
      focusTrapOptions={{
        allowOutsideClick: true,
        escapeDeactivates: false,
        tabbableOptions: { displayCheck: 'none' },
      }}
    >
      <div data-t3-pr-thread-dialog="">
        <button
          type="button"
          aria-label="Close"
          className="fixed inset-0 z-50 bg-[var(--color-overlay-bg)]"
          onClick={dismiss}
        />
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bd-pr-thread-title"
            className="bd-modal bd-dp-sheet bd-lt-dialog pointer-events-auto"
          >
            <header className="bd-dp-sheet__head">
              <h2 id="bd-pr-thread-title">
                {start
                  ? `${start.intent} on PR #${pr.number} in T3`
                  : `Open PR #${pr.number} in T3`}
              </h2>
              <p>{pr.title}</p>
            </header>
            <div className="bd-dp-sheet__body">
              <LaunchTargetFields
                choice={place}
                ownThreadIds={onBranch}
                continueLabel={start ? 'Continue it' : 'Open it'}
              />
            </div>
            <footer className="bd-dp-sheet__foot">
              {error && <span className="bd-ci-dialog__error">{error}</span>}
              <Button variant="ghost" size="md" onClick={dismiss}>
                Cancel
              </Button>
              <span className="bd-dp-sheet__spacer" />
              <Button
                variant="primary"
                size="md"
                autoFocus
                disabled={!target}
                loading={opening}
                onClick={() => void open()}
              >
                {start ? 'Start thread' : 'Open in T3'}
              </Button>
            </footer>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}
