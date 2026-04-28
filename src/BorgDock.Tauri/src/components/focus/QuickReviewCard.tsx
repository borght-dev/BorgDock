import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { Card, Pill } from '@/components/shared/primitives';
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
          <div
            data-pr-title=""
            className="text-sm font-semibold text-[var(--color-text-primary)] leading-snug"
          >
            {p.title}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
            <span className="font-mono">
              {p.repoOwner}/{p.repoName}
            </span>
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
        <Pill tone="neutral">{p.headRef}</Pill>
        <span className="text-[var(--color-text-muted)]">{'\u2192'}</span>
        <Pill tone="neutral">{p.baseRef}</Pill>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-[var(--color-text-muted)]">
        <span className="text-[var(--color-status-green)]">+{p.additions}</span>
        <span className="text-[var(--color-status-red)]">-{p.deletions}</span>
        <span>
          {p.changedFiles} file{p.changedFiles !== 1 ? 's' : ''}
        </span>
        <span>
          {p.commitCount} commit{p.commitCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Labels */}
      {p.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {p.labels.map((l) => (
            <Pill key={l} tone="neutral">
              {l}
            </Pill>
          ))}
        </div>
      )}

      {/* Body */}
      {p.body && (
        <Card padding="sm" className="max-h-[200px] overflow-y-auto">
          <div className="markdown-body text-xs text-[var(--color-text-secondary)]">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>
              {p.body}
            </ReactMarkdown>
          </div>
        </Card>
      )}
    </div>
  );
}
