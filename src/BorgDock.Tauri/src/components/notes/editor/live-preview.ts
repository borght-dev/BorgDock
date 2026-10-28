/**
 * Obsidian-style live preview for the notes editor. On every line the
 * selection does not touch, markdown syntax is hidden and references render
 * in place (chips, links, tags, checkboxes); the lines being edited show raw
 * markdown. `previewRanges` decides what goes where and is pure; the view
 * plugin turns its answer into decorations for the visible part of the note.
 */
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { type ChangeSpec, type Extension, type Range, StateEffect, Text } from '@codemirror/state';
import {
  type Command,
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';
import { tags } from '@lezer/highlight';
import type { BlockContext, MarkdownConfig, Line as MarkdownLine } from '@lezer/markdown';
import { isRefToken, type RefToken, scanLine } from '@/services/notes/parse';

export interface Span {
  from: number;
  to: number;
}

export type PreviewRange =
  /** Syntax that disappears: `#`, `**`, backticks, `[[`, a link's `](url)`. */
  | { kind: 'hide'; from: number; to: number }
  /** A class on the whole line that starts at `from`; `to` equals `from`. */
  | { kind: 'line'; from: number; to: number; className: string }
  /** A `[[link]]`: its label on a preview line, the whole raw token on an edited one. */
  | { kind: 'wikilink'; from: number; to: number; target: string; raw: boolean }
  /** A markdown link's label (preview) or URL (raw), or a bare URL. */
  | { kind: 'link'; from: number; to: number; url: string; raw: boolean }
  /** A pull request, work item, thread or workstream to show as a chip. */
  | {
      kind: 'chip';
      from: number;
      to: number;
      token: RefToken;
      url: string | null;
      label: Span | null;
    }
  /** The same reference on an edited line: styled, never replaced. */
  | { kind: 'ref'; from: number; to: number; token: RefToken; url: string | null }
  | { kind: 'tag'; from: number; to: number; tag: string }
  /** A task's `- [ ]` (or the `[ ]` after a number), drawn as a checkbox. */
  | { kind: 'task'; from: number; to: number; done: boolean }
  /** A bullet list's `-`, `*` or `+`. */
  | { kind: 'bullet'; from: number; to: number }
  /** A line that is one HTML comment opening a block (`<!-- borgdock:since … -->`), drawn as a faint label. */
  | { kind: 'marker'; from: number; to: number; label: string };

export interface PreviewOptions {
  /** The syntax tree of `doc`; parsed from the text when absent. */
  tree?: ReturnType<typeof syntaxTree>;
  /** Only these parts of the document (the viewport); the whole document when absent. */
  ranges?: readonly Span[];
}

const FENCE = /^---\s*$/;
/** What a frontmatter line can look like before its closing `---`. */
const PROPERTY_LINE = /^(?:\s*$|\s*#|[\w-]+\s*:|\s+\S)/;
const BULLET = /^[-*+]$/;
const TASK_BOX = /^(\s*(?:[-*+]|\d+[.)]) +\[)([ xX])\](?=\s|$)/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])(?: +|$)/;
const COMMENT_LINE = /^\s*<!--\s*(\/?)([\s\S]*?)-->\s*$/;
const QUOTES = new Set(['"', "'"]);

/**
 * YAML between `---` lines at the very top is a block of its own, so the
 * markdown parser never reads its closing `---` as a setext heading.
 */
const frontmatterSyntax: MarkdownConfig = {
  defineNodes: [{ name: 'Frontmatter', block: true, style: tags.meta }],
  parseBlock: [
    {
      name: 'Frontmatter',
      before: 'HorizontalRule',
      parse(cx: BlockContext, line: MarkdownLine) {
        if (cx.lineStart !== 0 || !FENCE.test(line.text)) return false;
        let to = line.text.length;
        while (cx.nextLine()) {
          const closing = FENCE.test(line.text);
          if (!closing && !PROPERTY_LINE.test(line.text)) break;
          to = cx.lineStart + line.text.length;
          if (closing) {
            cx.nextLine();
            break;
          }
        }
        cx.addElement(cx.elt('Frontmatter', 0, to));
        return true;
      },
    },
  ],
};

const noteLanguage = markdown({
  base: markdownLanguage,
  extensions: [frontmatterSyntax],
  completeHTMLTags: false,
});

/** Markdown (GFM) with frontmatter, Enter continuing lists and Backspace removing markup. */
export function noteMarkdown() {
  return noteLanguage;
}

