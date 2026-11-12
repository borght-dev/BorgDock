import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { LogEntry } from '@/services/ado/dated-log';
import type { HtmlBlock } from '@/services/ado/form-model';
import { RichTextBlock } from './RichTextBlock';

function shortDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export interface NotesLogProps {
  block: HtmlBlock;
  entries: LogEntry[];
  /** The newest entry is already on screen in Latest. */
  newestInLatest: boolean;
}

/**
 * A long-text field kept as a log of dated updates (Developer Notes): one row
 * per update, newest first; a row opens to its text. "Show as written"
 * renders the field itself.
 */
export function NotesLog({ block, entries, newestInLatest }: NotesLogProps) {
  const [open, setOpen] = useState<number | null>(null);
  const [asWritten, setAsWritten] = useState(false);

  return (
    <section className="bd-wid-field" data-wid-field={block.key} data-wid-log="">
      <header className="bd-wid-field__head">
        <h2>{block.label}</h2>
        <span className="bd-wid-field__src">
          {entries.length} dated update{entries.length === 1 ? '' : 's'}, newest first
        </span>
        <span className="bd-wid-spacer" />
        <button type="button" className="bd-wid-more" onClick={() => setAsWritten((v) => !v)}>
          {asWritten ? 'Show as updates' : 'Show as written'}
        </button>
      </header>
      {asWritten ? (
        <RichTextBlock block={block} headless clamp={false} />
      ) : (
        <div className="bd-wid-log">
          {entries.map((entry, index) => {
            const current = index === 0 && newestInLatest;
            const expanded = open === index;
            return (
              <div key={`${entry.date}-${entry.heading}`} className="bd-wid-log__entry">
                <button
                  type="button"
                  className="bd-wid-log__row"
                  data-current={current || undefined}
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : index)}
                >
                  <span className="bd-wid-log__date">{shortDate(entry.date)}</span>
                  <span className="bd-wid-log__head">{entry.heading}</span>
                  {current && !expanded ? (
                    <span className="bd-wid-badge bd-wid-badge--soft">In Latest</span>
                  ) : (
                    <ChevronDown
                      className="bd-wid-log__chev"
                      size={12}
                      strokeWidth={2}
                      aria-hidden
                    />
                  )}
                </button>
                {expanded && (
                  <div className="bd-wid-log__body">
                    {entry.lines.length > 0 ? (
                      entry.lines.map((line) => <p key={`${entry.date}:${line}`}>{line}</p>)
                    ) : (
                      <p>{entry.heading}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
