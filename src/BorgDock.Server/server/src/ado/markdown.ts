// ADO's rich text (the HTML its editor writes) as GitHub-flavoured markdown, so the iPhone renders descriptions,
// repro steps and comments with their lists, tables and screenshots. A small tolerant parser: ADO's HTML is
// generated, and anything it doesn't know becomes its text.

type HtmlNode = { kind: 'text'; text: string } | { kind: 'element'; tag: string; attrs: Record<string, string>; children: HtmlNode[] };
type Element = Extract<HtmlNode, { kind: 'element' }>;

/** Where an image goes: a URL to show, or null to leave it out. */
export type ImageResolver = (src: string) => string | null;

const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'col', 'wbr', 'area', 'source']);
const DROPPED = new Set(['script', 'style', 'head', 'title', 'noscript', 'template']);
const BLOCKS = new Set([
  'p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'figure', 'figcaption', 'details', 'summary', 'center', 'form', 'fieldset',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'blockquote', 'pre', 'hr', 'dl', 'dt', 'dd',
]);
/** An opening tag that closes an open one of these first (`<li>a<li>b`). */
const CLOSED_BY_SIBLING: Record<string, string[]> = { li: ['li'], tr: ['tr', 'td', 'th'], td: ['td', 'th'], th: ['td', 'th'], p: ['p'], dt: ['dt', 'dd'], dd: ['dt', 'dd'] };

const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…',
  euro: '€', pound: '£', copy: '©', reg: '®', trade: '™', bull: '•', middot: '·', laquo: '«', raquo: '»', times: '×', deg: '°', shy: '',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code === 0xa0 ? 0x20 : code) : match;
    }
    return ENTITIES[name.toLowerCase()] ?? match;
  });
}

