import { getHighlightClass } from '@/services/syntax-highlighter';
import type { HighlightSpan, InlineChange } from '@/types';

interface DiffLineContentProps {
  content: string;
  inlineChanges?: InlineChange[];
  syntaxSpans?: HighlightSpan[];
}

export function DiffLineContent({ content, inlineChanges, syntaxSpans }: DiffLineContentProps) {
  // Priority: inline changes > syntax highlighting > plain text
  if (inlineChanges && inlineChanges.length > 0) {
    return (
      <>
        {inlineChanges.map((change, i) => {
          if (change.type === 'unchanged') {
            return <span key={i}>{change.text}</span>;
          }
          const bg =
            change.type === 'added'
              ? 'var(--color-diff-added-bg-highlight)'
              : 'var(--color-diff-deleted-bg-highlight)';
          return (
            <span key={i} style={{ backgroundColor: bg, borderRadius: '2px' }}>
              {change.text}
            </span>
          );
        })}
      </>
    );
  }

  if (syntaxSpans && syntaxSpans.length > 0) {
    return <>{renderSyntaxHighlighted(content, syntaxSpans)}</>;
  }

  return <span>{content || '\n'}</span>;
}

function renderSyntaxHighlighted(text: string, spans: HighlightSpan[]): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let pos = 0;

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i]!;
    const start = Math.max(span.start, pos);
    const end = Math.min(span.end, text.length);

    // Text before this span
    if (pos < start) {
      nodes.push(<span key={`p${i}`}>{text.slice(pos, start)}</span>);
    }

    // Highlighted span
    if (start < end) {
      nodes.push(
        <span key={`s${i}`} style={{ color: `var(${getHighlightClass(span.category)})` }}>
          {text.slice(start, end)}
        </span>,
      );
    }

    pos = end;
  }

  // Remaining text
  if (pos < text.length) {
    nodes.push(<span key="tail">{text.slice(pos)}</span>);
  }

  if (nodes.length === 0) {
    nodes.push(<span key="empty">{text || '\n'}</span>);
  }

  return nodes;
}
