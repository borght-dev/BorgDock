import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import type { Highlight, Kind } from '@/types/whats-new';
import { Pill, type PillTone } from '@/components/shared/primitives/Pill';
import { HeroBanner } from './HeroBanner';

const KIND_LABEL: Record<Kind, string> = {
  new: 'New',
  improved: 'Improved',
  fixed: 'Fixed',
};

const KIND_TONE: Record<Kind, PillTone> = {
  new: 'success',
  improved: 'neutral',
  fixed: 'warning',
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
        <Pill
          tone={KIND_TONE[kind]}
          data-highlight-kind={kind}
          data-pill-tone={KIND_TONE[kind]}
        >
          {KIND_LABEL[kind]}
        </Pill>
        <span className="text-[14px] font-medium text-[var(--color-text-primary)]">{title}</span>
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
