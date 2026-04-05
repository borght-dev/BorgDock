import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { PullRequestWithChecks } from '@/types';

interface QuickReviewCardProps {
  pr: PullRequestWithChecks;
}

export function QuickReviewCard({ pr }: QuickReviewCardProps) {
  const p = pr.pullRequest;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[var(--color-text-primary)] leading-snug">
            {p.title}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
            <span className="font-mono">{p.repoOwner}/{p.repoName}</span>
            <span>#{p.number}</span>
            <span>by {p.authorLogin}</span>
          </div>
        </div>
        <span className="font-mono text-xs text-[var(--color-text-muted)] shrink-0">
          #{p.number}
        </span>
      </div>

      {/* Branch flow */}
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded bg-[var(--color-surface-raised)] px-2 py-0.5 font-mono text-[var(--color-text-secondary)]">
          {p.headRef}
        </span>
        <span className="text-[var(--color-text-muted)]">{'\u2192'}</span>
        <span className="rounded bg-[var(--color-surface-raised)] px-2 py-0.5 font-mono text-[var(--color-text-secondary)]">
          {p.baseRef}
        </span>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-[var(--color-text-muted)]">
        <span className="text-[var(--color-status-green)]">+{p.additions}</span>
        <span className="text-[var(--color-status-red)]">-{p.deletions}</span>
        <span>{p.changedFiles} file{p.changedFiles !== 1 ? 's' : ''}</span>
        <span>{p.commitCount} commit{p.commitCount !== 1 ? 's' : ''}</span>
      </div>

      {/* Labels */}
      {p.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {p.labels.map((l) => (
            <span
              key={l}
              className="rounded-full bg-[var(--color-surface-raised)] px-2 py-0.5 text-[10px] text-[var(--color-text-secondary)]"
            >
              {l}
            </span>
          ))}
        </div>
      )}

      {/* Body */}
      {p.body && (
        <div className="rounded-lg border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] p-3 max-h-[200px] overflow-y-auto">
          <div className="markdown-body text-xs text-[var(--color-text-secondary)]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.body}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
