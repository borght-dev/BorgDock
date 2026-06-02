import clsx from 'clsx';
import { useState } from 'react';
import { Markdown } from '@/components/shared/Markdown';
import { Avatar, Button, Card, Pill } from '@/components/shared/primitives';
import type { ReviewThread, ReviewThreadSnippetLine } from '@/types';

export interface CodeThreadJumpTarget {
  filePath: string;
  line: number;
  threadId: string;
}

interface CodeThreadCardProps {
  thread: ReviewThread;
  onJumpToFile: (target: CodeThreadJumpTarget) => void;
  onResolve?: (threadId: string) => void;
  onUnresolve?: (threadId: string) => void;
  onReply?: (threadId: string, body: string) => void;
}

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

function fileShort(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

const FileIcon = () => (
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
    <path d="M9 2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6L9 2z" />
    <path d="M9 2v4h4" />
  </svg>
);

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

const ChevronDown = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="m4 6 4 4 4-4" />
  </svg>
);

const ArrowRight = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 8h10" />
    <path d="m9 4 4 4-4 4" />
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

function SnippetLine({ line }: { line: ReviewThreadSnippetLine }) {
  const bg = line.isAnchor
    ? 'var(--color-warning-badge-bg)'
    : line.marker === '+'
      ? 'rgba(63,159,124,0.10)'
      : line.marker === '-'
        ? 'rgba(229,64,101,0.10)'
        : 'transparent';
  const markerColor =
    line.marker === '+'
      ? 'var(--color-status-green)'
      : line.marker === '-'
        ? 'var(--color-status-red)'
        : 'transparent';
  return (
    <div
      style={{
        background: bg,
        borderLeft: line.isAnchor
          ? '3px solid var(--color-status-yellow)'
          : '3px solid transparent',
      }}
      className="grid grid-cols-[44px_18px_1fr] text-[11px] leading-[1.55] text-[var(--color-text-primary)]"
      data-snippet-line={line.lineNumber ?? ''}
    >
      <span className="select-none pr-2 text-right text-[10px] text-[var(--color-text-faint)]">
        {line.lineNumber ?? ''}
      </span>
      <span style={{ color: markerColor }} className="text-center font-semibold">
        {line.marker}
      </span>
      <span
        className="overflow-hidden whitespace-pre pr-3 text-ellipsis"
        style={{ fontFamily: 'var(--font-code)' }}
      >
        {line.text}
      </span>
    </div>
  );
}

/**
 * CodeThreadCard — Discussion card for a code-anchored review thread.
 *
 * Two modes:
 *  - resolved + collapsed (default for resolved): single dashed-border row
 *  - expanded: full card (header / snippet / reply chain / actions)
 */
export function CodeThreadCard({
  thread,
  onJumpToFile,
  onResolve,
  onUnresolve,
  onReply,
}: CodeThreadCardProps) {
  const [expanded, setExpanded] = useState(!thread.isResolved);
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');

  const replyCount = thread.comments.length;
  const first = thread.comments[0];
  const short = fileShort(thread.filePath);

  if (thread.isResolved && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        data-discussion-item="code"
        data-thread-resolved="true"
        className="bd-card flex cursor-pointer items-center gap-2.5 px-3.5 py-2 text-left text-[var(--color-text-tertiary)] !border-dashed"
      >
        <span className="text-[var(--color-status-green)] inline-flex">
          <Check />
        </span>
        <span className="text-[11.5px] font-medium">Resolved</span>
        <span
          className="text-[11px] text-[var(--color-text-muted)]"
          style={{ fontFamily: 'var(--font-code)' }}
        >
          {short}:{thread.line}
        </span>
        {first && (
          <span className="flex-1 truncate text-[11px] text-[var(--color-text-muted)]">
            · {first.author}: "{first.body.split('\n')[0]?.slice(0, 70) ?? ''}…"
          </span>
        )}
        <span className="text-[11px] text-[var(--color-text-muted)]">
          {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
        </span>
        <ChevronDown />
      </button>
    );
  }

  return (
    <Card
      padding="sm"
      className="!p-0 overflow-hidden"
      data-discussion-item="code"
      data-thread-id={thread.id}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--color-subtle-border)] bg-[var(--color-surface-hover)] px-3 py-2">
        <span className="text-[var(--color-accent)] inline-flex">
          <FileIcon />
        </span>
        <button
          type="button"
          onClick={() =>
            onJumpToFile({ filePath: thread.filePath, line: thread.line, threadId: thread.id })
          }
          className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--color-accent)]"
          style={{ fontFamily: 'var(--font-code)' }}
          title="View in Files"
        >
          {short}
          <span className="opacity-60">:{thread.line}</span>
        </button>
        {thread.isResolved && (
          <Pill tone="success" icon={<Check />}>
            resolved
          </Pill>
        )}
        <span className="flex-1" />
        <span className="text-[11px] text-[var(--color-text-muted)]">
          {replyCount} {replyCount === 1 ? 'comment' : 'comments'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          leading={<ArrowRight />}
          onClick={() =>
            onJumpToFile({ filePath: thread.filePath, line: thread.line, threadId: thread.id })
          }
          data-thread-action="view-in-files"
        >
          View in Files
        </Button>
      </div>

      {/* Snippet */}
      <div
        className="border-b border-[var(--color-subtle-border)] bg-[var(--color-background)]"
        data-thread-snippet
      >
        {thread.snippet.map((s, i) => (
          <SnippetLine key={`${s.lineNumber ?? 'x'}-${i}`} line={s} />
        ))}
      </div>

      {/* Reply chain */}
      <div className="relative px-3.5 py-3">
        {replyCount > 1 && (
          <div className="absolute left-[24px] top-6 bottom-3.5 w-[2px] bg-[var(--color-subtle-border)]" />
        )}
        {thread.comments.map((c, i) => (
          <div
            key={c.id}
            className={clsx(
              'relative grid grid-cols-[24px_1fr] items-start gap-x-2.5',
              i > 0 && 'pt-3',
              i < replyCount - 1 && 'border-b border-[var(--color-subtle-border)] pb-3',
            )}
          >
            <div className="relative z-[1]">
              <Avatar initials={initials(c.author)} tone="them" size="sm" />
            </div>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[var(--color-text-primary)]">
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
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  {relative(c.createdAt)}
                </span>
              </div>
              <div className="markdown-body text-[12.5px] leading-[1.55] text-[var(--color-text-secondary)]">
                <Markdown>{c.body}</Markdown>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-[var(--color-subtle-border)] bg-[var(--color-surface)] px-3.5 py-2.5">
        {!replying ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              leading={<Speech />}
              onClick={() => setReplying(true)}
              data-thread-action="reply"
            >
              Reply
            </Button>
            {!thread.isResolved && onResolve && (
              <Button
                variant="ghost"
                size="sm"
                leading={<Check />}
                onClick={() => onResolve(thread.id)}
                data-thread-action="resolve"
              >
                Resolve thread
              </Button>
            )}
            {thread.isResolved && onUnresolve && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onUnresolve(thread.id)}
                data-thread-action="unresolve"
              >
                Unresolve
              </Button>
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col gap-2">
            <textarea
              autoFocus
              placeholder="Write a reply…"
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              className="block min-h-[56px] w-full resize-y rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] p-2 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
            />
            <div className="flex items-center justify-end gap-2">
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
    </Card>
  );
}
