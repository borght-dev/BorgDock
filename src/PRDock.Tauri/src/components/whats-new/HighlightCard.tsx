import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import type { Highlight, Kind } from '@/types/whats-new';
import { HeroBanner } from './HeroBanner';

const KIND_LABEL: Record<Kind, string> = {
  new: 'New',
  improved: 'Improved',
  fixed: 'Fixed',
};

const KIND_CLASSES: Record<Kind, string> = {
  new: 'text-[var(--color-whats-new-new-fg)] bg-[var(--color-whats-new-new-bg)] border-[var(--color-whats-new-new-border)]',
  improved:
    'text-[var(--color-whats-new-improved-fg)] bg-[var(--color-whats-new-improved-bg)] border-[var(--color-whats-new-improved-border)]',
  fixed:
    'text-[var(--color-whats-new-fixed-fg)] bg-[var(--color-whats-new-fixed-bg)] border-[var(--color-whats-new-fixed-border)]',
};

interface Props {
  highlight: Highlight;
}

export function HighlightCard({ highlight }: Props) {
  const { kind, title, description, hero, keyboard } = highlight;
  return (
    <div className="mb-4 last:mb-1">
      <HeroBanner hero={hero} kind={kind} />
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span
          className={`text-[10px] font-medium uppercase tracking-[0.04em] px-1.5 py-0.5 rounded border ${KIND_CLASSES[kind]}`}
        >
          {KIND_LABEL[kind]}
        </span>
        <span className="text-[14px] font-medium text-[var(--color-text-primary)]">
          {title}
        </span>
        {keyboard && (
          <kbd className="font-mono text-[11px] px-1.5 py-[1px] rounded border bg-[var(--color-surface-raised)] border-[var(--color-strong-border)] text-[var(--color-text-primary)]">
            {keyboard}
          </kbd>
        )}
      </div>
      <div className="text-[13px] leading-[1.55] text-[var(--color-text-secondary)]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]}
          components={{
            p: ({ children }) => <p>{children}</p>,
            code: ({ children }) => (
              <code className="font-mono text-[11px] bg-[var(--color-surface-raised)] border border-[var(--color-subtle-border)] rounded px-1 py-[1px]">
                {children}
              </code>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--color-accent)] hover:underline"
              >
                {children}
              </a>
            ),
          }}
        >
          {description}
        </ReactMarkdown>
      </div>
    </div>
  );
}
