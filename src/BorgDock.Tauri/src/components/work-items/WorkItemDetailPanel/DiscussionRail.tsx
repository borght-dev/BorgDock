// src/components/work-items/WorkItemDetailPanel/DiscussionRail.tsx
import { useState } from 'react';
import { Kbd } from '@/components/shared/primitives';
import {
  MiniAvatar,
  avatarToneFor,
  getInitials,
} from '@/components/work-items/shared/wi-visuals';
import { sanitizeHtml } from '@/utils/sanitize-html';
import type { WorkItemComment } from '@/types';

interface Props {
  comments: WorkItemComment[];
  isLoading: boolean;
  onAddComment: (text: string) => Promise<void>;
}

function relativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function DiscussionRail({ comments, isLoading, onAddComment }: Props) {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  async function submit() {
    const v = text.trim();
    if (!v || posting) return;
    setPosting(true);
    try {
      await onAddComment(v);
      setText('');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 6,
        paddingTop: 16,
        borderTop: '1px solid var(--color-subtle-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--color-text-muted)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Discussion
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>{comments.length}</span>
      </div>
      {isLoading && (
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Loading…</div>
      )}
      {!isLoading && comments.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>No comments yet.</div>
      )}
      {!isLoading &&
        comments.map((c) => {
          const initials = getInitials(c.createdBy.displayName);
          return (
            <div
              key={c.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '20px 1fr',
                columnGap: 8,
                marginBottom: 10,
              }}
            >
              <MiniAvatar initials={initials} tone={avatarToneFor(initials)} size={20} />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 2,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {c.createdBy.displayName}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>
                    {relativeTime(c.createdDate)}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    lineHeight: 1.55,
                    color: 'var(--color-text-secondary)',
                  }}
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: text sanitized via sanitizeHtml
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.text) }}
                />
              </div>
            </div>
          );
        })}

      <div
        style={{
          marginTop: 10,
          padding: '8px 10px',
          background: 'var(--color-input-bg)',
          border: '1px solid var(--color-input-border)',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <input
          disabled={posting}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Reply or @mention…"
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            fontSize: 11.5,
            color: 'var(--color-text-primary)',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <Kbd>{'⏎'}</Kbd>
      </div>
    </div>
  );
}
