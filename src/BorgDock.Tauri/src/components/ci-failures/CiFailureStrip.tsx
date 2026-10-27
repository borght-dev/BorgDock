import { X } from 'lucide-react';
import { useState } from 'react';
import { useBranchStory } from '@/hooks/useBranchStory';
import { openOwner, openSheet, showGroupPrs } from '@/services/ci-failures/actions';
import { isBlocking, outsideCauseOf, outsideCauseText } from '@/services/ci-failures/lens';
import { ownerLabel, ownerStatusOf } from '@/services/ci-failures/ownership';
import { healModeOf } from '@/services/ci-failures/rerun';
import type { CiGroupSummary } from '@/services/ci-failures/types';
import { useBlockedPrs, useCiBranch, useCiFailuresStore } from '@/stores/ci-failures-store';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { useT3SessionStore } from '@/stores/t3-session-store';
import type { PullRequestWithChecks } from '@/types';
import { parseError } from '@/utils/parse-error';
import { formatAgo } from '@/utils/relative-time';
import { BranchStoryLine } from './BranchStoryLine';

/** Rows shown before "and N more". */
const SHOWN = 3;

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function OwnerText({ group }: { group: CiGroupSummary }) {
  const threads = useDispatchStore((s) => s.threads);
  const sessions = useT3SessionStore((s) => s.sessions);
  if (!group.claim) return <span data-tone="warn">No owner</span>;
  const status = ownerStatusOf(group.claim, { threads, sessions, now: new Date() });
  const label = ownerLabel(group.claim);
  // A claim of yours reports "you" as its status; saying it twice reads like a stutter.
  const detail = status.label.toLowerCase() === label.toLowerCase() ? '' : ` · ${status.label}`;
  return (
    <span data-tone={status.stale ? 'warn' : undefined}>
      Owner {label}
      {detail}
    </span>
  );
}

interface StripRowProps {
  group: CiGroupSummary;
  blocked: readonly PullRequestWithChecks[];
  selected: boolean;
}

function StripRow({ group, blocked, selected }: StripRowProps) {
  const branch = useCiBranch(group.scope) ?? 'the default branch';
  const story = useBranchStory(group);
  const [error, setError] = useState<string | null>(null);
  const cause = outsideCauseOf(group, branch);
  const heal = healModeOf(group, !!story?.recovered, branch);
  const blockedNumbers = blocked.map((pr) => pr.pullRequest.number);
  const onBranch = group.defaultBranchRuns.length > 0;
  const run = (work: () => Promise<unknown>) => {
    setError(null);
    void work().catch((err) => setError(parseError(err).message));
  };
  const show = () =>
    run(() =>
      showGroupPrs({
        groupId: group.id,
        title: group.title,
        scope: group.scope,
        prNumbers: blockedNumbers,
      }),
    );

  return (
    <li className="bd-ci-strip__row" data-group-id={group.id} data-selected={selected || undefined}>
      <div className="bd-ci-strip__head">
        <span className="bd-ci-group__dot" data-tone="shared" aria-hidden />
        <span className="bd-ci-strip__title" title={group.title}>
          {group.title}
        </span>
        <span className="bd-ci-strip__meta">
          Fails {plural(blocked.length, 'open PR')}
          {onBranch ? ` and ${branch}` : ''} · first failed {formatAgo(group.firstObservedAt)}
        </span>
      </div>
      <div className="bd-ci-strip__facts">
        <OwnerText group={group} />
        {cause && <span>Not caused by these PRs: {outsideCauseText(cause, branch)}</span>}
        {story?.recovered && <span data-tone="good">Passing on {story.branch} again</span>}
        {group.fixMergedAt && (
          <span data-tone="good">Fix merged {formatAgo(group.fixMergedAt)}</span>
        )}
      </div>
      {story && <BranchStoryLine group={group} story={story} blockedPrs={blockedNumbers} />}
      <div className="bd-ci-strip__actions">
        {selected ? (
          <button
            type="button"
            className="bd-ci-link"
            onClick={() => usePrStore.getState().setRelatedFailure(null)}
          >
            Show all PRs
          </button>
        ) : (
          <button type="button" className="bd-ci-link" onClick={show}>
            Show {plural(blocked.length, 'PR')}
          </button>
        )}
        {heal && blocked.length > 0 && (
          <button
            type="button"
            className="bd-ci-link"
            data-ci-heal={heal}
            onClick={() => run(() => openSheet({ kind: 'rerun', groupId: group.id }))}
          >
            {heal === 'update'
              ? `Update ${plural(blocked.length, 'PR')}…`
              : `Rerun ${plural(blocked.length, 'PR')}…`}
          </button>
        )}
        {!group.claim ? (
          <button
            type="button"
            className="bd-ci-link"
            onClick={() => run(() => openSheet({ kind: 'investigate', groupId: group.id }))}
          >
            Fix once…
          </button>
        ) : (
          (group.claim.ownerKind === 't3' || group.claim.ownerKind === 'github_issue') && (
            <button
              type="button"
              className="bd-ci-link"
              onClick={() =>
                run(() => openOwner(group.claim as NonNullable<CiGroupSummary['claim']>))
              }
            >
              Open owner
            </button>
          )
        )}
      </div>
      {error && <div className="bd-ci-group__error">{error}</div>}
    </li>
  );
}