function attributesOf(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of source.matchAll(/([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

export function parseHtml(html: string): HtmlNode[] {
  const root: Element = { kind: 'element', tag: '#root', attrs: {}, children: [] };
  const stack: Element[] = [root];
  const top = () => stack[stack.length - 1];
  const tokens = /<!--[\s\S]*?(?:-->|$)|<!\w[^>]*>|<\/\s*([a-z][\w:-]*)\s*>|<([a-z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+|<)/gi;
  for (const m of html.matchAll(tokens)) {
    const [, closing, opening, rawAttrs, text] = m;
    if (text !== undefined) {
      top().children.push({ kind: 'text', text: decodeEntities(text) });
    } else if (opening) {
      const tag = opening.toLowerCase();
      const closes = CLOSED_BY_SIBLING[tag];
      if (closes) {
        const open = stack.findLastIndex((e) => closes.includes(e.tag));
        const boundary = stack.findLastIndex((e) => ['ul', 'ol', 'table', 'dl'].includes(e.tag));
        if (open > 0 && open > boundary) stack.length = open;
      }
      const element: Element = { kind: 'element', tag, attrs: attributesOf(rawAttrs), children: [] };
      top().children.push(element);
      if (!VOID.has(tag) && !rawAttrs.trimEnd().endsWith('/')) stack.push(element);
    } else if (closing) {
      const open = stack.findLastIndex((e) => e.tag === closing.toLowerCase());
      if (open > 0) stack.length = open;
    }
  }
  return root.children;
}

/* ---------- rendering ---------- */

type Inline = { bold: boolean; italic: boolean; strike: boolean; link: boolean };
const PLAIN: Inline = { bold: false, italic: false, strike: false, link: false };
/** A line break inside inline text; becomes a hard break, a space or `<br>` depending on where the text lands. */
const BREAK = '\u0000';

function textOf(node: HtmlNode): string {
  if (node.kind === 'text') return node.text;
  if (node.tag === 'br') return '\n';
  if (DROPPED.has(node.tag)) return '';
  const inner = node.children.map(textOf).join('');
  return BLOCKS.has(node.tag) && node.tag !== 'td' && node.tag !== 'th' ? `${inner}\n` : inner;
}

function escapeText(text: string): string {
  return text
    .replace(/[\\`*[\]<]/g, (c) => `\\${c}`)
    .replace(/(^|[^\p{L}\p{N}])_|_(?=$|[^\p{L}\p{N}])/gu, (m) => m.replace('_', '\\_'))
    .replace(/~~/g, '\\~\\~');
}

/** A line that would read as a heading, quote, rule or list item stays text. */
function escapeLineStart(line: string): string {
  if (/^(#{1,6}(\s|$)|>|[-+](\s|$)|[=-]{3,}\s*$)/.test(line)) return `\\${line}`;
  return line.replace(/^(\d+)([.)])(\s|$)/, '$1\\$2$3');
}

/** `**text**` with the spaces around it kept outside, so `a<b> b </b>c` stays `a **b** c`. */
function wrap(inner: string, marker: string): string {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner)!;
  return match[2] ? `${match[1]}${marker}${match[2]}${marker}${match[3]}` : inner;
}

function codeSpan(text: string): string {
  const content = text.replace(/\s+/g, ' ');
  if (!content.trim()) return '';
  const fence = content.includes('`') ? '``' : '`';
  return fence.length > 1 ? `${fence} ${content} ${fence}` : `${fence}${content}${fence}`;
}

function linkTarget(href: string): string | null {
  const url = href.trim();
  if (!/^(https?:|mailto:)/i.test(url)) return null;
  return /[\s()<>]/.test(url) ? `<${url.replace(/[<>]/g, encodeURIComponent)}>` : url;
}

class Renderer {
  private readonly image: ImageResolver;

  constructor(image: ImageResolver) {
    this.image = image;
  }

  inline(nodes: readonly HtmlNode[], style: Inline): string {
    return nodes.map((node) => this.inlineNode(node, style)).join('');
  }

  private inlineNode(node: HtmlNode, style: Inline): string {
    if (node.kind === 'text') return escapeText(node.text.replace(/\s+/g, ' '));
    const { tag } = node;
    if (DROPPED.has(tag)) return '';
    if (tag === 'br') return BREAK;
    if (tag === 'img') return this.imageOf(node);
    if (tag === 'code' || tag === 'kbd' || tag === 'samp' || tag === 'tt') return codeSpan(node.children.map(textOf).join(''));
    if (tag === 'a') return this.linkOf(node, style);
    if ((tag === 'b' || tag === 'strong' || tag === 'u' || tag === 'ins') && !style.bold) return wrap(this.inline(node.children, { ...style, bold: true }), '**');
    if ((tag === 'i' || tag === 'em' || tag === 'cite') && !style.italic) return wrap(this.inline(node.children, { ...style, italic: true }), '*');
    if ((tag === 's' || tag === 'strike' || tag === 'del') && !style.strike) return wrap(this.inline(node.children, { ...style, strike: true }), '~~');
    if (BLOCKS.has(tag)) return ` ${this.inline(node.children, style)} `;
    return this.inline(node.children, style);
  }

  private imageOf(node: Element): string {
    const src = this.image(node.attrs.src ?? '');
    if (!src) return '';
    const alt = (node.attrs.alt ?? '').replace(/[[\]\\]/g, '').trim();
    return `![${alt}](${linkTarget(src) ?? src})`;
  }

  private linkOf(node: Element, style: Inline): string {
    const label = this.inline(node.children, { ...style, link: true }).replaceAll(BREAK, ' ').trim();
    const target = style.link ? null : linkTarget(node.attrs.href ?? '');
    if (!target) return label;
    if (!label) return `<${node.attrs.href.trim()}>`;
    return `[${label}](${target})`;
  }

  /** Markdown blocks, each a string without surrounding blank lines. */
  blocks(nodes: readonly HtmlNode[]): string[] {
    const out: string[] = [];
    let run: HtmlNode[] = [];
    const flush = () => {
      const paragraph = this.paragraph(run);
      if (paragraph) out.push(paragraph);
      run = [];
    };
    for (const node of nodes) {
      if (node.kind === 'element' && BLOCKS.has(node.tag)) {
        flush();
        out.push(...this.block(node));
      } else if (node.kind === 'element' && holdsBlocks(node)) {
        // `<span><div>a</div><div>b</div></span>`: the blocks keep their lines; the span's styling goes.
        flush();
        out.push(...this.blocks(node.children));
      } else {
        run.push(node);
      }
    }
    flush();
    return out;
  }

  private paragraph(nodes: readonly HtmlNode[]): string {
    const text = this.inline(nodes, PLAIN);
    const lines = text.split(BREAK).map((line) => line.trim());
    while (lines.length && !lines[0]) lines.shift();
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    return lines.map(escapeLineStart).join('  \n');
  }

  private block(node: Element): string[] {
    switch (node.tag) {
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
        const text = this.inline(node.children, PLAIN).replaceAll(BREAK, ' ').replace(/\s+/g, ' ').trim();
        return text ? [`${'#'.repeat(Number(node.tag[1]))} ${text}`] : [];
      }
      case 'ul': case 'ol': {
        const list = this.list(node);
        return list ? [list] : [];
      }
      case 'table': {
        const table = this.table(node);
        return table ? [table] : [];
      }
      case 'blockquote': {
        const inner = this.blocks(node.children).join('\n\n');
        return inner ? [inner.split('\n').map((line) => (line ? `> ${line}` : '>')).join('\n')] : [];
      }
      case 'pre': {
        const code = node.children.map(textOf).join('').replace(/^\n/, '').replace(/\s+$/, '');
        if (!code) return [];
        const fence = code.includes('```') ? '~~~' : '```';
        return [`${fence}\n${code}\n${fence}`];
      }
      case 'hr':
        return ['---'];
      default:
        return this.blocks(node.children);
    }
  }

  private list(node: Element): string {
    const ordered = node.tag === 'ol';
    let number = Math.max(1, Number.parseInt(node.attrs.start ?? '1', 10) || 1);
    const items: string[] = [];
    for (const child of node.children) {
      if (child.kind === 'text' && !child.text.trim()) continue;
      // A list nested straight inside a list (ADO's editor writes them) belongs to the item before it.
      if (child.kind === 'element' && (child.tag === 'ul' || child.tag === 'ol')) {
        const nested = this.list(child);
        if (!nested) continue;
        const indent = items.length ? ' '.repeat(markerWidth(items[items.length - 1])) : '';
        const lines = nested.split('\n').map((line) => (line ? indent + line : line)).join('\n');
        if (items.length) items[items.length - 1] += `\n${lines}`;
        else items.push(lines);
        continue;
      }
      const content = child.kind === 'element' && child.tag === 'li' ? this.blocks(child.children) : this.blocks([child]);
      const marker = ordered ? `${number++}. ` : '- ';
      const pad = ' '.repeat(marker.length);
      const body = content.join('\n').split('\n').map((line, i) => (i === 0 || !line ? line : pad + line)).join('\n');
      items.push(`${marker}${body}`.trimEnd());
    }
    return items.join('\n');
  }

  private table(node: Element): string {
    const rows: Element[] = [];
    const collect = (parent: Element) => {
      for (const child of parent.children) {
        if (child.kind !== 'element' || child.tag === 'table') continue;
        if (child.tag === 'tr') rows.push(child);
        else if (['thead', 'tbody', 'tfoot'].includes(child.tag)) collect(child);
      }
    };
    collect(node);
    const cells = rows
      .map((row) => row.children.filter((c): c is Element => c.kind === 'element' && (c.tag === 'td' || c.tag === 'th')).map((cell) => this.cell(cell)))
      .filter((row) => row.length > 0);
    if (!cells.length) return '';
    const width = Math.max(...cells.map((row) => row.length));
    const line = (row: string[]) => `| ${Array.from({ length: width }, (_, i) => row[i] ?? '').join(' | ')} |`;
    const [header, ...body] = cells;
    return [line(header), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...body.map(line)].join('\n');
  }

  private cell(cell: Element): string {
    return this.blocks(cell.children)
      .join(BREAK)
      .replace(/\n/g, BREAK)
      .split(BREAK)
      .map((part) => part.replace(/ {2}$/, '').trim())
      .filter(Boolean)
      .join('<br>')
      .replace(/\|/g, '\\|');
  }
}

function holdsBlocks(node: Element): boolean {
  return node.tag !== 'a' && node.children.some((child) => child.kind === 'element' && (BLOCKS.has(child.tag) || holdsBlocks(child)));
}

function markerWidth(item: string): number {
  return /^(\d+\. |- )/.exec(item)?.[1].length ?? 2;
}

/** GitHub-flavoured markdown for ADO's HTML. `image` decides where each image points (ADO attachments need signing). */
export function htmlToMarkdown(html: string | null | undefined, image: ImageResolver = (src) => (/^https:\/\//i.test(src) ? src : null)): string {
  if (!html) return '';
  return new Renderer(image).blocks(parseHtml(html)).join('\n\n').trim();
}
