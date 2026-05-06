// src/components/work-items/WorkItemDetailPanel/AttachmentsTab.tsx
import type { WorkItemAttachment } from '@/types';

interface Props {
  attachments: WorkItemAttachment[];
  onDownload: (a: WorkItemAttachment) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentsTab({ attachments, onDownload }: Props) {
  if (attachments.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>No attachments.</div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {attachments.map((a) => (
        <button
          type="button"
          key={a.id}
          onClick={() => onDownload(a)}
          className="bd-card"
          style={{
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textAlign: 'left',
            cursor: 'pointer',
            border: '1px solid var(--color-subtle-border)',
            background: 'var(--color-surface)',
            borderRadius: 8,
            fontFamily: 'inherit',
          }}
        >
          <span
            style={{
              width: 56,
              height: 40,
              borderRadius: 6,
              background: 'var(--color-surface-hover)',
              color: 'var(--color-text-tertiary)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            📎
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--color-text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {a.fileName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
              {formatSize(a.size)}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
