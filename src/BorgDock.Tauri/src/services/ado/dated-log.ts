import { htmlToText } from '@/services/dispatch/item-text';

/**
 * A long-text field written as a log of dated updates, newest on top, like
 * Developer Notes: `Update (2026-11-11) — Holidays now show…`. The full view
 * shows the newest one in Latest and the rest as a list.
 */

const HEADING =
  /^(?:(?:Status update|Update|Status|Progress) \((20\d{2}-\d{2}-\d{2})\)|(20\d{2}-\d{2}-\d{2})(?=\s*[—–:-]))\s*[—–:-]?\s*/i;

/** `What was wrong: …` starts a section of an entry. */
const SECTION = /^([A-Z][\p{L} ’'/-]{2,40}):\s*(.*)$/u;

export interface LogSection {
  title: string;
  text: string;
}

export interface LogEntry {
  /** `YYYY-MM-DD`. */
  date: string;
  /** The entry's first line, without the dated prefix. */
  heading: string;
  /** Lines after the heading. */
  lines: string[];
  /** Titled parts of the entry (`What was wrong:`), when it has at least two. */
  sections: LogSection[];
}

function sectionsOf(lines: string[]): LogSection[] {
  const sections: LogSection[] = [];
  for (const line of lines) {
    const match = SECTION.exec(line);
    if (match) {
      sections.push({ title: match[1]!, text: match[2] ?? '' });
    } else if (sections.length > 0) {
      const last = sections[sections.length - 1]!;
      last.text = last.text ? `${last.text} ${line}` : line;
    }
  }
  return sections.length >= 2 ? sections : [];
}

/** The entries of a dated log, in the order written; null when the text is not one. */
export function datedLog(html: unknown): LogEntry[] | null {
  if (typeof html !== 'string' || !html) return null;
  const lines = htmlToText(html).split('\n');
  const starts = lines.flatMap((line, i) => (HEADING.test(line) ? [i] : []));
  if (starts.length === 0 || starts[0]! > 1) return null;
  return starts.map((start, n) => {
    const end = starts[n + 1] ?? lines.length;
    const first = lines[start]!;
    const match = HEADING.exec(first)!;
    const heading = first
      .slice(match[0].length)
      .replace(/[:—–-]\s*$/, '')
      .trim();
    const rest = lines.slice(start + 1, end);
    return {
      date: (match[1] ?? match[2])!,
      heading: heading || rest[0] || '',
      lines: heading ? rest : rest.slice(1),
      sections: sectionsOf(heading ? rest : rest.slice(1)),
    };
  });
}
