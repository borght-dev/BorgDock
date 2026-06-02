import { useState } from 'react';
import { Markdown } from '@/components/shared/Markdown';
import { Avatar, Button, Pill } from '@/components/shared/primitives';
import type { ReviewThread } from '@/types';

interface InlineThreadProps {
  thread: ReviewThread;
  onClose: () => void;
  onResolve?: (threadId: string) => void;
  onUnresolve?: (threadId: string) => void;
  onReply?: (threadId: string, body: string) => void;
}

const Check = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m4 8 3 3 5-6" />
  </svg>
);

const Close = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="m4 4 8 8M12 4 4 12" />
  </svg>
);

const Speech = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 4h10v6H7l-3 3v-3H3z" />
  </svg>
);

function relative(createdAt: string): string {
  const seconds = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function initials(login: string): string {
  return login
    .replace(/\[bot\]$/, '')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * InlineThread — anchored thread bubble for the Files tab. Embedded as a row
 * directly below the diff line whose thread is open.
 */
export function InlineThread({
  thread,
  onClose,
  onResolve,
  onUnresolve,
  onReply,
}: InlineThreadProps) {
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');

  return (
    <div
      data-inline-thread
      data-thread-id={thread.id}
      className="my-1 rounded-md border border-[var(--color-purple-border)] border-l-[3px] border-l-[var(--color-accent)] bg-[var(--color-surface)]"
    >
      <div className="flex items-center gap-2 border-b border-[var(--color-subtle-border)] bg-[var(--color-accent-subtle)] px-3 py-1.5">
        <span className="text-[var(--color-accent)] inline-flex">
          <Speech />
        </span>
        <span className="text-[11px] font-semibold text-[var(--color-accent)]">
          Thread · {thread.comments.length} {thread.comments.length === 1 ? 'comment' : 'comments'}
        </span>
        <span className="flex-1" />
        {!thread.isResolved && onResolve && (
          <Button
            variant="ghost"
            size="sm"
            leading={<Check />}
            onClick={() => onResolve(thread.id)}
          >
            Resolve
          </Button>
        )}
        {thread.isResolved && onUnresolve && (
          <Button variant="ghost" size="sm" onClick={() => onUnresolve(thread.id)}>
            Unresolve
          </Button>
        )}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
        >
          <Close />
        </button>
      </div>

      <div className="px-3">
        {thread.comments.map((c, i) => (
          <div
            key={c.id}
            className={
              i === thread.comments.length - 1
                ? 'grid grid-cols-[20px_1fr] gap-x-2 py-2.5'
                : 'grid grid-cols-[20px_1fr] gap-x-2 border-b border-[var(--color-subtle-border)] py-2.5'
            }
          >
            <Avatar initials={initials(c.author)} tone="them" size="sm" />
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-[11.5px] font-semibold text-[var(--color-text-primary)]">
                  {c.author}
                </span>
                {c.authorIsBot && <Pill tone="neutral">bot</Pill>}
                {c.severity && (
                  <Pill
                    tone={
                      c.severity === 'critical'
                        ? 'error'
                        : c.severity === 'praise'
                          ? 'success'
                          : 'warning'
                    }
                  >
                    {c.severity}
                  </Pill>
                )}
                <span className="flex-1" />
                <span className="text-[10.5px] text-[var(--color-text-muted)]">
                  {relative(c.createdAt)}
                </span>
              </div>
              <div className="markdown-body text-[12px] leading-[1.5] text-[var(--color-text-secondary)]">
                <Markdown>{c.body}</Markdown>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--color-subtle-border)] px-3 py-2">
        {!replying ? (
          <Button variant="ghost" size="sm" leading={<Speech />} onClick={() => setReplying(true)}>
            Reply
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <textarea
              autoFocus
              placeholder="Reply..."
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              className="block min-h-[50px] w-full resize-y rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] p-2 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setReplying(false);
                  setReplyBody('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  onReply?.(thread.id, replyBody);
                  setReplying(false);
                  setReplyBody('');
                }}
              >
                Reply
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