/**
 * CiFailureStrip — above the Pull requests list: each shared CI failure that
 * still fails open PRs, as one item with its cause, owner and what to do.
 * Narrowed to one failure (a row marker or "Show PRs"), it shows only that
 * one. Renders nothing when no shared failure blocks a PR.
 */
export function CiFailureStrip() {
  const groups = useCiFailuresStore((s) => s.groups);
  const relatedFailure = usePrStore((s) => s.relatedFailure);
  const blocked = useBlockedPrs();
  const [expanded, setExpanded] = useState(false);

  const blocking = groups
    .filter((group) => isBlocking(group, blocked.get(group.id)?.length ?? 0))
    .sort(
      (a, b) =>
        (blocked.get(b.id)?.length ?? 0) - (blocked.get(a.id)?.length ?? 0) ||
        b.defaultBranchRuns.length - a.defaultBranchRuns.length,
    );

  if (relatedFailure) {
    const group = groups.find((g) => g.id === relatedFailure.groupId);
    if (!group) {
      return (
        <div className="bd-ci-filter" data-related-failure-filter="">
          <span title={relatedFailure.title}>
            Related failure: {relatedFailure.title} · {relatedFailure.prKeys.length} PRs
          </span>
          <button
            type="button"
            aria-label="Show all pull requests again"
            onClick={() => usePrStore.getState().setRelatedFailure(null)}
          >
            <X size={12} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>
      );
    }
    return (
      <section
        className="bd-ci-strip"
        aria-label="Shared CI failure"
        data-ci-strip=""
        data-related-failure-filter=""
      >
        <ul className="bd-ci-strip__rows">
          <StripRow group={group} blocked={blocked.get(group.id) ?? []} selected />
        </ul>
      </section>
    );
  }

  if (blocking.length === 0) return null;
  const shown = expanded ? blocking : blocking.slice(0, SHOWN);
  const total = new Set(
    blocking.flatMap((g) => (blocked.get(g.id) ?? []).map((pr) => pr.pullRequest.htmlUrl)),
  ).size;
  return (
    <section className="bd-ci-strip" aria-label="Shared CI failures" data-ci-strip="">
      <h2 className="bd-ci-strip__heading">
        {blocking.length === 1
          ? `1 shared CI failure blocks ${plural(total, 'PR')}`
          : `${blocking.length} shared CI failures block ${plural(total, 'PR')}`}
      </h2>
      <ul className="bd-ci-strip__rows">
        {shown.map((group) => (
          <StripRow
            key={group.id}
            group={group}
            blocked={blocked.get(group.id) ?? []}
            selected={false}
          />
        ))}
      </ul>
      {blocking.length > SHOWN && (
        <button
          type="button"
          className="bd-ci-link bd-ci-link--quiet bd-ci-strip__more"
          onClick={() => setExpanded((was) => !was)}
        >
          {expanded ? 'Show fewer' : `and ${blocking.length - SHOWN} more`}
        </button>
      )}
    </section>
  );
}
