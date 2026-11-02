import type { ActivityCategory, ActivityTarget, CiFailureGroup, Focus, Overview, PushData, ThreadSummary, Tone } from '../../../shared/src/api.ts';
import { clip } from './verdict.ts';

/**
 * One fact worth a journal line. `id` is stable for the fact, so the same observation twice adds nothing: it is the
 * dedup key. `push` is what a notification carries when the line is pushed (PushData for answerable questions and
 * suggestions, else an activity push).
 */
export type Draft = {
  id: string;
  category: ActivityCategory;
  title: string;
  detail: string;
  at: string;
  tone: Tone;
  target: ActivityTarget;
  push?: PushData;
};

const MAX_ACTION_OPTIONS = 4;
const firstLine = (text: string | null) => (text ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
const shortTitle = (title: string) => clip(title.replace(/^Horizon \| /, ''), 80);

function threadDrafts(thread: ThreadSummary, itemId: number | null, label: string): Draft[] {
  const target: ActivityTarget = { kind: 'thread', id: thread.id, itemId };
  const at = thread.lastActivityAt;
  const where = itemId ? `${itemId}` : label;
  switch (thread.status) {
    case 'question': {
      if (!thread.questionRequestId) return [];
      const [question] = thread.questions;
      const answerable = itemId !== null && thread.questions.length === 1 && question && !question.multiSelect && question.options.length > 0 && question.options.length <= MAX_ACTION_OPTIONS;
      return [{
        id: `agent:${thread.id}:question:${thread.questionRequestId}`, category: 'agent', tone: 'bad', at, target,
        title: `${where}: the agent asks`, detail: clip(question?.question ?? thread.title, 220),
        push: answerable
          ? { kind: 'question', itemId: itemId!, threadId: thread.id, requestId: thread.questionRequestId, questionId: question.id, options: question.options, recommended: question.recommended, allowCustomAnswer: question.allowCustomAnswer }
          : undefined,
      }];
    }
    case 'plan':
      return [{ id: `agent:${thread.id}:plan:${at}`, category: 'agent', tone: 'bad', at, target, title: `${where}: plan ready to review`, detail: clip(firstLine(thread.lastAgentMessage) || thread.title, 220) }];
    case 'approval':
      return [{ id: `agent:${thread.id}:approval:${at}`, category: 'agent', tone: 'bad', at, target, title: `${where}: the agent needs approval`, detail: shortTitle(thread.title) }];
    case 'failed':
      return [{ id: `agent:${thread.id}:failed:${at}`, category: 'agent', tone: 'bad', at, target, title: `${where}: the agent stopped with an error`, detail: shortTitle(thread.title) }];
    case 'your-turn':
      return [{ id: `agent:${thread.id}:done:${at}`, category: 'agent', tone: 'ok', at, target, title: `${where}: the agent finished`, detail: clip(firstLine(thread.lastAgentMessage) || thread.title, 220) }];
    default:
      return [];
  }
}

/**
 * Dispatch's overview as journal lines: agents that stopped for you, suggested moves, Needs Human, state moves and
 * merged pull requests. Threads count when they belong to an item or were launched from BorgDock (`launched`), so
 * conversations at the desk don't fill the journal.
 */
export function overviewDrafts(overview: Overview, launched: Set<string>, now: string): Draft[] {
  const drafts: Draft[] = [];
  for (const o of overview.items) {
    const { item } = o;
    const itemTarget: ActivityTarget = { kind: 'item', id: item.id };
    const thread = o.threads.find((t) => t.available !== false && t.status !== 'settled' && t.status !== 'running');
    if (thread) drafts.push(...threadDrafts(thread, item.id, item.title));
    if (item.state === 'Needs Human') {
      drafts.push({ id: `human:${item.id}:${item.state}`, category: 'workitem', tone: 'bad', at: now, target: itemTarget, title: `${item.id} needs you`, detail: `${item.state}: ${shortTitle(item.title)}` });
    } else {
      drafts.push({ id: `state:${item.id}:${item.state}`, category: 'workitem', tone: 'mute', at: now, target: itemTarget, title: `${item.id} is now ${item.state}`, detail: shortTitle(item.title) });
    }
    if (o.suggestion?.to) {
      drafts.push({
        id: `drift:${o.suggestion.id}`, category: 'workitem', tone: 'warn', at: now, target: itemTarget,
        title: `${item.id}: move to ${o.suggestion.to}?`, detail: o.suggestion.reason, push: { kind: 'suggestion', itemId: item.id, to: o.suggestion.to },
      });
    }
    if (o.pullRequest?.state === 'merged') {
      drafts.push({ id: `merged:${o.pullRequest.url.toLowerCase()}`, category: 'merge', tone: 'ok', at: now, target: itemTarget, title: `PR ${o.pullRequest.number} merged`, detail: clip(o.pullRequest.title || item.title, 120) });
    }
  }
  for (const t of overview.unlinkedThreads) {
    if (launched.has(t.id) && t.available !== false) drafts.push(...threadDrafts(t, null, clip(t.title, 60)));
  }
  return drafts;
}

/** GitHub's Focus as journal lines: reviews asked of you, verdicts and red checks on yours, new comments, merges. */
export function focusDrafts(focus: Focus): Draft[] {
  const drafts: Draft[] = [];
  for (const pr of focus.pullRequests) {
    const target: ActivityTarget = { kind: 'pr', key: pr.key };
    const name = `${pr.repo}#${pr.number}`;
    const title = clip(pr.title, 120);
    if (pr.state === 'merged') {
      drafts.push({ id: `merged:${pr.url.toLowerCase()}`, category: 'merge', tone: 'ok', at: pr.mergedAt ?? pr.updatedAt, target, title: `${name} merged`, detail: title });
      continue;
    }
    if (pr.state !== 'open') continue;
    if (pr.bucket === 'you' && pr.reason.icon === 'review') {
      drafts.push({ id: `review:${pr.key}:${pr.headSha}`, category: 'review', tone: 'bad', at: pr.updatedAt, target, title: `${name}: ${pr.reason.text}`, detail: title });
    }
    if (pr.isMine && pr.reviewDecision === 'approved') {
      drafts.push({ id: `approved:${pr.key}:${pr.headSha}`, category: 'review', tone: 'ok', at: pr.updatedAt, target, title: `${name} approved`, detail: title });
    }
    if (pr.isMine && pr.reviewDecision === 'changes_requested') {
      drafts.push({ id: `changes:${pr.key}:${pr.headSha}`, category: 'review', tone: 'warn', at: pr.updatedAt, target, title: `${name}: changes requested`, detail: title });
    }
    if (pr.isMine && pr.checks.failed > 0) {
      drafts.push({ id: `ci:${pr.key}:${pr.headSha}`, category: 'ci', tone: 'bad', at: pr.updatedAt, target, title: `${name}: ${pr.checks.failed === 1 ? '1 check failed' : `${pr.checks.failed} checks failed`}`, detail: title });
    }
    if (pr.reason.icon === 'comment') {
      drafts.push({ id: `comment:${pr.key}:${pr.reason.text}`, category: 'comment', tone: 'warn', at: pr.updatedAt, target, title: `${name}: ${pr.reason.text}`, detail: title });
    }
  }
  return drafts;
}

/** A related CI failure group seen for the first time. */
export function ciDrafts(groups: CiFailureGroup[]): Draft[] {
  return groups.map((g) => ({
    id: `cigroup:${g.id}`, category: 'ci', tone: 'bad', at: g.firstFailedAt, target: { kind: 'ci', groupId: g.id },
    title: `New CI failure: ${clip(g.title, 80)}`,
    detail: g.branches.length > 1 ? `Fails on ${g.branches.length} branches` : clip(g.signal.split('\n')[0] ?? '', 160),
  }));
}
