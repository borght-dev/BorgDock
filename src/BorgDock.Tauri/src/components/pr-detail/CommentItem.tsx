import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { Avatar, Card, Pill } from '@/components/shared/primitives';

interface CommentItemProps {
  author: string;
  authorIsBot: boolean;
  body: string;
  createdAt: string;
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
  return login.replace(/\[bot\]$/, '').slice(0, 2).toUpperCase();
}

/** Generic top-level (issue) comment. */
export function CommentItem({ author, authorIsBot, body, createdAt }: CommentItemProps) {
  return (
    <Card padding="sm" data-discussion-item="comment">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Avatar initials={initials(author)} tone="them" size="sm" />
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">{author}</span>
        {authorIsBot && <Pill tone="neutral">bot</Pill>}
        <span className="flex-1" />
        <span className="text-[11px] text-[var(--color-text-muted)]">{relative(createdAt)}</span>
      </div>
      <div className="markdown-body text-[12.5px] leading-[1.55] text-[var(--color-text-secondary)]">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>
          {body}
        </ReactMarkdown>
      </div>
    </Card>
  );
}
