/**
 * What a note says, read from its markdown: frontmatter, headings, `[[links]]`,
 * references to pull requests, work items, T3 threads and workstreams, tags
 * and tasks. Pure; the editor's decorations and the vault index both read
 * inline tokens through `scanLine`, so they never disagree.
 */

export type InlineToken =
  | {
      kind: 'wikilink';
      from: number;
      to: number;
      target: string;
      heading: string | null;
      label: string | null;
    }
  | {
      kind: 'ado';
      from: number;
      to: number;
      id: number;
      /** Set when the token is an address, which names its organization. */
      organization: string | null;
      project: string | null;
      url: boolean;
    }
  | {
      kind: 'pr';
      from: number;
      to: number;
      owner: string | null;
      repo: string;
      number: number;
      url: boolean;
    }
  | { kind: 't3'; from: number; to: number; label: string; environmentId: string; threadId: string }
  | { kind: 'workstream'; from: number; to: number; label: string; id: string }
  | { kind: 'tag'; from: number; to: number; tag: string };

/** A reference to something BorgDock knows: a pull request, work item, thread or workstream. */
export type RefToken = Extract<InlineToken, { kind: 'pr' | 'ado' | 't3' | 'workstream' }>;

export function isRefToken(token: InlineToken): token is RefToken {
  return (
    token.kind === 'pr' ||
    token.kind === 'ado' ||
    token.kind === 't3' ||
    token.kind === 'workstream'
  );
}

export interface Heading {
  level: number;
  text: string;
  line: number;
}

export interface Task {
  line: number;
  done: boolean;
  text: string;
}

export type Frontmatter = Record<string, string | string[]>;

export interface ParsedNote {
  path: string;
  title: string;
  frontmatter: Frontmatter;
  headings: Heading[];
  /** Every inline token with the line it sits on (0-based). */
  tokens: (InlineToken & { line: number })[];
  tags: string[];
  tasks: Task[];
}

