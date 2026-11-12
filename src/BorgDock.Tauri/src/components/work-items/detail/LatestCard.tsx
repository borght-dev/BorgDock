import type { ItemLatest } from '@/services/ado/work-item-latest';
import { formatAgo } from '@/utils/relative-time';

/** "11 Nov" for a `YYYY-MM-DD` note date, "4 h ago" for a time. */
export function whenText(at: string | null, now?: number): string {
  if (!at) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(at)) {
    const date = new Date(`${at}T12:00:00`);
    return Number.isNaN(date.getTime())
      ? at
      : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  return formatAgo(at, now);
}

/** "Holidays now show…: each holiday renders…" → the headline and the rest. */
export function headlineOf(text: string): { title: string; rest: string } {
  const match = /^(.{12,140}?)(?:[:.!?](?:\s+|$)|\s+[—–-]\s+)(.*)$/s.exec(text.trim());
  if (!match) return { title: text.trim(), rest: '' };
  return { title: match[1]!.trim(), rest: match[2]!.trim() };
}

function sourceLabel(latest: ItemLatest, count: number | null): string {
  const { message } = latest;
  if (message.source === 'notes') {
    const of = count && count > 1 ? ` · update ${count} of ${count}` : '';
    return `${latest.notesLabel ?? 'Notes'}${of}`;
  }
  if (message.source === 'agent') return message.author;
  return `Comment · ${message.author}`;
}

export interface LatestCardProps {
  latest: ItemLatest;
  /** How many dated updates the notes hold; shows "update n of n". */
  noteCount?: number | null;
  /** Opens every update (the notes field or the Activity tab). */
  onShowAll?: () => void;
  showAllLabel?: string;
  compact?: boolean;
  now?: number;
}

/**
 * Latest: the newest thing said about the item — its newest Developer Notes
 * update, comment or agent message (Dispatch's `latestMessage`), headline
 * first. A note written in titled parts ("What was wrong:") shows them side by side.
 */
export function LatestCard({
  latest,
  noteCount = null,
  onShowAll,
  showAllLabel = 'All updates',
  compact = false,
  now,
}: LatestCardProps) {
  const { message, entry } = latest;
  const when = whenText(message.at, now);
  const sections = !compact && entry ? entry.sections.slice(0, 3) : [];
  const { title, rest } = entry
    ? { title: entry.heading, rest: entry.lines.join(' ') }
    : headlineOf(message.text);

  return (
    <section className="bd-wid-latest" data-wid-latest={message.source} aria-label="Latest update">
      <div className="bd-wid-latest__head">
        <span className="bd-wid-badge bd-wid-badge--accent">Latest</span>
        <span>
          {sourceLabel(latest, noteCount)}
          {when && ` · ${when}`}
        </span>
        {onShowAll && (
          <button type="button" className="bd-wid-latest__all" onClick={onShowAll}>
            {showAllLabel}
          </button>
        )}
      </div>
      <h3 className="bd-wid-latest__title">{title}</h3>
      {sections.length > 0 ? (
        <div className="bd-wid-latest__cols">
          {sections.map((section) => (
            <div key={section.title}>
              <h4>{section.title}</h4>
              <p>{section.text}</p>
            </div>
          ))}
        </div>
      ) : (
        rest && <p className="bd-wid-latest__text">{rest}</p>
      )}
    </section>
  );
}
