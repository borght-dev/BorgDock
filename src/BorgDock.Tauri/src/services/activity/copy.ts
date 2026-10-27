import { type ActivityCategory, DETAIL_LIMIT, SUMMARY_LIMIT } from './types';

export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** A detail keeps its line breaks; only its length is capped. */
export function clipDetail(text: string | null | undefined): string | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;
  return trimmed.length > DETAIL_LIMIT
    ? `${trimmed.slice(0, DETAIL_LIMIT - 1).trimEnd()}…`
    : trimmed;
}

export function summary(text: string): string {
  return clip(text, SUMMARY_LIMIT);
}

export function firstLine(text: string | null | undefined): string {
  return (
    (text ?? '')
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? ''
  );
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

const prLabel = (number: number, title: string) => `#${number} ${title}`;

/** The one sentence each category says. Callers pass what the source knows. */
export const sentence = {
  question: (slot: string, question: string | null, title: string) =>
    summary(question ? `${slot} asks: ${question}` : `${slot} has a question about ${title}`),
  plan: (slot: string, title: string) => summary(`${slot} has a plan for ${title}`),
  approval: (slot: string, title: string) => summary(`${slot} needs approval on ${title}`),
  turn: (slot: string, title: string) => summary(`${slot} finished its turn on ${title}`),
  turnsMissed: (slot: string, count: number, title: string) =>
    summary(`${slot} finished ${plural(count, 'more turn')} on ${title} while you were away`),
  failed: (slot: string, title: string) => summary(`${slot} stopped with an error on ${title}`),
  interrupted: (slot: string, title: string) => summary(`${slot} was interrupted on ${title}`),
  limited: (slot: string, resetAt: string, autoResume: boolean, title: string) => {
    const at = timeOfDay(resetAt);
    return summary(
      autoResume
        ? `${slot} hit a usage limit on ${title}; it resumes at ${at}`
        : `${slot} hit a usage limit on ${title}; resume it after ${at}`,
    );
  },
  report: (signer: string, itemId: number, title: string) =>
    summary(`${signer} reported on ${itemId} ${title}`),
  review: (reviewer: string, state: string, number: number, title: string) => {
    const verb =
      state === 'approved'
        ? 'approved'
        : state === 'changesRequested'
          ? 'requested changes on'
          : 'reviewed';
    return summary(`${reviewer} ${verb} ${prLabel(number, title)}`);
  },
  findings: (count: number, critical: number, number: number, title: string) =>
    summary(
      critical > 0
        ? `Claude found ${plural(critical, 'critical issue')} on ${prLabel(number, title)}`
        : `Claude left ${plural(count, 'finding')} on ${prLabel(number, title)}`,
    ),
  reviewRequest: (author: string, number: number, title: string) =>
    summary(`${author} asks for your review on ${prLabel(number, title)}`),
  checksFailed: (jobs: readonly string[], number: number, title: string) =>
    summary(
      jobs.length === 1
        ? `${jobs[0]} failed on ${prLabel(number, title)}`
        : `${plural(jobs.length, 'check')} failed on ${prLabel(number, title)}`,
    ),
  checksPassed: (number: number, title: string) =>
    summary(`Checks pass again on ${prLabel(number, title)}`),
  ready: (number: number, title: string) => summary(`${prLabel(number, title)} is ready to merge`),
  conflict: (number: number, title: string) =>
    summary(`${prLabel(number, title)} has a merge conflict`),
  merged: (number: number, title: string, by: string | null) =>
    summary(by ? `${by} merged ${prLabel(number, title)}` : `${prLabel(number, title)} was merged`),
  closed: (number: number, title: string) => summary(`${prLabel(number, title)} was closed`),
  ciGroupGrew: (title: string, prs: number) =>
    summary(`${title} now fails on ${plural(prs, 'PR')}, and nobody owns it`),
  ciOwnerStale: (title: string, owner: string | null) =>
    summary(`${owner ?? 'The owner'} went quiet on ${title}`),
  ciFixMerged: (title: string) => summary(`A fix for ${title} was merged`),
  ciSeenAfterFix: (title: string) => summary(`${title} failed again after its fix`),
  ciResolved: (title: string) => summary(`${title} is resolved`),
  workstream: (heading: string, title: string, reason: string) =>
    summary(reason ? `${heading}: ${title}. ${reason}` : `${heading}: ${title}`),
  deployedHead: (number: number, environment: string, state: string) =>
    summary(
      state === 'success'
        ? `#${number} deployed to ${environment}`
        : `#${number} failed to deploy to ${environment}`,
    ),
  reached: (number: number, environment: string) => summary(`#${number} reached ${environment}`),
  deployFailed: (number: number, environment: string) =>
    summary(`The ${environment} deploy carrying #${number} failed`),
  assigned: (itemId: number, title: string, by: string | null) =>
    summary(by ? `${by} assigned ${itemId} ${title} to you` : `${itemId} ${title} is yours now`),
  stateMoved: (itemId: number, title: string, from: string, to: string, by: string | null) =>
    summary(`${by ?? 'Someone'} moved ${itemId} ${title} from ${from} to ${to}`),
  comment: (author: string, itemId: number, title: string) =>
    summary(`${author} commented on ${itemId} ${title}`),
};

/** `14:02`, in the local time zone. */
export function timeOfDay(iso: string): string {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return iso;
  return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** What the summary line calls each category, singular and plural. */
const NOUNS: Partial<Record<ActivityCategory, [string, string]>> = {
  'agent.question': ['question', 'questions'],
  'agent.plan': ['plan to approve', 'plans to approve'],
  'agent.approval': ['approval', 'approvals'],
  'agent.turn': ['turn finished', 'turns finished'],
  'agent.turns-missed': ['catch-up', 'catch-ups'],
  'agent.failed': ['failure', 'failures'],
  'agent.interrupted': ['interruption', 'interruptions'],
  'agent.limited': ['usage limit', 'usage limits'],
  'agent.report': ['report', 'reports'],
  'pr.review': ['review', 'reviews'],
  'pr.findings': ['Claude review', 'Claude reviews'],
  'pr.review-request': ['review request', 'review requests'],
  'pr.checks-failed': ['failing check run', 'failing check runs'],
  'pr.checks-passed': ['recovered check run', 'recovered check runs'],
  'pr.ready': ['PR ready to merge', 'PRs ready to merge'],
  'pr.conflict': ['merge conflict', 'merge conflicts'],
  'pr.merged': ['merge', 'merges'],
  'pr.closed': ['closed PR', 'closed PRs'],
  'ci.group-grew': ['shared CI failure', 'shared CI failures'],
  'ci.owner-stale': ['quiet investigation', 'quiet investigations'],
  'ci.fix-merged': ['CI fix merged', 'CI fixes merged'],
  'ci.seen-after-fix': ['CI failure back', 'CI failures back'],
  'ci.resolved': ['CI failure resolved', 'CI failures resolved'],
  'workstream.unblocked': ['workstream unblocked', 'workstreams unblocked'],
  'workstream.invalidated': ['outcome no longer holds', 'outcomes no longer hold'],
  'workstream.reopened': ['workstream reopened', 'workstreams reopened'],
  'workstream.conflict': ['workstream conflict', 'workstream conflicts'],
  'workstream.proposal': ['agent proposal', 'agent proposals'],
  'workstream.ready': ['workstream ready', 'workstreams ready'],
  'deploy.pr': ['deploy', 'deploys'],
  'deploy.reached': ['release step', 'release steps'],
  'deploy.failed': ['failed deploy', 'failed deploys'],
  'ado.assigned': ['new assignment', 'new assignments'],
  'ado.state': ['state change', 'state changes'],
  'ado.comment': ['comment', 'comments'],
  'activity.rollup': ['older update', 'older updates'],
};

/** Categories that need me first, then the rest by count. */
const NEEDS_YOU_FIRST: ActivityCategory[] = [
  'agent.question',
  'agent.plan',
  'agent.approval',
  'agent.failed',
  'pr.review-request',
  'pr.checks-failed',
  'ci.group-grew',
  'deploy.failed',
];

export function countPhrase(category: ActivityCategory, count: number): string {
  const [one, many] = NOUNS[category] ?? ['update', 'updates'];
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * "Since you last checked: 2 questions, 1 failure, 5 turns finished". At
 * most `limit` phrases; the rest is "and 4 more".
 */
export function summaryLine(
  counts: Partial<Record<ActivityCategory, number>>,
  limit = 4,
  lead = 'Since you last checked',
): string | null {
  const present = (Object.entries(counts) as [ActivityCategory, number][]).filter(
    ([, count]) => count > 0,
  );
  if (present.length === 0) return null;
  present.sort(([a, left], [b, right]) => {
    const rank = (category: ActivityCategory) => {
      const index = NEEDS_YOU_FIRST.indexOf(category);
      return index === -1 ? NEEDS_YOU_FIRST.length : index;
    };
    return rank(a) - rank(b) || right - left;
  });
  const shown = present.slice(0, limit).map(([category, count]) => countPhrase(category, count));
  const rest = present.slice(limit).reduce((sum, [, count]) => sum + count, 0);
  if (rest > 0) shown.push(`${rest} more`);
  return `${lead}: ${shown.join(', ')}`;
}
