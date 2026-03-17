import { useState } from 'react';
import clsx from 'clsx';
import type { ClaudeReviewComment, CommentSeverity } from '@/types';
import { ReviewCommentCard } from './ReviewCommentCard';

interface ClaudeReviewPanelProps {
  comments: ClaudeReviewComment[];
}

interface SeverityGroup {
  key: CommentSeverity;
  label: string;
  color: string;
}

const severityGroups: SeverityGroup[] = [
  { key: 'critical', label: 'Critical', color: 'var(--color-status-red)' },
  { key: 'suggestion', label: 'Suggestion', color: 'var(--color-purple)' },
  { key: 'praise', label: 'Praise', color: 'var(--color-status-green)' },
  { key: 'unknown', label: 'Other', color: 'var(--color-status-gray)' },
];

export function ClaudeReviewPanel({ comments }: ClaudeReviewPanelProps) {
  const [collapsed, setCollapsed] = useState<Set<CommentSeverity>>(new Set());

  if (comments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-xs text-[var(--color-text-muted)]">No Claude review comments</p>
      </div>
    );
  }

  const grouped = new Map<CommentSeverity, ClaudeReviewComment[]>();
  for (const comment of comments) {
    const existing = grouped.get(comment.severity);
    if (existing) {
      existing.push(comment);
    } else {
      grouped.set(comment.severity, [comment]);
    }
  }

  const toggleGroup = (key: CommentSeverity) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="space-y-1 p-2">
      {severityGroups.map((group) => {
        const items = grouped.get(group.key);
        if (!items || items.length === 0) return null;
        const isCollapsed = collapsed.has(group.key);

        return (
          <div key={group.key}>
            <button
              onClick={() => toggleGroup(group.key)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--color-surface-hover)] transition-colors"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={clsx(
                  'shrink-0 transition-transform duration-200',
                  isCollapsed ? 'rotate-0' : 'rotate-90',
                )}
              >
                <path d="m6 4 4 4-4 4" />
              </svg>
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: group.color }}
              />
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                {group.label}
              </span>
              <span className="rounded-full bg-[var(--color-filter-chip-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-filter-chip-fg)]">
                {items.length}
              </span>
            </button>

            {!isCollapsed && (
              <div className="space-y-1.5 pl-4 pt-1">
                {items.map((comment) => (
                  <ReviewCommentCard key={comment.id} comment={comment} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