function overlaps(a: Span, b: Span): boolean {
  return a.from < b.to && b.from < a.to;
}

/** Each range widened to whole lines, sorted and merged. */
function lineAligned(doc: Text, ranges: readonly Span[]): Span[] {
  const aligned = ranges
    .map((r) => ({
      from: doc.lineAt(Math.max(0, Math.min(r.from, doc.length))).from,
      to: doc.lineAt(Math.max(0, Math.min(r.to, doc.length))).to,
    }))
    .sort((a, b) => a.from - b.from);
  const merged: Span[] = [];
  for (const range of aligned) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to + 1) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  return merged;
}

function rawLineTest(doc: Text, selection: readonly Span[]): (line: number) => boolean {
  const clamp = (pos: number) => Math.max(0, Math.min(pos, doc.length));
  const spans = selection.map((r) => [
    doc.lineAt(clamp(Math.min(r.from, r.to))).number,
    doc.lineAt(clamp(Math.max(r.from, r.to))).number,
  ]);
  return (line) => spans.some(([first, last]) => line >= first! && line <= last!);
}

/**
 * Decorations from the syntax tree or from one inline token. A container is
 * a link, URL or image: tokens inside one belong to it. A link token (a T3
 * thread or workstream address) is itself a markdown link and wins over the
 * container the tree sees.
 */
interface Group extends Span {
  ranges: PreviewRange[];
  container?: boolean;
  linkToken?: boolean;
}

function hide(from: number, to: number): PreviewRange {
  return { kind: 'hide', from, to };
}

function isSpace(doc: Text, pos: number): boolean {
  return /[ \t]/.test(doc.sliceString(pos, pos + 1));
}

/** The address inside a `[label](address)` token. */
function addressOf(raw: string): string {
  return raw.slice(raw.indexOf('](') + 2, -1);
}

