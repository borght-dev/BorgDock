export type SearchMode = 'filename' | 'content' | 'symbol';

export interface ParsedQuery {
  mode: SearchMode;
  query: string;
}

export function parseQuery(raw: string): ParsedQuery {
  if (raw.startsWith('>')) {
    return { mode: 'content', query: raw.slice(1).trimStart() };
  }
  if (raw.startsWith('@')) {
    return { mode: 'symbol', query: raw.slice(1).trimStart() };
  }
  return { mode: 'filename', query: raw };
}
