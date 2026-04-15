import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { MergeReadinessChecklist } from '@/components/pr-detail/MergeReadinessChecklist';
import type { PullRequestWithChecks } from '@/types';

export function ExpandedContent({ prWithChecks }: { prWithChecks: PullRequestWithChecks }) {
  const pr = prWithChecks.pullRequest;

  return (
    <div
      className="border-t border-[var(--color-separator)] mt-4 pt-4 space-y-4 -mx-5 -mb-4 px-5 pb-4"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Branch flow */}
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded bg-[var(--color-surface-raised)] px-2 py-0.5 font-mono text-[var(--color-text-primary)]">
          {pr.headRef}
        </span>
        <span className="text-[var(--color-text-muted)]">{'\u2192'}</span>
        <span className="rounded bg-[var(--color-surface-raised)] px-2 py-0.5 font-mono text-[var(--color-text-primary)]">
          {pr.baseRef}
        </span>
      </div>

      {/* Stat chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded bg-[var(--color-surface-raised)] px-2.5 py-1 text-[var(--color-text-secondary)]">
          <strong className="font-medium text-[var(--color-text-primary)]">{pr.commitCount}</strong>{' '}
          commit{pr.commitCount !== 1 ? 's' : ''}
        </span>
        <span className="rounded bg-[var(--color-surface-raised)] px-2.5 py-1">
          <span className="font-medium text-[var(--color-status-green)]">
            +{(pr.additions ?? 0).toLocaleString()}
          </span>
          <span className="text-[var(--color-text-muted)]"> / </span>
          <span className="font-medium text-[var(--color-status-red)]">
            {'\u2212'}
            {(pr.deletions ?? 0).toLocaleString()}
          </span>
        </span>
        <span className="rounded bg-[var(--color-surface-raised)] px-2.5 py-1 text-[var(--color-text-secondary)]">
          <strong className="font-medium text-[var(--color-text-primary)]">
            {pr.changedFiles}
          </strong>{' '}
          file{pr.changedFiles !== 1 ? 's' : ''} changed
        </span>
      </div>

      {/* Merge readiness checklist */}
      <MergeReadinessChecklist pr={prWithChecks} />

      {/* PR body - markdown rendered */}
      {pr.body && (
        <div className="border-t border-[var(--color-separator)] pt-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
            Summary
          </div>
          <div className="markdown-body max-h-[300px] overflow-y-auto text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>
              {pr.body}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