function tokenGroups(
  line: { from: number; text: string },
  preview: boolean,
  groups: Group[],
  tags = true,
): void {
  // Like the vault index: a heading's `#`s are never a tag.
  const source = line.text.replace(/^#{1,6}(?=\s|$)/, (m) => ' '.repeat(m.length));
  for (const token of scanLine(source)) {
    const from = line.from + token.from;
    const to = line.from + token.to;
    const raw = line.text.slice(token.from, token.to);
    if (token.kind === 'tag') {
      if (tags) groups.push({ from, to, ranges: [{ kind: 'tag', from, to, tag: token.tag }] });
    } else if (token.kind === 'wikilink') {
      if (!preview) {
        groups.push({
          from,
          to,
          ranges: [{ kind: 'wikilink', from, to, target: token.target, raw: true }],
        });
        continue;
      }
      const bar = raw.indexOf('|');
      const labelFrom = bar >= 0 ? from + bar + 1 : from + 2;
      const labelTo = to - 2;
      groups.push({
        from,
        to,
        ranges: [
          hide(from, labelFrom),
          { kind: 'wikilink', from: labelFrom, to: labelTo, target: token.target, raw: false },
          hide(labelTo, to),
        ],
      });
    } else if (isRefToken(token)) {
      if ((token.kind === 'pr' || token.kind === 'ado') && token.url) continue;
      const linkToken = token.kind === 't3' || token.kind === 'workstream';
      const url = linkToken ? addressOf(raw) : null;
      if (!preview) {
        groups.push({ from, to, linkToken, ranges: [{ kind: 'ref', from, to, token, url }] });
        continue;
      }
      const labelTo = linkToken ? from + raw.indexOf('](') : from;
      const label = labelTo > from + 1 ? { from: from + 1, to: labelTo } : null;
      groups.push({ from, to, linkToken, ranges: [{ kind: 'chip', from, to, token, url, label }] });
    }
  }
}

/**
 * References in frontmatter values, as in the body but without tags (the
 * vault index reads tags from `tags:` only). A value that is exactly one
 * quoted reference (`workstream: "[Q4](borgdock://…)"`) loses its quotes
 * on a preview line too.
 */
function frontmatterGroups(
  line: { from: number; text: string },
  preview: boolean,
  groups: Group[],
): void {
  const start = groups.length;
  tokenGroups(line, preview, groups, false);
  if (!preview) return;
  for (const group of groups.slice(start)) {
    const before = line.text[group.from - line.from - 1];
    const after = line.text[group.to - line.from];
    if (!before || before !== after || !QUOTES.has(before)) continue;
    group.ranges.push(hide(group.from - 1, group.from), hide(group.to, group.to + 1));
    group.from -= 1;
    group.to += 1;
  }
}

/** A comment line opening a block shows a faint label; the one closing it disappears. */
function commentLine(line: { from: number; to: number; text: string }): Group | null {
  const match = COMMENT_LINE.exec(line.text);
  if (!match) return null;
  const { from, to } = line;
  if (match[1]) return { from, to, ranges: [hide(from, to)] };
  const label = /^borgdock:/i.test(match[2]!.trim()) ? 'BorgDock' : 'Comment';
  return { from, to, ranges: [{ kind: 'marker', from, to, label }] };
}

function collectRange(
  doc: Text,
  tree: ReturnType<typeof syntaxTree>,
  range: Span,
  isRaw: (line: number) => boolean,
  lineClasses: Map<number, Set<string>>,
  out: PreviewRange[],
): void {
  const addLineClass = (pos: number, className: string) => {
    const from = doc.lineAt(pos).from;
    const classes = lineClasses.get(from) ?? new Set<string>();
    for (const name of className.split(' ')) classes.add(name);
    lineClasses.set(from, classes);
  };
  const eachLine = (
    from: number,
    to: number,
    visit: (line: ReturnType<Text['lineAt']>) => void,
  ) => {
    for (let pos = Math.max(from, range.from); pos <= Math.min(to, range.to); ) {
      const line = doc.lineAt(pos);
      visit(line);
      pos = line.to + 1;
    }
  };
  const preview = (pos: number) => !isRaw(doc.lineAt(pos).number);
  const sameLine = (from: number, to: number) => doc.lineAt(from).number === doc.lineAt(to).number;
  /** Blocks whose text holds no inline references. */
  const opaque: Span[] = [];
  const syntax: Group[] = [];
  const tokens: Group[] = [];
  const hideGroup = (from: number, to: number) => {
    if (to > from) syntax.push({ from, to, ranges: [hide(from, to)] });
  };

  const enter = (node: SyntaxNodeRef): boolean | undefined => {
    const name = node.name;
    switch (name) {
      case 'Frontmatter': {
        const first = doc.lineAt(node.from);
        const last = doc.lineAt(node.to);
        const closed = last.number > first.number && FENCE.test(last.text);
        eachLine(node.from, node.to, (line) => {
          const fence = line.number === first.number || (closed && line.number === last.number);
          if (closed) {
            addLineClass(
              line.from,
              fence ? 'bd-note-frontmatter bd-note-frontmatter-fence' : 'bd-note-frontmatter',
            );
          }
          if (!fence) frontmatterGroups(line, !isRaw(line.number), tokens);
        });
        opaque.push({ from: node.from, to: node.to });
        return false;
      }
      case 'FencedCode':
      case 'CodeBlock': {
        const first = doc.lineAt(node.from).number;
        const close = node.node.lastChild;
        const last =
          name === 'FencedCode' && close?.name === 'CodeMark' ? doc.lineAt(close.from).number : -1;
        eachLine(node.from, node.to, (line) =>
          addLineClass(
            line.from,
            name === 'FencedCode' &&
              (line.number === first || (line.number === last && last !== first))
              ? 'bd-note-codeblock bd-note-codeblock-fence'
              : 'bd-note-codeblock',
          ),
        );
        opaque.push({ from: node.from, to: node.to });
        return false;
      }
      case 'CommentBlock':
        eachLine(node.from, node.to, (line) => {
          const marker = isRaw(line.number) ? null : commentLine(line);
          if (!marker) return;
          syntax.push(marker);
          // A closing marker's line folds away instead of leaving a blank line.
          if (marker.ranges[0]?.kind === 'hide') addLineClass(line.from, 'bd-note-marker-end');
        });
        opaque.push({ from: node.from, to: node.to });
        return false;
      case 'HTMLBlock':
      case 'ProcessingInstructionBlock':
      case 'LinkReference':
        opaque.push({ from: node.from, to: node.to });
        return false;
      case 'Image':
        syntax.push({ from: node.from, to: node.to, ranges: [], container: true });
        return false;
      case 'Blockquote':
        eachLine(node.from, node.to, (line) => addLineClass(line.from, 'bd-note-quote'));
        return undefined;
      case 'QuoteMark':
        if (preview(node.from)) hideGroup(node.from, node.to + (isSpace(doc, node.to) ? 1 : 0));
        return undefined;
      case 'HorizontalRule':
        if (preview(node.from)) {
          addLineClass(node.from, 'bd-note-hr');
          hideGroup(node.from, node.to);
        }
        return false;
      case 'Task': {
        const marker = node.node.getChild('TaskMarker');
        if (!marker) return undefined;
        const done = /x/i.test(doc.sliceString(marker.from + 1, marker.from + 2));
        addLineClass(node.from, done ? 'bd-note-task bd-note-task-done' : 'bd-note-task');
        if (preview(node.from)) {
          const listMark = node.node.parent?.getChild('ListMark');
          const bullet = listMark && BULLET.test(doc.sliceString(listMark.from, listMark.to));
          const from = bullet && listMark ? listMark.from : marker.from;
          syntax.push({
            from,
            to: marker.to,
            ranges: [{ kind: 'task', from, to: marker.to, done }],
          });
        }
        return undefined;
      }
      case 'ListMark': {
        const item = node.node.parent;
        if (item?.getChild('Task') || item?.parent?.name !== 'BulletList') return undefined;
        if (preview(node.from) && BULLET.test(doc.sliceString(node.from, node.to))) {
          syntax.push({
            from: node.from,
            to: node.to,
            ranges: [{ kind: 'bullet', from: node.from, to: node.to }],
          });
        }
        return undefined;
      }
      case 'EmphasisMark':
      case 'StrikethroughMark':
        if (preview(node.from)) hideGroup(node.from, node.to);
        return undefined;
      case 'CodeMark':
        if (node.node.parent?.name === 'InlineCode' && preview(node.from))
          hideGroup(node.from, node.to);
        return undefined;
      case 'Link': {
        const url = node.node.getChild('URL');
        const marks = node.node.getChildren('LinkMark');
        if (!url || marks.length < 2) return undefined;
        const address = doc.sliceString(url.from, url.to);
        const labelFrom = marks[0]!.to;
        const labelTo = marks[1]!.from;
        const span = { from: node.from, to: node.to, container: true };
        if (preview(node.from) && labelTo > labelFrom && sameLine(node.from, node.to)) {
          syntax.push({
            ...span,
            ranges: [
              hide(node.from, labelFrom),
              { kind: 'link', from: labelFrom, to: labelTo, url: address, raw: false },
              hide(labelTo, node.to),
            ],
          });
        } else {
          syntax.push({
            ...span,
            ranges: [{ kind: 'link', from: url.from, to: url.to, url: address, raw: true }],
          });
        }
        return undefined;
      }
      case 'Autolink':
        if (preview(node.from)) {
          for (const mark of node.node.getChildren('LinkMark')) hideGroup(mark.from, mark.to);
        }
        return undefined;
      case 'URL': {
        const parent = node.node.parent?.name;
        if (parent === 'Link' || parent === 'Image') return undefined;
        syntax.push({
          from: node.from,
          to: node.to,
          container: true,
          ranges: [
            {
              kind: 'link',
              from: node.from,
              to: node.to,
              url: doc.sliceString(node.from, node.to),
              raw: !preview(node.from),
            },
          ],
        });
        return undefined;
      }
    }
    const heading = /^ATXHeading(\d)$/.exec(name);
    if (heading) {
      addLineClass(node.from, `bd-note-heading bd-note-heading-${heading[1]}`);
      if (!preview(node.from)) return undefined;
      node.node.getChildren('HeaderMark').forEach((mark, i) => {
        if (i === 0) {
          let to = mark.to;
          while (to < node.to && isSpace(doc, to)) to++;
          hideGroup(mark.from, to);
        } else {
          let from = mark.from;
          while (from > node.from && isSpace(doc, from - 1)) from--;
          hideGroup(from, mark.to);
        }
      });
      return undefined;
    }
    const setext = /^SetextHeading(\d)$/.exec(name);
    if (setext) addLineClass(node.from, `bd-note-heading bd-note-heading-${setext[1]}`);
    return undefined;
  };

  tree.iterate({ from: range.from, to: range.to, enter });

  eachLine(range.from, range.to, (line) => {
    if (opaque.some((block) => line.from >= block.from && line.to <= block.to)) return;
    tokenGroups(line, !isRaw(line.number), tokens);
  });

  const containers = syntax.filter((group) => group.container);
  const keptTokens = tokens.filter(
    (token) => token.linkToken || !containers.some((container) => overlaps(container, token)),
  );
  const keptSyntax = syntax.filter((group) => !keptTokens.some((token) => overlaps(group, token)));
  for (const group of [...keptTokens, ...keptSyntax]) {
    for (const r of group.ranges) if (r.to > r.from) out.push(r);
  }
}

/**
 * What live preview draws for `doc` with `selection`: lines the selection
 * touches stay raw (only line classes, tags and clickable raw references);
 * every other line hides its syntax and renders references in place.
 * Pass an empty selection to preview every line.
 */
export function previewRanges(
  doc: string | Text,
  selection: Span | readonly Span[],
  options: PreviewOptions = {},
): PreviewRange[] {
  const text = typeof doc === 'string' ? Text.of(doc.split('\n')) : doc;
  const tree =
    options.tree ??
    noteLanguage.language.parser.parse(typeof doc === 'string' ? doc : doc.toString());
  const isRaw = rawLineTest(text, 'from' in selection ? [selection] : selection);
  const lineClasses = new Map<number, Set<string>>();
  const out: PreviewRange[] = [];
  for (const range of lineAligned(text, options.ranges ?? [{ from: 0, to: text.length }])) {
    collectRange(text, tree, range, isRaw, lineClasses, out);
  }
  for (const [from, classes] of lineClasses) {
    out.push({ kind: 'line', from, to: from, className: [...classes].join(' ') });
  }
  return out.sort((a, b) => a.from - b.from || a.to - b.to);
}

/** The edit that ticks or unticks the task on a line; `null` when the line holds no task. */
export function flipTask(lineText: string): { from: number; to: number; insert: string } | null {
  const match = TASK_BOX.exec(lineText);
  if (!match) return null;
  const at = match[1]!.length;
  return { from: at, to: at + 1, insert: match[2] === ' ' ? 'x' : ' ' };
}

/** Mod-Enter: a task flips; a list item or a plain line becomes an open task. */
export function toggleTaskEdit(lineText: string): { from: number; to: number; insert: string } {
  const flip = flipTask(lineText);
  if (flip) return flip;
  const item = LIST_ITEM.exec(lineText);
  if (item) {
    const at = item[0].length;
    return { from: at, to: at, insert: item[0].endsWith(' ') ? '[ ] ' : ' [ ] ' };
  }
  const indent = /^\s*/.exec(lineText)![0].length;
  return { from: indent, to: indent, insert: '- [ ] ' };
}

/** Toggles the task on every line the selection touches. */
export const toggleTask: Command = (view) => {
  const { state } = view;
  if (state.readOnly) return false;
  const changes: ChangeSpec[] = [];
  const seen = new Set<number>();
  for (const range of state.selection.ranges) {
    for (let pos = range.from; pos <= range.to; ) {
      const line = state.doc.lineAt(pos);
      if (!seen.has(line.number)) {
        seen.add(line.number);
        const edit = toggleTaskEdit(line.text);
        changes.push({ from: line.from + edit.from, to: line.from + edit.to, insert: edit.insert });
      }
      pos = line.to + 1;
    }
  }
  const changeSet = state.changes(changes);
  view.dispatch({
    changes: changeSet,
    selection: state.selection.map(changeSet, 1),
    scrollIntoView: true,
    userEvent: 'input',
  });
  return true;
};

function flipTaskAt(view: EditorView, pos: number): void {
  const line = view.state.doc.lineAt(pos);
  const edit = flipTask(line.text);
  if (!edit) return;
  view.dispatch({
    changes: { from: line.from + edit.from, to: line.from + edit.to, insert: edit.insert },
    userEvent: 'input',
  });
}

export interface LivePreviewHandlers {
  /** A node for the chip, or `null` to leave the reference as styled text. */
  renderChip(token: RefToken): HTMLElement | null;
  openLink(target: string): void;
  openUrl(url: string): void;
}

/** Ask the editor to render its chips again (the chip renderer changed). */
export const refreshChips = StateEffect.define<null>();

function chipKey(token: RefToken): string {
  switch (token.kind) {
    case 'ado':
      return `ado:${token.organization ?? ''}/${token.project ?? ''}/${token.id}`;
    case 'pr':
      return `pr:${token.owner ?? ''}/${token.repo}/${token.number}`;
    case 't3':
      return `t3:${token.environmentId}/${token.threadId}|${token.label}`;
    case 'workstream':
      return `workstream:${token.id}|${token.label}`;
  }
}

const CHIP_CACHE_LIMIT = 500;

/**
 * Chip nodes, one render per reference: the first is kept so the widget
 * that shows it does not render it twice, and is used again whenever no
 * widget holds it (scrolled away and back).
 */
class ChipNodes {
  generation = 0;
  private readonly nodes = new Map<string, HTMLElement | null>();

  constructor(private readonly render: (token: RefToken) => HTMLElement | null) {}

  renders(key: string, token: RefToken): boolean {
    if (!this.nodes.has(key)) {
      if (this.nodes.size >= CHIP_CACHE_LIMIT) this.nodes.clear();
      this.nodes.set(key, this.render(token));
    }
    return this.nodes.get(key) != null;
  }

  take(key: string, token: RefToken): HTMLElement | null {
    const kept = this.nodes.get(key);
    if (kept && !kept.parentNode) return kept;
    return this.render(token);
  }

  reset(): void {
    this.nodes.clear();
    this.generation++;
  }
}

class ChipWidget extends WidgetType {
  constructor(
    readonly key: string,
    readonly token: RefToken,
    readonly text: string,
    readonly url: string | null,
    readonly generation: number,
    readonly nodes: ChipNodes,
    readonly openUrl: (url: string) => void,
  ) {
    super();
  }

  eq(other: ChipWidget): boolean {
    return other.key === this.key && other.generation === this.generation && other.url === this.url;
  }

  toDOM(): HTMLElement {
    const slot = document.createElement('span');
    slot.className = 'bd-note-chip-slot';
    const node = this.nodes.take(this.key, this.token);
    if (node) slot.append(node);
    else {
      slot.classList.add('bd-note-ref');
      slot.textContent = this.text;
    }
    const url = this.url;
    if (url) slot.dataset.noteUrl = url;
    // The editor ignores events inside a chip: a click never moves the
    // cursor into the line (which would turn the chip back into text).
    slot.addEventListener('mousedown', (event) => {
      if (event.button === 0) event.preventDefault();
    });
    slot.addEventListener('click', (event) => {
      if (url && !event.defaultPrevented) this.openUrl(url);
    });
    return slot;
  }

  ignoreEvent(): boolean {
    return true;
  }

  destroy(dom: HTMLElement): void {
    // Frees the kept node for the next widget that shows this reference.
    dom.replaceChildren();
  }
}

class TaskWidget extends WidgetType {
  constructor(readonly done: boolean) {
    super();
  }

  eq(other: TaskWidget): boolean {
    return other.done === this.done;
  }

  toDOM(): HTMLElement {
    const box = document.createElement('span');
    box.className = 'bd-note-task-box';
    box.setAttribute('role', 'checkbox');
    box.setAttribute('aria-checked', String(this.done));
    box.dataset.done = String(this.done);
    return box;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class BulletWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const bullet = document.createElement('span');
    bullet.className = 'bd-note-bullet';
    bullet.setAttribute('aria-hidden', 'true');
    return bullet;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class MarkerWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }

  eq(other: MarkerWidget): boolean {
    return other.label === this.label;
  }

  toDOM(): HTMLElement {
    const marker = document.createElement('span');
    marker.className = 'bd-note-marker';
    marker.textContent = this.label;
    return marker;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

const hidden = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const tasks = {
  open: Decoration.replace({ widget: new TaskWidget(false) }),
  done: Decoration.replace({ widget: new TaskWidget(true) }),
};

function linkAttributes(data: Record<string, string>, raw: boolean): Record<string, string> {
  return raw ? { ...data, 'data-note-raw': '' } : data;
}

class LivePreview {
  decorations: DecorationSet;
  private readonly chips: ChipNodes;

  constructor(
    view: EditorView,
    private readonly handlers: LivePreviewHandlers,
  ) {
    this.chips = new ChipNodes((token) => handlers.renderChip(token));
    this.decorations = this.build(view);
  }

  update(update: ViewUpdate): void {
    const refresh = update.transactions.some((tr) => tr.effects.some((e) => e.is(refreshChips)));
    if (refresh) this.chips.reset();
    if (
      refresh ||
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged ||
      update.focusChanged ||
      update.startState.readOnly !== update.state.readOnly ||
      syntaxTree(update.startState) !== syntaxTree(update.state)
    ) {
      this.decorations = this.build(update.view);
    }
  }

  private build(view: EditorView): DecorationSet {
    const { state } = view;
    // Unfocused or read-only, the note reads as a page: no line is being edited.
    const editing = view.hasFocus && !state.readOnly;
    const ranges = previewRanges(state.doc, editing ? state.selection.ranges : [], {
      tree: syntaxTree(state),
      ranges: view.visibleRanges,
    });
    const decorations: Range<Decoration>[] = [];
    for (const r of ranges) this.decorate(r, state.doc, decorations);
    return Decoration.set(decorations, true);
  }

  private decorate(r: PreviewRange, doc: Text, out: Range<Decoration>[]): void {
    switch (r.kind) {
      case 'hide':
        out.push(hidden.range(r.from, r.to));
        return;
      case 'line':
        out.push(Decoration.line({ class: r.className }).range(r.from));
        return;
      case 'wikilink':
        out.push(
          Decoration.mark({
            class: 'bd-note-wikilink',
            attributes: linkAttributes({ 'data-note-target': r.target }, r.raw),
          }).range(r.from, r.to),
        );
        return;
      case 'link':
        out.push(
          Decoration.mark({
            class: 'bd-note-link',
            attributes: linkAttributes({ 'data-note-url': r.url }, r.raw),
          }).range(r.from, r.to),
        );
        return;
      case 'ref':
        out.push(this.refMark(r.url, true).range(r.from, r.to));
        return;
      case 'tag':
        out.push(
          Decoration.mark({ class: 'bd-note-tag', attributes: { 'data-note-tag': r.tag } }).range(
            r.from,
            r.to,
          ),
        );
        return;
      case 'task':
        out.push((r.done ? tasks.done : tasks.open).range(r.from, r.to));
        return;
      case 'bullet':
        out.push(bullet.range(r.from, r.to));
        return;
      case 'marker':
        out.push(Decoration.replace({ widget: new MarkerWidget(r.label) }).range(r.from, r.to));
        return;
      case 'chip': {
        const key = chipKey(r.token);
        if (this.chips.renders(key, r.token)) {
          const widget = new ChipWidget(
            key,
            r.token,
            doc.sliceString(r.from, r.to),
            r.url,
            this.chips.generation,
            this.chips,
            (url) => this.handlers.openUrl(url),
          );
          out.push(Decoration.replace({ widget }).range(r.from, r.to));
        } else if (r.label) {
          out.push(hidden.range(r.from, r.label.from));
          out.push(this.refMark(r.url, false).range(r.label.from, r.label.to));
          out.push(hidden.range(r.label.to, r.to));
        } else {
          out.push(this.refMark(r.url, false).range(r.from, r.to));
        }
        return;
      }
    }
  }

  private refMark(url: string | null, raw: boolean): Decoration {
    return Decoration.mark({
      class: 'bd-note-ref',
      attributes: url ? linkAttributes({ 'data-note-url': url }, raw) : undefined,
    });
  }
}

function onMouseDown(event: MouseEvent, view: EditorView, handlers: LivePreviewHandlers): boolean {
  if (event.button !== 0 || !(event.target instanceof Element)) return false;
  const box = event.target.closest('.bd-note-task-box');
  if (box) {
    if (!view.state.readOnly) flipTaskAt(view, view.posAtDOM(box));
    return true;
  }
  const link = event.target.closest<HTMLElement>('[data-note-target],[data-note-url]');
  if (!link || !view.contentDOM.contains(link)) return false;
  if (link.hasAttribute('data-note-raw') && !(event.ctrlKey || event.metaKey)) return false;
  const { noteTarget, noteUrl } = link.dataset;
  if (noteTarget !== undefined) handlers.openLink(noteTarget);
  else if (noteUrl) handlers.openUrl(noteUrl);
  return true;
}

/**
 * Live preview over the visible part of the note, and the clicks it
 * handles: a `[[link]]`, a link or a checkbox on a preview line, and
 * Ctrl/Cmd-click on the same references on a line being edited.
 */
export function livePreview(handlers: LivePreviewHandlers): Extension {
  return [
    ViewPlugin.define((view) => new LivePreview(view, handlers), {
      decorations: (plugin) => plugin.decorations,
    }),
    EditorView.domEventHandlers({
      mousedown: (event, view) => onMouseDown(event, view, handlers),
    }),
  ];
}
