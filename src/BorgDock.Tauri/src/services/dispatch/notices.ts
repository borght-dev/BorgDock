import type { ItemOverview, Overview } from './types';

/** Something in the overview worth telling the user about once. */
export interface Notice {
  /** Same key, same notification: it is sent once. */
  key: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  title: string;
  body: string;
  itemId: number;
  /** The one thing the notification can do in place, e.g. answer with the recommended option. */
  action: { id: string; label: string } | null;
}

/** A question with more options than this is answered in the app, not from a notification. */
const MAX_ANSWERABLE_OPTIONS = 4;
const TITLE_LIMIT = 80;
const BODY_LIMIT = 220;

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function firstLine(text: string | null): string {
  return (
    (text ?? '')
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? ''
  );
}

function noticesForItem(overview: ItemOverview): Notice[] {
  const { item, suggestion } = overview;
  const notices: Notice[] = [];
  const shortTitle = clip(item.title, TITLE_LIMIT);
  const base = { itemId: item.id };

  if (overview.bay === 'waiting' && overview.waitingFor?.startsWith('ADO says')) {
    notices.push({
      ...base,
      key: `human:${item.id}:${item.state}`,
      severity: 'warning',
      title: `${item.id} needs you`,
      body: `${item.state}: ${shortTitle}`,
      action: null,
    });
  }

  const thread = overview.threads.find(
    (t) => t.available && t.status !== 'settled' && t.status !== 'running',
  );
  if (overview.bay === 'waiting' && thread) {
    const at = thread.lastActivityAt;
    if (thread.status === 'question' && thread.questionRequestId) {
      const [question] = thread.questions;
      const recommended =
        thread.questions.length === 1 &&
        question &&
        !question.multiSelect &&
        question.recommended !== null &&
        question.options.length <= MAX_ANSWERABLE_OPTIONS
          ? question.options[question.recommended]
          : undefined;
      notices.push({
        ...base,
        key: `question:${thread.id}:${thread.questionRequestId}`,
        severity: 'warning',
        title: `${thread.slot} asks about ${item.id}`,
        body: clip(question?.question ?? shortTitle, BODY_LIMIT),
        action: recommended ? { id: 'answer-recommended', label: recommended.label } : null,
      });
    } else if (thread.status === 'plan') {
      notices.push({
        ...base,
        key: `plan:${thread.id}:${at}`,
        severity: 'warning',
        title: `${thread.slot} has a plan for ${item.id}`,
        body: clip(firstLine(thread.lastAgentMessage) || shortTitle, BODY_LIMIT),
        action: { id: 'approve-plan', label: 'Approve plan' },
      });
    } else if (thread.status === 'approval') {
      notices.push({
        ...base,
        key: `approval:${thread.id}:${at}`,
        severity: 'warning',
        title: `${thread.slot} needs approval for ${item.id}`,
        body: shortTitle,
        action: null,
      });
    } else if (thread.status === 'failed') {
      notices.push({
        ...base,
        key: `failed:${thread.id}:${at}`,
        severity: 'error',
        title: `${thread.slot} stopped with an error on ${item.id}`,
        body: clip(firstLine(thread.lastAgentMessage) || shortTitle, BODY_LIMIT),
        action: null,
      });
    } else if (thread.status === 'your-turn') {
      notices.push({
        ...base,
        key: `turn:${thread.id}:${at}`,
        severity: 'success',
        title: `${thread.slot} finished its turn on ${item.id}`,
        body: clip(firstLine(thread.lastAgentMessage) || shortTitle, BODY_LIMIT),
        action: null,
      });
    }
  }

  if (suggestion?.to) {
    notices.push({
      ...base,
      key: `drift:${suggestion.id}`,
      severity: 'info',
      title: `${item.id}: move to ${suggestion.to}?`,
      body: suggestion.reason,
      action: { id: 'move', label: `Move to ${suggestion.to}` },
    });
  }
  return notices;
}

/** Everything in the overview that is worth a notification right now. */
export function noticesFor(overview: Overview): Notice[] {
  return overview.items.flatMap(noticesForItem);
}
