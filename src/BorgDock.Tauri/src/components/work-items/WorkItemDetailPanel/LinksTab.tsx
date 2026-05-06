// src/components/work-items/WorkItemDetailPanel/LinksTab.tsx
import type { LinkedPR } from './parseLinkedPRs';

interface Props {
  linkedPRs: LinkedPR[];
}

export function LinksTab({ linkedPRs }: Props) {
  if (linkedPRs.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>No linked items.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {linkedPRs.map((pr) => (
        <div
          key={pr.id}
          className="bd-card"
          style={{
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            border: '1px solid var(--color-subtle-border)',
            background: 'var(--color-surface)',
            borderRadius: 8,
          }}
        >
          <span className="bd-mono" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            PR #{pr.id}
          </span>
          {pr.comment && (
            <span style={{ flex: 1, fontSize: 12, color: 'var(--color-text-primary)' }}>
              {pr.comment}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
