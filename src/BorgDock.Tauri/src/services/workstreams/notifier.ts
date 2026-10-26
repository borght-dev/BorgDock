import { sendOsNotification } from '@/services/notification';
import type { Assessment, Attention } from './attention';
import type { WorkstreamDocument } from './types';

/** Toast action that opens a workstream. Its `url` carries the workstream id. */
export const SHOW_WORKSTREAM_ACTION = 'workstream-show';
/** The flyout asks the main window to open a workstream: `{ id }`. */
export const SHOW_WORKSTREAM_EVENT = 'workstreams-show';

/** Attention worth a notification: it changed, and it changes what you do next. */
const NOTIFY = /^(unblocked|invalidated|reopened|conflict|proposal|ready)(:|$)/;

const TITLE: Record<string, string> = {
  unblocked: 'Unblocked',
  invalidated: 'No longer holds',
  reopened: 'Completed workstream changed',
  conflict: 'Changed on another machine',
  proposal: 'Agent proposals',
  ready: 'Ready to complete',
};

/** Keys sent, or seen while quiet, this session. */
const sent = new Set<string>();

/** Forget what was sent (tests). */
export function resetWorkstreamNotifier(): void {
  sent.clear();
}

export interface WorkstreamNotice {
  key: string;
  workstreamId: string;
  title: string;
  body: string;
  severity: 'info' | 'success' | 'warning' | 'error';
}

function noticeOf(document: WorkstreamDocument, entry: Attention): WorkstreamNotice {
  const kind = entry.id.split(':')[0]!;
  return {
    key: `${document.id}:${entry.id}`,
    workstreamId: document.id,
    title: `${TITLE[kind] ?? 'Workstream'}: ${document.title}`,
    body: entry.reason,
    severity: entry.tone === 'bad' ? 'warning' : entry.tone === 'ok' ? 'success' : 'info',
  };
}

/** The notices the assessments hold now. */
export function workstreamNotices(
  documents: readonly WorkstreamDocument[],
  assessments: Readonly<Record<string, Assessment>>,
): WorkstreamNotice[] {
  return documents.flatMap((document) =>
    (assessments[document.id]?.attention ?? [])
      .filter((entry) => NOTIFY.test(entry.id))
      .map((entry) => noticeOf(document, entry)),
  );
}

/**
 * Notify about what is new. While `quiet` (before every source has been
 * read once, and on the first pass after loading) it only records what is
 * already true, so starting BorgDock or a host coming back sends nothing
 * about things that were true before.
 */
export function notifyWorkstreams(
  notices: readonly WorkstreamNotice[],
  quiet: boolean,
  enabled: boolean,
): void {
  for (const notice of notices) {
    if (sent.has(notice.key)) continue;
    sent.add(notice.key);
    if (quiet || !enabled) continue;
    void sendOsNotification({
      id: `workstream:${notice.key}`,
      severity: notice.severity,
      title: notice.title,
      body: notice.body,
      actions: [{ label: 'Open', action: SHOW_WORKSTREAM_ACTION, url: notice.workstreamId }],
    }).catch(() => {});
  }
}
