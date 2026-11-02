import type { NotificationPreferences, Overview, PushData } from '../../../shared/src/api.ts';

export type Notice = {
  /** Same key, same notification: it is sent once. */
  key: string;
  preference: keyof NotificationPreferences;
  title: string;
  body: string;
  /** Groups notifications per work item on the lock screen. */
  group: string;
  data: PushData;
};

const MAX_ACTION_OPTIONS = 4;
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const firstLine = (text: string | null) => (text ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';

/** Everything in the overview that is worth a notification right now. The notifier drops keys it already sent. */
export function noticesFor(overview: Overview): Notice[] {
  const notices: Notice[] = [];
  for (const o of overview.items) {
    const { item } = o;
    const group = `item-${item.id}`;
    const shortTitle = clip(item.title.replace(/^Horizon \| /, ''), 80);

    if (o.bay === 'waiting' && o.waitingFor?.startsWith('ADO says')) {
      notices.push({ key: `human:${item.id}:${item.state}`, preference: 'waiting', group, title: `${item.id} needs you`, body: `${item.state}: ${shortTitle}`, data: { kind: 'waiting', itemId: item.id } });
    }

    const thread = o.threads.find((t) => t.available !== false && t.status !== 'settled' && t.status !== 'running');
    if (o.bay === 'waiting' && thread) {
      const at = thread.lastActivityAt;
      if (thread.status === 'question' && thread.questionRequestId) {
        const [question] = thread.questions;
        const answerable = thread.questions.length === 1 && question && !question.multiSelect && question.options.length > 0 && question.options.length <= MAX_ACTION_OPTIONS;
        notices.push({
          key: `question:${thread.id}:${thread.questionRequestId}`,
          preference: 'waiting',
          group,
          title: `${item.id}: the agent asks`,
          body: clip(question?.question ?? shortTitle, 220),
          data: answerable
            ? {
              kind: 'question', itemId: item.id, threadId: thread.id, requestId: thread.questionRequestId, questionId: question.id, options: question.options,
              recommended: question.recommended, allowCustomAnswer: question.allowCustomAnswer,
              // For the notification's content extension: the full question and "AB#61044 · Offline basket · mac-mini".
              question: question.question, context: [`AB#${item.id}`, shortTitle, thread.environmentLabel].filter(Boolean).join(' · '),
            }
            : { kind: 'waiting', itemId: item.id },
        });
      } else if (thread.status === 'plan' || thread.status === 'approval' || thread.status === 'failed') {
        const title = { plan: 'plan ready to review', approval: 'the agent needs approval', failed: 'the agent stopped with an error' }[thread.status];
        notices.push({ key: `${thread.status}:${thread.id}:${at}`, preference: 'waiting', group, title: `${item.id}: ${title}`, body: shortTitle, data: { kind: 'waiting', itemId: item.id } });
      } else if (thread.status === 'your-turn') {
        notices.push({
          key: `turn:${thread.id}:${at}`,
          preference: 'finished',
          group,
          title: `${item.id}: the agent finished`,
          body: clip(firstLine(thread.lastAgentMessage) || shortTitle, 220),
          data: { kind: 'finished', itemId: item.id, threadId: thread.id },
        });
      }
    }

    if (o.suggestion?.to) {
      notices.push({
        key: `drift:${o.suggestion.id}`,
        preference: 'drift',
        group,
        title: `${item.id}: move to ${o.suggestion.to}?`,
        body: o.suggestion.reason,
        data: { kind: 'suggestion', itemId: item.id, to: o.suggestion.to },
      });
    }
  }
  return notices;
}
