/**
 * Autocomplete in the notes editor: `[[` (notes, then T3 threads and
 * workstreams), `AB#` (work items), `#` (tags) and `/` (templates). Each
 * source is a function of the completion context and the caller's lists, so
 * a test drives it with a plain `CompletionContext`.
 */
import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSection,
  type CompletionSource,
  insertCompletionText,
  pickedCompletion,
} from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';
import type { NoteCompletionSources } from './NoteEditor';

const WORK_ITEM_LIMIT = 50;
const CODE = new Set(['FencedCode', 'CodeBlock', 'InlineCode', 'CodeText']);

const NOTES: CompletionSection = { name: 'Notes', rank: 0 };
const THREADS: CompletionSection = { name: 'T3 threads', rank: 1 };
const WORKSTREAMS: CompletionSection = { name: 'Workstreams', rank: 2 };

type Apply = (view: EditorView, completion: Completion, from: number, to: number) => void;

/** Replaces `back` characters before `from` up to `to` (and a `]]` right after it) with `text`. */
function replaceWith(text: string, back: number, closing: string | null): Apply {
  return (view, completion, from, to) => {
    const end =
      closing && view.state.sliceDoc(to, to + closing.length) === closing
        ? to + closing.length
        : to;
    view.dispatch({
      ...insertCompletionText(view.state, text, from - back, end),
      annotations: pickedCompletion.of(completion),
    });
  };
}

function folderOf(path: string): string | undefined {
  const slash = path.lastIndexOf('/');
  return slash > 0 ? path.slice(0, slash) : undefined;
}

/** A label that cannot break the `[label](address)` it goes into. */
function linkLabel(label: string): string {
  return label
    .replace(/[[\]\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inCode(context: CompletionContext): boolean {
  const start = syntaxTree(context.state).resolveInner(context.pos, -1);
  for (let node: typeof start | null = start; node; node = node.parent) {
    if (CODE.has(node.name)) return true;
  }
  return false;
}

/** `[[query`: note titles insert `Title]]`; threads and workstreams become `[label](address)`. */
export function wikilinkCompletions(
  context: CompletionContext,
  sources: NoteCompletionSources,
): CompletionResult | null {
  const match = context.matchBefore(/\[\[[^\]\n|#]*$/);
  if (!match) return null;
  const options: Completion[] = [
    ...sources.notes().map((note) => ({
      label: note.title,
      detail: folderOf(note.path),
      type: 'note',
      section: NOTES,
      apply: replaceWith(`${note.title}]]`, 0, ']]'),
    })),
    ...sources.threads().map((thread) => ({
      label: thread.label,
      detail: 'T3 thread',
      type: 'thread',
      section: THREADS,
      apply: replaceWith(`[${linkLabel(thread.label)}](${thread.url})`, 2, ']]'),
    })),
    ...sources.workstreams().map((workstream) => ({
      label: workstream.label,
      detail: 'Workstream',
      type: 'workstream',
      section: WORKSTREAMS,
      apply: replaceWith(`[${linkLabel(workstream.label)}](${workstream.url})`, 2, ']]'),
    })),
  ];
  if (!options.length) return null;
  return { from: match.from + 2, options, validFor: /^[^\]\n|#]*$/ };
}

/** `AB#query`: work items whose id starts with the query or whose title holds it; inserts the id. */
export function workItemCompletions(
  context: CompletionContext,
  sources: NoteCompletionSources,
): CompletionResult | null {
  const match = context.matchBefore(/(?<![\w#/])AB#[\w-]*$/i);
  if (!match) return null;
  const query = match.text.slice(3).toLowerCase();
  const ranked = sources
    .workItems()
    .map((item) => {
      if (!query) return { item, rank: 0 };
      if (String(item.id).startsWith(query)) return { item, rank: 0 };
      return { item, rank: item.title.toLowerCase().includes(query) ? 1 : -1 };
    })
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, WORK_ITEM_LIMIT);
  if (!ranked.length) return null;
  return {
    from: match.from + 3,
    // Matching ids and titles is done here; the label is only the id.
    filter: false,
    options: ranked.map(({ item }) => ({
      label: String(item.id),
      detail: item.title,
      type: 'workitem',
      apply: String(item.id),
    })),
  };
}

/** `#query` at the start of a word: tags. At the start of a line a bare `#` is a heading. */
export function tagCompletions(
  context: CompletionContext,
  sources: NoteCompletionSources,
): CompletionResult | null {
  const match = context.matchBefore(/(?<![\w#/&])#[\w/-]*$/);
  if (!match) return null;
  const line = context.state.doc.lineAt(context.pos);
  const lineStart = !context.state.sliceDoc(line.from, match.from).trim();
  if (match.text.length === 1 && lineStart && !context.explicit) return null;
  const options = sources.tags().map((tag) => ({ label: tag, type: 'tag' }));
  if (!options.length) return null;
  return { from: match.from + 1, options, validFor: /^[\w/-]*$/ };
}

/** `/query` at the start of a line or after a space: templates, replacing the `/query`. */
export function templateCompletions(
  context: CompletionContext,
  sources: NoteCompletionSources,
): CompletionResult | null {
  const match = context.matchBefore(/(?<=^|\s)\/[\w-]*$/);
  if (!match) return null;
  const options = sources.templates().map((template) => ({
    label: template.name,
    detail: 'Template',
    type: 'template',
    apply: replaceWith(template.text, 1, null),
  }));
  if (!options.length) return null;
  return { from: match.from + 1, options, validFor: /^[\w-]*$/ };
}

/** Every notes source, reading the caller's current lists; none of them complete inside code. */
export function noteCompletionSources(sources: () => NoteCompletionSources): CompletionSource[] {
  return [wikilinkCompletions, workItemCompletions, tagCompletions, templateCompletions].map(
    (complete) => (context: CompletionContext) =>
      inCode(context) ? null : complete(context, sources()),
  );
}
