import { invoke } from '@tauri-apps/api/core';
import { useMemo } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { type T3Session, useT3SessionStore } from '@/stores/t3-session-store';
import type { PullRequest } from '@/types';

const EMPTY_SESSIONS: T3Session[] = [];

function belongsToPr(
  session: { branch?: string; linkedPullRequestJson?: string },
  pr: PullRequest,
): boolean {
  if (session.branch?.toLowerCase() === pr.headRef.toLowerCase()) return true;
  if (!session.linkedPullRequestJson) return false;
  try {
    const linked = JSON.parse(session.linkedPullRequestJson) as Record<string, unknown>;
    return (
      Number(linked.number ?? linked.pullRequestNumber) === pr.number &&
      String(linked.owner ?? linked.repoOwner ?? '').toLowerCase() === pr.repoOwner.toLowerCase() &&
      String(linked.repo ?? linked.repoName ?? '').toLowerCase() === pr.repoName.toLowerCase()
    );
  } catch {
    return false;
  }
}

const STATUS_LABEL: Record<string, string> = {
  waitingApproval: 'approval needed',
  waitingInput: 'input needed',
  settled: 'settled',
  running: 'running',
  active: 'active',
};

export function T3SessionStrip({ pr }: { pr: PullRequest }) {
  const sessions = useT3SessionStore((state) => state.sessions ?? EMPTY_SESSIONS);
  const t3Path = useSettingsStore((state) => state.settings.agents?.t3Path);
  const matching = useMemo(
    () => sessions.filter((session) => belongsToPr(session, pr)),
    [pr, sessions],
  );
  if (matching.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1" data-t3-sessions="">
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
            void invoke('t3_focus_session', {
              workspaceRoot: session.worktreePath || session.workspaceRoot,
              executable: t3Path,
            });
          }}
        >
          {STATUS_LABEL[session.status] ?? session.status}
        </button>
      ))}
    </div>
  );
}
