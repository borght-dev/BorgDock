import { useMemo, useState } from 'react';
import { openSheet, renewClaim, showGroupPrs } from '@/services/ci-failures/actions';
import { parseScope } from '@/services/ci-failures/identity';
import { ownerStatusOf } from '@/services/ci-failures/ownership';
import type { CiGroupSummary } from '@/services/ci-failures/types';
import { isSharedGroup, useCiFailuresStore } from '@/stores/ci-failures-store';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { useT3SessionStore } from '@/stores/t3-session-store';
import { parseError } from '@/utils/parse-error';

/** At most this many groups are named; the rest are counted. */
const SHOWN = 4;

type FocusReason = 'unowned' | 'quiet' | 'fix-merged';

interface FocusGroup {
  group: CiGroupSummary;
  reason: FocusReason;
}

const WHY: Record<FocusReason, string> = {
  unowned: 'No owner',
  quiet: 'Owner quiet',
  'fix-merged': 'Fix merged',
};

/**
 * CiFailuresFocusCard — shared CI failures that need you, at the top of
 * Focus: groups touching your PRs with nobody on them, owners that went
 * quiet, and fixes that merged while PRs are still red. Renders nothing when
 * there are none.
 */
export function CiFailuresFocusCard() {
  const groups = useCiFailuresStore((s) => s.groups);
  const prs = usePrStore((s) => s.pullRequests);
  const username = usePrStore((s) => s.username);
  const threads = useDispatchStore((s) => s.threads);
  const sessions = useT3SessionStore((s) => s.sessions);
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(() => {
    const me = username.toLowerCase();
    const mine = new Set(
      prs
        .filter(
          (pr) => pr.pullRequest.authorLogin.toLowerCase() === me && pr.failedCheckNames.length > 0,
        )
        .map((pr) =>
          `${pr.pullRequest.repoOwner}/${pr.pullRequest.repoName}#${pr.pullRequest.number}`.toLowerCase(),
        ),
    );
    const touchesMine = (group: CiGroupSummary) => {
      const parts = parseScope(group.scope);
      return !!parts && group.prNumbers.some((n) => mine.has(`${parts.owner}/${parts.repo}#${n}`));
    };
    const now = new Date();
    const found: FocusGroup[] = [];
    for (const group of groups) {
      if (group.status !== 'active' || !isSharedGroup(group)) continue;
      if (group.fixMergedAt) found.push({ group, reason: 'fix-merged' });
      else if (group.claim) {
        if (ownerStatusOf(group.claim, { threads, sessions, now }).stale)
          found.push({ group, reason: 'quiet' });
      } else if (touchesMine(group)) found.push({ group, reason: 'unowned' });
    }
    return found.sort((a, b) => b.group.prNumbers.length - a.group.prNumbers.length);
  }, [groups, prs, username, threads, sessions]);

  if (items.length === 0) return null;
  const run = (work: () => Promise<unknown>) => {
    setError(null);
    void work().catch((err) => setError(parseError(err).message));
  };

  return (
    <section className="bd-ci-fcard" aria-label="Shared CI failures">
      <span className="bd-ci-fcard__summary">
        {items.length} shared CI {items.length === 1 ? 'failure needs' : 'failures need'} you
      </span>
      <ul className="bd-ci-fcard__items">
        {items.slice(0, SHOWN).map(({ group, reason }) => (
          <li key={group.id} className="bd-ci-fcard__item">
            <span className="bd-ci-fcard__why">{WHY[reason]}</span>
            <button
              type="button"
              className="bd-ci-link bd-ci-fcard__title"
              title={group.title}
              onClick={() =>
                run(() =>
                  showGroupPrs({
                    groupId: group.id,
                    title: group.title,
                    scope: group.scope,
                    prNumbers: group.prNumbers,
                  }),
                )
              }
            >
              {group.title} · {group.prNumbers.length} PRs
            </button>
            {reason === 'unowned' && (
              <button
                type="button"
                className="bd-ci-link"
                onClick={() => run(() => openSheet({ kind: 'investigate', groupId: group.id }))}
              >
                Investigate…
              </button>
            )}
            {reason === 'quiet' && group.claim && (
              <button
                type="button"
                className="bd-ci-link"
                onClick={() =>
                  run(() => renewClaim(group.claim as NonNullable<CiGroupSummary['claim']>))
                }
              >
                Still on it
              </button>
            )}
            {reason === 'fix-merged' && (
              <button
                type="button"
                className="bd-ci-link"
                onClick={() => run(() => openSheet({ kind: 'rerun', groupId: group.id }))}
              >
                Update affected…
              </button>
            )}
          </li>
        ))}
        {items.length > SHOWN && (
          <li className="bd-ci-fcard__item">and {items.length - SHOWN} more</li>
        )}
      </ul>
      {error && <span className="bd-ci-related__error">{error}</span>}
    </section>
  );
}
