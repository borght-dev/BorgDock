import { useEffect, useState } from 'react';
import { getPRCommits } from '@/services/github';
import { getClient } from '@/services/github/singleton';
import type { PullRequestCommit } from '@/types';

interface CommitsTabProps {
  prNumber: number;
  repoOwner: string;
  repoName: string;
}

function formatRelativeDate(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function CommitsTab({ prNumber, repoOwner, repoName }: CommitsTabProps) {
  const [commits, setCommits] = useState<PullRequestCommit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const client = getClient();
        if (!client) throw new Error('GitHub client not initialized');
        const result = await getPRCommits(client, repoOwner, repoName, prNumber);
        if (!cancelled) setCommits(result);
      } catch (err) {
        console.error('Failed to load commits:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prNumber, repoOwner, repoName]);

  if (loading) {
    return (
      <div className="space-y-3 p-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-2 animate-pulse">
            <div className="h-4 w-14 rounded bg-[var(--color-surface-raised)]" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-3/4 rounded bg-[var(--color-surface-raised)]" />
              <div className="h-2.5 w-1/3 rounded bg-[var(--color-surface-raised)]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (commits.length === 0) {
    return <p className="p-3 text-xs text-[var(--color-text-muted)]">No commits found.</p>;
  }

  return (
    <div className="divide-y divide-[var(--color-separator)]">
      {commits.map((commit) => (
        <div key={commit.sha} className="flex items-start gap-2.5 px-3 py-2">
          <span className="shrink-0 mt-0.5 rounded bg-[var(--color-code-block-bg)] px-1.5 py-0.5 font-[var(--font-code)] text-[10px] text-[var(--color-text-muted)]">
            {commit.sha.slice(0, 7)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-[var(--color-text-primary)]">
              {commit.message.split('\n')[0]}
            </p>
            <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
              {commit.authorLogin} &middot; {formatRelativeDate(commit.date)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
