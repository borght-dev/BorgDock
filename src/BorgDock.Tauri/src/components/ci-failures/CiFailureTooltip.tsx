import { ownerLabel, ownerStatusOf } from '@/services/ci-failures/ownership';
import type { CiGroupSummary } from '@/services/ci-failures/types';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useT3SessionStore } from '@/stores/t3-session-store';
import { formatAgo } from '@/utils/relative-time';

/** Who owns the failure, with how that owner is doing; "No owner" in the warning tone. */
export function OwnerText({ group }: { group: CiGroupSummary }) {
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

export interface CiFailureTooltipProps {
  group: CiGroupSummary;
  /** `warn` for a failure the PR didn't cause, as its marker shows it. */
  tone?: 'bad' | 'warn';
  /** "fails 3 open PRs and main", after the workflow and step. */
  reach?: string;
  /** Why the PR's red checks are not its doing. */
  notCausedBy?: string | null;
  /** What a click on the trigger does; shown with the owner. */
  hint?: string;
}

/**
 * The full text of a shared CI failure whose name is cut off: what failed,
 * where, since when, and for a PR row why it isn't the PR's doing and who
 * owns it. The content of a `HoverPopover` tooltip.
 */
export function CiFailureTooltip({
  group,
  tone = 'bad',
  reach,
  notCausedBy,
  hint,
}: CiFailureTooltipProps) {
  const workflow = group.workflowNames[0];
  const step = group.failedSteps[0];
  return (
    <div className="bd-ci-tip" data-tone={tone}>
      <div className="bd-ci-tip__head">
        <span className="bd-ci-tip__dot" aria-hidden />
        <b>Shared CI failure</b>
        <span className="bd-ci-tip__when">first failed {formatAgo(group.firstObservedAt)}</span>
      </div>
      <p className="bd-ci-tip__title">{group.title}</p>
      {(workflow || reach) && (
        <p className="bd-ci-tip__where">
          {workflow && (
            <>
              In <b>{workflow}</b>
              {step && (
                <>
                  {' › '}
                  <b>{step}</b>
                </>
              )}
            </>
          )}
          {workflow && reach && ' · '}
          {reach}
        </p>
      )}
      {notCausedBy && <p className="bd-ci-tip__cause">Not caused by this PR: {notCausedBy}</p>}
      {hint && (
        <div className="bd-ci-tip__foot">
          <span>{hint}</span>
          <OwnerText group={group} />
        </div>
      )}
    </div>
  );
}