const WIKILINK = /\[\[([^\]\n|#]+)(?:#([^\]\n|]+))?(?:\|([^\]\n]+))?\]\]/g;
const MARKDOWN_LINK =
  /\[([^\]\n]*)\]\(((?:t3code:\/\/threads|borgdock:\/\/workstreams)\/[^)\s]+)\)/g;
const ADO = /(?<![\w#/])AB#(\d{1,9})\b/gi;
const PR = /(?<![\w/#.-])(?:([\w.-]+)\/)?([\w.-]+)#(\d{1,7})\b/g;
const TAG = /(?<![\w#/&])#([\w/-]*[A-Za-z_/-][\w/-]*)/g;
const INLINE_CODE = /`[^`\n]*`/g;
const PR_URL = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/i;
const ADO_URL = /^https?:\/\/dev\.azure\.com\/([^/\s]+)\/([^/\s]+)\/_workitems\/edit\/(\d+)/i;
const URL_RUN = /\b(?:https?|t3code|borgdock):\/\/\S+/g;
const TASK = /^\s*[-*+] \[([ xX])\] (.*)$/;
const HEADING = /^(#{1,6}) +(.+?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;

/** The title of the note at `path`: its file name without `.md`. */
export function titleOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return name.replace(/\.md$/i, '');
}

function blank(text: string, from: number, to: number): string {
  return text.slice(0, from) + ' '.repeat(to - from) + text.slice(to);
}

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/**
 * The inline tokens of one line, `from`/`to` relative to the line. Inline
 * code, and addresses outside a link's parentheses, hold no tokens.
 */
export function scanLine(line: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let rest = line.replace(INLINE_CODE, (m) => ' '.repeat(m.length));

  for (const m of rest.matchAll(WIKILINK)) {
    const from = m.index;
    tokens.push({
      kind: 'wikilink',
      from,
      to: from + m[0].length,
      target: m[1]!.trim(),
      heading: m[2]?.trim() ?? null,
      label: m[3]?.trim() ?? null,
    });
  }
  for (const m of rest.matchAll(MARKDOWN_LINK)) {
    const from = m.index;
    const to = from + m[0].length;
    const url = m[2]!;
    const label = m[1]!.trim();
    const thread = /^t3code:\/\/threads\/([^/\s]+)\/([^/\s?#)]+)/.exec(url);
    const workstream = /^borgdock:\/\/workstreams\/([^/\s?#)]+)/.exec(url);
    if (thread) {
      tokens.push({
        kind: 't3',
        from,
        to,
        label,
        environmentId: decode(thread[1]!),
        threadId: decode(thread[2]!),
      });
    } else if (workstream) {
      tokens.push({ kind: 'workstream', from, to, label, id: decode(workstream[1]!) });
    }
  }
  for (const token of tokens) rest = blank(rest, token.from, token.to);
  for (const m of rest.matchAll(URL_RUN)) {
    const from = m.index;
    const to = from + m[0].length;
    const pr = PR_URL.exec(m[0]);
    const ado = ADO_URL.exec(m[0]);
    if (pr) {
      tokens.push({
        kind: 'pr',
        from,
        to,
        owner: pr[1]!,
        repo: pr[2]!,
        number: Number(pr[3]),
        url: true,
      });
    } else if (ado) {
      tokens.push({
        kind: 'ado',
        from,
        to,
        id: Number(ado[3]),
        organization: decode(ado[1]!),
        project: decode(ado[2]!),
        url: true,
      });
    }
    rest = blank(rest, from, to);
  }

  for (const m of rest.matchAll(ADO)) {
    const from = m.index;
    tokens.push({
      kind: 'ado',
      from,
      to: from + m[0].length,
      id: Number(m[1]),
      organization: null,
      project: null,
      url: false,
    });
    rest = blank(rest, from, from + m[0].length);
  }
  for (const m of rest.matchAll(PR)) {
    const repo = m[2]!;
    if (!m[1] && /^ab$/i.test(repo)) continue;
    const from = m.index;
    tokens.push({
      kind: 'pr',
      from,
      to: from + m[0].length,
      owner: m[1] ?? null,
      repo,
      number: Number(m[3]),
      url: false,
    });
    rest = blank(rest, from, from + m[0].length);
  }
  for (const m of rest.matchAll(TAG)) {
    const from = m.index;
    tokens.push({ kind: 'tag', from, to: from + m[0].length, tag: m[1]!.toLowerCase() });
  }
  return tokens.sort((a, b) => a.from - b.from);
}

function unquote(value: string): string {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * The frontmatter block at the top of a note (YAML between `---` lines):
 * `key: value`, `key: [a, b]` and `key:` followed by `- item` lines. The
 * line after the block, or 0 when there is none.
 */
export function parseFrontmatter(lines: string[]): { frontmatter: Frontmatter; body: number } {
  const frontmatter: Frontmatter = {};
  if (lines[0]?.trim() !== '---') return { frontmatter, body: 0 };
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (end < 0) return { frontmatter, body: 0 };
  let listKey: string | null = null;
  for (const line of lines.slice(1, end)) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      const current = frontmatter[listKey];
      frontmatter[listKey] = [...(Array.isArray(current) ? current : []), unquote(item[1]!)];
      continue;
    }
    const pair = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
    if (!pair) continue;
    const key = pair[1]!;
    const value = pair[2]!.trim();
    listKey = null;
    if (!value) {
      frontmatter[key] = [];
      listKey = key;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[key] = value.slice(1, -1).split(',').map(unquote).filter(Boolean);
    } else {
      frontmatter[key] = unquote(value);
    }
  }
  return { frontmatter, body: end + 1 };
}

function frontmatterTags(frontmatter: Frontmatter): string[] {
  const value = frontmatter.tags ?? frontmatter.tag;
  const list = Array.isArray(value) ? value : value ? value.split(/[,\s]+/) : [];
  return list.map((t) => t.replace(/^#/, '').trim().toLowerCase()).filter(Boolean);
}

/** Everything the vault index needs from one note. */
export function parseNote(path: string, text: string): ParsedNote {
  const lines = text.split(/\r?\n/);
  const { frontmatter, body } = parseFrontmatter(lines);
  const headings: Heading[] = [];
  const tokens: (InlineToken & { line: number })[] = [];
  const tasks: Task[] = [];
  const tags = new Set(frontmatterTags(frontmatter));

  // Frontmatter values can hold references too (`workstream: [label](borgdock://…)`).
  for (let line = 1; line < body - 1; line++) {
    for (const token of scanLine(lines[line]!)) {
      if (token.kind !== 'tag') tokens.push({ ...token, line });
    }
  }

  let fenced = false;
  for (let line = body; line < lines.length; line++) {
    const text = lines[line]!;
    if (FENCE.test(text)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const heading = HEADING.exec(text);
    if (heading) headings.push({ level: heading[1]!.length, text: heading[2]!, line });
    const task = TASK.exec(text);
    if (task) tasks.push({ line, done: task[1] !== ' ', text: task[2]!.trim() });
    for (const token of scanLine(
      heading ? text.replace(/^#+/, (m) => ' '.repeat(m.length)) : text,
    )) {
      tokens.push({ ...token, line });
      if (token.kind === 'tag') tags.add(token.tag);
    }
  }

  return {
    path,
    title: titleOf(path),
    frontmatter,
    headings,
    tokens,
    tags: [...tags].sort(),
    tasks,
  };
}
