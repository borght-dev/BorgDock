import type { WorkItemComment } from '@/types';
import type { ItemComment, ItemNote } from './types';

/** Where one block of text ends and the next begins, opening or closing. */
const BLOCK_EDGE = /<\s*\/?\s*(br|p|div|li|ul|ol|h[1-6]|tr|table|blockquote)\b[^>]*>/gi;
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntity(name: string): string | undefined {
  if (name.startsWith('#x') || name.startsWith('#X')) {
    return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
  }
  if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)));
  return NAMED_ENTITIES[name.toLowerCase()];
}

/** HTML as plain text: block ends become line breaks, tags go, entities are decoded. */
export function htmlToText(html: string): string {
  return html
    .replace(BLOCK_EDGE, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => decodeEntity(name) ?? whole)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** `text` cut to at most `limit` characters, at a word, with an ellipsis when cut. */
export function clip(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

const NOTE_LIMIT = 320;
const COMMENT_LIMIT = 480;
const DATE = /\b(20\d{2}-\d{2}-\d{2})\b/;
/** Where the second dated block of Developer Notes begins. */
const NEXT_BLOCK =
  /\n(?=(?:Status update|Update|Status) \(20\d{2}-\d{2}-\d{2}\)|20\d{2}-\d{2}-\d{2} [—-])/;

/** `Update (2026-10-13) - `: the heading the date is read from, which the text drops. */
const DATED_HEADING = /^(?:Status update|Update|Status) \(20\d{2}-\d{2}-\d{2}\)\s*[-—:]?\s*/;

/** The newest block of Developer Notes: new entries are added on top. */
export function newestNote(html: unknown): ItemNote | null {
  if (typeof html !== 'string') return null;
  const text = htmlToText(html);
  if (!text) return null;
  const block = text.split(NEXT_BLOCK)[0]!.replace(/\n/g, ' ');
  const date = DATE.exec(block.slice(0, 120))?.[1] ?? null;
  return { text: clip(block.replace(DATED_HEADING, ''), NOTE_LIMIT), date };
}

/** `Vera · plan — …`: an agent signs what it posts from someone else's account. */
const SIGNED = /^([\p{L}][\p{L}.]*) · ([\p{L}-]+) [—-] /u;

/** A discussion comment as Dispatch shows it. `me` is my display name, when known. */
export function toItemComment(comment: WorkItemComment, me: string | null): ItemComment {
  const text = htmlToText(comment.text).replace(/\n/g, ' ');
  const signed = SIGNED.exec(text);
  const poster = comment.createdBy.displayName;
  return {
    id: comment.id,
    author: signed ? `${signed[1]} · ${signed[2]}` : poster,
    at: comment.createdDate,
    text: clip(signed ? text.slice(signed[0].length) : text, COMMENT_LIMIT),
    byMe: !signed && me !== null && poster === me,
  };
}
