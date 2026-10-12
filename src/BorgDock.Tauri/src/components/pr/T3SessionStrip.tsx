import { invoke } from '@tauri-apps/api/core';
import { useMemo } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { type T3Session, useT3SessionStore } from '@/stores/t3-session-store';
import type { PullRequest } from '@/types';

const EMPTY_SESSIONS: T3Session[] = [];

/** A thread belongs to a pull request it is linked to, or whose branch it works on. */
export function belongsToPr(
  session: Pick<T3Session, 'branch' | 'pullRequestUrls'>,
  pr: PullRequest,
): boolean {
  if (session.branch?.toLowerCase() === pr.headRef.toLowerCase()) return true;
  const url = pr.htmlUrl.toLowerCase();
  return url !== '' && session.pullRequestUrls.some((linked) => linked.toLowerCase() === url);
}

const STATUS_LABEL: Record<string, string> = {
  waitingApproval: 'approval needed',
  waitingInput: 'input needed',
  settled: 'settled',
  running: 'running',
  active: 'active',
};

/** `inline` drops the top margin so the strip can sit inside a PR row's meta line. */
export function T3SessionStrip({ pr, inline }: { pr: PullRequest; inline?: boolean }) {
  const sessions = useT3SessionStore((state) => state.sessions ?? EMPTY_SESSIONS);
  const t3Path = useSettingsStore((state) => state.settings.agents?.t3Path);
  const matching = useMemo(
    () => sessions.filter((session) => belongsToPr(session, pr)),
    [pr, sessions],
  );
  if (matching.length === 0) return null;

  return (
    <div
      className={
        inline ? 'inline-flex items-center gap-1' : 'mt-1.5 flex flex-wrap items-center gap-1'
      }
      data-t3-sessions=""
    >
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-muted)]">
        T3
      </span>
      {matching.slice(0, 3).map((session) => (
        <button
          type="button"
          key={session.threadId}
          title={session.title}
          className="rounded-full border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] px-2 py-0.5 text-[9.5px] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)]"
          onClick={(event) => {
            event.stopPropagation();
            void invoke('t3_show_thread', {
              host: { id: 'local' },
              threadId: session.threadId,
              executable: t3Path,
            }).catch((err) => console.error('t3_show_thread failed', err));
          }}
        >
          {STATUS_LABEL[session.status] ?? session.status}
        </button>
      ))}
    </div>
  );
}
