import clsx from 'clsx';
import type { ParsedError } from '@/types';

interface ParsedErrorCardProps {
  error: ParsedError;
}

function severityStyle(category: string): { bg: string; label: string } {
  const lower = category.toLowerCase();
  if (lower.includes('error') || lower.includes('fail')) {
    return { bg: 'var(--color-check-failed-bg)', label: 'Error' };
  }
  if (lower.includes('warn')) {
    return { bg: 'var(--color-warning-badge-bg)', label: 'Warning' };
  }
  return { bg: 'var(--color-surface-raised)', label: 'Info' };
}

function severityBadgeColor(category: string): { fg: string; bg: string; border: string } {
  const lower = category.toLowerCase();
  if (lower.includes('error') || lower.includes('fail')) {
    return {
      fg: 'var(--color-error-badge-fg)',
      bg: 'var(--color-error-badge-bg)',
      border: 'var(--color-error-badge-border)',
    };
  }
  if (lower.includes('warn')) {
    return {
      fg: 'var(--color-warning-badge-fg)',
      bg: 'var(--color-warning-badge-bg)',
      border: 'var(--color-warning-badge-border)',
    };
  }
  return {
    fg: 'var(--color-neutral-badge-fg)',
    bg: 'var(--color-neutral-badge-bg)',
    border: 'var(--color-neutral-badge-border)',
  };
}

export function ParsedErrorCard({ error }: ParsedErrorCardProps) {
  const severity = severityStyle(error.category);
  const badge = severityBadgeColor(error.category);

  return (
    <div
      className={clsx('rounded-md border p-2.5 space-y-1.5')}
      style={{
        backgroundColor: severity.bg,
        borderColor: badge.border,
      }}
    >
      {/* Header: file path + badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-[var(--font-code)] text-[11px] text-[var(--color-text-secondary)]">
          {error.filePath}
          {error.lineNumber != null && `:${error.lineNumber}`}
          {error.columnNumber != null && `:${error.columnNumber}`}
        </span>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium border"
          style={{ color: badge.fg, backgroundColor: badge.bg, borderColor: badge.border }}
        >
          {severity.label}
        </span>
        {error.isIntroducedByPr && (
          <span className="rounded bg-[var(--color-error-badge-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-error-badge-fg)] border border-[var(--color-error-badge-border)]">
            Introduced by this PR
          </span>
        )}
      </div>

      {/* Error message */}
      <p className="text-xs text-[var(--color-text-primary)]">
        {error.errorCode && (
          <span className="font-[var(--font-code)] text-[var(--color-text-muted)] mr-1">
            {error.errorCode}:
          </span>
        )}
        {error.message}
      </p>
    </div>
  );
}
