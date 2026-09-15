// src/components/work-items/WorkItemDetailPanel/LinksTab.tsx
import { GitPullRequest } from 'lucide-react';
import type { LinkedPR } from './parseLinkedPRs';

interface Props {
  linkedPRs: LinkedPR[];
}

export function LinksTab({ linkedPRs }: Props) {
  if (linkedPRs.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>No linked items.</div>;
  }
  return (
    <div className="bd-pr-panel">
      {linkedPRs.map((pr) => (
        <div key={pr.id} className="bd-pr-mini-row">
          <GitPullRequest
            size={13}
            strokeWidth={2.25}
            className="shrink-0 text-[var(--color-text-muted)]"
            aria-hidden
          />
          <span className="bd-pr-item__number">#{pr.id}</span>
          {pr.comment && <span className="min-w-0 flex-1 truncate">{pr.comment}</span>}
        </div>
      ))}
    </div>
  );
}
