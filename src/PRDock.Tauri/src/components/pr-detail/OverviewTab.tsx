import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { PullRequestWithChecks } from '@/types';

interface OverviewTabProps {
  pr: PullRequestWithChecks;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function handleOpenInBrowser(url: string) {
  import('@tauri-apps/plugin-opener').then(({ openUrl }) => {
    openUrl(url).catch(console.error);
  }).catch(() => {
    window.open(url, '_blank');
  });
}

function handleCopyBranch(branch: string) {
  import('@tauri-apps/plugin-clipboard-manager').then(({ writeText }) => {
    writeText(branch).catch(console.error);
  }).catch(() => {
    navigator.clipboard.writeText(branch).catch(console.error);
  });
}

export function OverviewTab({ pr }: OverviewTabProps) {
  const p = pr.pullRequest;

  return (
    <div className="p-3 space-y-4">
      {/* Metadata */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-tertiary)]">
        <span>
          by <strong className="text-[var(--color-text-secondary)]">{p.authorLogin}</strong>
        </span>
        <span>{formatDate(p.createdAt)}</span>
        <div className="flex items-center gap-1">
          <span className="rounded border border-[var(--color-branch-badge-border)] bg-[var(--color-branch-badge-bg)] px-1.5 py-0.5 font-mono text-[10px]">
            {p.headRef}
          </span>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="m5 8 6 0M9 5l3 3-3 3" />
          </svg>
          <span className="rounded border border-[var(--color-target-badge-border)] bg-[var(--color-target-badge-bg)] px-1.5 py-0.5 font-mono text-[10px]">
            {p.baseRef}
          </span>
        </div>
      </div>

      {/* Merge status */}
      <div className="flex items-center gap-2">
        {p.mergeable === false ? (
          <span className="rounded bg-[var(--color-error-badge-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-error-badge-fg)] border border-[var(--color-error-badge-border)]">
            Merge Conflicts
          </span>
        ) : p.mergeable === true ? (
          <span className="rounded bg-[var(--color-success-badge-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-success-badge-fg)] border border-[var(--color-success-badge-border)]">
            Mergeable
          </span>
        ) : null}
        {p.isDraft && (
          <span className="rounded bg-[var(--color-draft-badge-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-draft-badge-fg)] border border-[var(--color-draft-badge-border)]">
            Draft
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => handleOpenInBrowser(p.htmlUrl)}
          className="rounded-md border border-[var(--color-subtle-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-action-secondary-fg)] hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          Open in Browser
        </button>
        <button
          onClick={() => handleCopyBranch(p.headRef)}
          className="rounded-md border border-[var(--color-subtle-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          Copy Branch
        </button>
      </div>

      {/* Description */}
      {p.body && (
        <div className="prose prose-sm max-w-none text-xs text-[var(--color-text-secondary)] [&_a]:text-[var(--color-accent)] [&_code]:bg-[var(--color-code-block-bg)] [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[10px] [&_code]:font-[var(--font-code)] [&_pre]:bg-[var(--color-code-block-bg)] [&_pre]:rounded-md [&_pre]:p-2">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.body}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
