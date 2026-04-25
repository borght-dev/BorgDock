import clsx from 'clsx';
import { useState } from 'react';
import { Button, Pill } from '@/components/shared/primitives';
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleGroup(group.key)}
              data-review-group={group.key}
              className="w-full justify-start"
              leading={
                <svg
                  width="10"
                  height="10"
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
              }
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: group.color }}
              />
              <span className="flex-1 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                {group.label}
              </span>
              <Pill tone="neutral">{items.length}</Pill>
            </Button>

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
