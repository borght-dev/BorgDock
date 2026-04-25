import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

interface Props {
  items: string[];
}

export function AlsoFixedList({ items }: Props) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4 pt-4 border-t border-dashed border-[var(--color-subtle-border)]">
      <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-muted)] mb-2">
        Also fixed
      </div>
      <ul data-also-fixed-list className="list-disc pl-4 text-[12.5px] leading-[1.7] text-[var(--color-text-secondary)]">
        {items.map((body, i) => (
          <li key={i}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeSanitize]}
              components={{
                p: ({ children }) => <span>{children}</span>,
                code: ({ children }) => (
                  <code className="font-mono text-[11px] text-[var(--color-text-primary)]">
                    {children}
                  </code>
                ),
              }}
            >
              {body}
            </ReactMarkdown>
          </li>
        ))}
      </ul>
    </div>
  );
}
