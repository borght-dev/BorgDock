import { FocusTrap } from 'focus-trap-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/shared/primitives';
import {
  openOwner,
  openSheet,
  ownerMessage,
  recordOverride,
  sendToOwner,
} from '@/services/ci-failures/actions';
import { ownerLabel, ownerStatusOf } from '@/services/ci-failures/ownership';
import { type GuardQuestion, useCiGuardStore } from '@/stores/ci-guard-store';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useT3SessionStore } from '@/stores/t3-session-store';
import { parseError } from '@/utils/parse-error';

/**
 * LaunchGuardDialog — asks before an agent launch on a failure someone
 * already investigates, or one shared with other PRs. Mounted once per
 * window; every launch seam awaits the same question (`guardLaunch`).
 */
export function LaunchGuardDialog() {
  const question = useCiGuardStore((s) => s.question);
  useEffect(() => useCiGuardStore.getState().attachDialog(), []);
  // A new question starts with fresh busy and error state.
  return question ? <GuardQuestionDialog key={questionKey(question)} question={question} /> : null;
}

function questionKey({ conflict, target, action }: GuardQuestion): string {
  return `${conflict.group.id}:${target.owner}/${target.repo}#${target.prNumber}:${action}`;
}

function GuardQuestionDialog({ question }: { question: GuardQuestion }) {
  const answer = useCiGuardStore((s) => s.answer);
  const threads = useDispatchStore((s) => s.threads);
  const sessions = useT3SessionStore((s) => s.sessions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        answer('cancel');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [answer]);

  const { conflict, target, action } = question;
  const { group } = conflict;
  const others = group.prNumbers.filter((n) => n !== target.prNumber).length;
  const where = [
    others > 0 ? `${others} other ${others === 1 ? 'PR' : 'PRs'}` : null,
    group.defaultBranchRuns.length > 0 ? 'the default branch' : null,
  ]
    .filter(Boolean)
    .join(' and ');

  const run = async (work: () => Promise<void>, then: 'proceed' | 'cancel') => {
    setBusy(true);
    setError(null);
    try {
      await work();
      answer(then);
    } catch (err) {
      setError(parseError(err).message);
      setBusy(false);
    }
  };

  const prUrl = `https://github.com/${target.owner}/${target.repo}/pull/${target.prNumber}`;
  const owned = conflict.kind === 'owned' ? conflict : null;
  const status = owned ? ownerStatusOf(owned.claim, { threads, sessions, now: new Date() }) : null;

  return (
    <FocusTrap
      focusTrapOptions={{
        allowOutsideClick: true,
        escapeDeactivates: false,
        tabbableOptions: { displayCheck: 'none' },
      }}
    >
      <div className="bd-ci-dialog-backdrop" role="presentation" onClick={() => answer('cancel')}>
        <div
          className="bd-ci-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bd-ci-guard-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="bd-ci-guard-title">
            {owned ? 'Already being investigated' : 'This failure is shared'}
          </h2>
          <div className="bd-ci-dialog__group">
            <strong>{group.title}</strong>
            {where ? `Also fails in ${where}.` : null}
            {owned && status && (
              <>
                {' '}
                Owner: {ownerLabel(owned.claim)} ({status.label}).
              </>
            )}
          </div>
          <p>
            {owned
              ? 'Open the investigation or send it this PR before you start another agent on the same failure.'
              : `A fix in this branch is probably the wrong move. Investigating the group once covers every PR it affects.`}
          </p>
          {error && <p className="bd-ci-dialog__error">{error}</p>}
          <div className="bd-ci-dialog__actions">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => answer('cancel')}>
              Cancel
            </Button>
            {owned ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        recordOverride(owned.claim, `${action} on #${target.prNumber}`).then(
                          () => undefined,
                        ),
                      'proceed',
                    )
                  }
                >
                  {action} anyway
                </Button>
                {owned.claim.ownerKind === 't3' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          sendToOwner(
                            owned.claim,
                            ownerMessage({ number: target.prNumber, url: prUrl }, null, null),
                          ),
                        'cancel',
                      )
                    }
                  >
                    Send this PR to the owner
                  </Button>
                )}
                {(owned.claim.ownerKind === 't3' || owned.claim.ownerKind === 'github_issue') && (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void run(() => openOwner(owned.claim), 'cancel')}
                  >
                    Open the owner
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => answer('proceed')}
                >
                  {action} in this PR only
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(() => openSheet({ kind: 'investigate', groupId: group.id }), 'cancel')
                  }
                >
                  Investigate the group
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}
