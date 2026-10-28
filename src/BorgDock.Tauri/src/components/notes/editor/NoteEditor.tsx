import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Annotation, Compartment, EditorState, Transaction } from '@codemirror/state';
import { drawSelection, EditorView, keymap } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { type JSX, useEffect, useRef } from 'react';
import type { InlineToken } from '@/services/notes/parse';
import { readCspNonce } from '@/utils/csp-nonce';
import { noteCompletionSources } from './completions';
import {
  type LivePreviewHandlers,
  livePreview,
  noteMarkdown,
  refreshChips,
  toggleTask,
} from './live-preview';

/** A DOM node for a chip, or `null` to leave the raw text styled as a reference. */
export type ChipRenderer = (token: InlineToken) => HTMLElement | null;

export interface NoteCompletionSources {
  notes(): { title: string; path: string }[];
  tags(): string[];
  workItems(): { id: number; title: string }[];
  /** `url` like `t3code://threads/<environmentId>/<threadId>`. */
  threads(): { label: string; url: string }[];
  /** `url` like `borgdock://workstreams/<id>`. */
  workstreams(): { label: string; url: string }[];
  /** `text` already filled in. */
  templates(): { name: string; text: string }[];
}

export interface NoteEditorProps {
  /** Identity of the open note; a new path replaces the doc and resets undo history. */
  path: string;
  /** When it differs from the doc (an external change), the doc follows; the cursor stays put. */
  text: string;
  onChange(text: string): void;
  renderChip: ChipRenderer;
  /** `[[target]]` clicked: a plain click on a preview line, Ctrl/Cmd-click on a line being edited. */
  onOpenLink(target: string): void;
  /** A `t3code://`, `borgdock://` or `http(s)` link clicked. */
  onOpenUrl?(url: string): void;
  completions: NoteCompletionSources;
  readOnly?: boolean;
  autoFocus?: boolean;
  className?: string;
  ariaLabel?: string;
}

// Classes, not inline colours: notes-editor.css styles them from the tokens.
const noteHighlighting = HighlightStyle.define([
  { tag: tags.heading1, class: 'bd-note-h1' },
  { tag: tags.heading2, class: 'bd-note-h2' },
  { tag: tags.heading3, class: 'bd-note-h3' },
  { tag: tags.heading4, class: 'bd-note-h4' },
  { tag: tags.heading5, class: 'bd-note-h5' },
  { tag: tags.heading6, class: 'bd-note-h6' },
  { tag: tags.emphasis, class: 'bd-note-em' },
  { tag: tags.strong, class: 'bd-note-strong' },
  { tag: tags.strikethrough, class: 'bd-note-strike' },
  { tag: tags.monospace, class: 'bd-note-code' },
  { tag: tags.link, class: 'bd-note-link-text' },
  { tag: tags.url, class: 'bd-note-url' },
  { tag: tags.processingInstruction, class: 'bd-note-syntax' },
  { tag: tags.quote, class: 'bd-note-quote-text' },
  { tag: tags.meta, class: 'bd-note-meta' },
  { tag: tags.comment, class: 'bd-note-comment' },
  { tag: tags.labelName, class: 'bd-note-label' },
]);

// CodeMirror injects its base theme unlayered, so the layered rules in
// notes-editor.css cannot override what it sets (fonts, paddings, tooltip
// and selection colours). Those few overrides live here, as tokens only.
const noteTheme = EditorView.theme({
  '&': { height: '100%', color: 'var(--color-text-primary)', backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-reading)', fontSize: '14px', lineHeight: '1.65' },
  '.cm-content': { padding: '16px 0 96px', caretColor: 'var(--color-text-primary)' },
  '.cm-line': { padding: '0 24px' },
  '.cm-line.bd-note-heading': { paddingTop: '0.45em' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-text-primary)' },
  '.cm-selectionLayer .cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground':
    { background: 'var(--color-code-selection)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--color-modal-bg)',
    border: '1px solid var(--color-modal-border)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--elevation-2)',
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily: 'var(--font-ui)',
    fontSize: '12.5px',
    minWidth: '240px',
    maxHeight: '18em',
    padding: '4px',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    padding: '4px 8px',
    borderRadius: 'var(--radius-sm)',
    lineHeight: '1.4',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    background: 'var(--color-accent-subtle)',
    color: 'var(--color-text-primary)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > completion-section': {
    padding: '6px 8px 2px',
    borderBottom: 'none',
    color: 'var(--color-text-muted)',
    fontSize: '10.5px',
    fontWeight: '600',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  '.cm-completionDetail': {
    marginLeft: '8px',
    fontStyle: 'normal',
    color: 'var(--color-text-muted)',
  },
  '.cm-completionMatchedText': {
    textDecoration: 'none',
    color: 'var(--color-accent)',
    fontWeight: '600',
  },
});

/** Marks a transaction that brings the doc in line with the `text` prop. */
const externalChange = Annotation.define<boolean>();
const settings = new Compartment();

function settingsOf(readOnly: boolean, ariaLabel: string | undefined) {
  return [
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    EditorView.contentAttributes.of({ 'aria-label': ariaLabel ?? 'Note', spellcheck: 'true' }),
  ];
}

/** The smallest single change that turns `before` into `after`. */
function changeBetween(before: string, after: string) {
  const shortest = Math.min(before.length, after.length);
  let start = 0;
  while (start < shortest && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  let end = 0;
  while (
    end < shortest - start &&
    before.charCodeAt(before.length - 1 - end) === after.charCodeAt(after.length - 1 - end)
  ) {
    end++;
  }
  return { from: start, to: before.length - end, insert: after.slice(start, after.length - end) };
}

export function NoteEditor(props: NoteEditorProps): JSX.Element {
  const { path, text, renderChip, readOnly = false, ariaLabel, className } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const createStateRef = useRef<((doc: string) => EditorState) | null>(null);
  const latest = useRef(props);
  /** The note and text the view holds. */
  const shown = useRef({ path, text });
  const chipRenderer = useRef(renderChip);

  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handlers: LivePreviewHandlers = {
      renderChip: (token) => latest.current.renderChip(token),
      openLink: (target) => latest.current.onOpenLink(target),
      openUrl: (url) => latest.current.onOpenUrl?.(url),
    };
    const extensions = [
      EditorView.cspNonce.of(readCspNonce()),
      history(),
      drawSelection(),
      EditorView.lineWrapping,
      noteMarkdown(),
      syntaxHighlighting(noteHighlighting),
      livePreview(handlers),
      autocompletion({
        override: noteCompletionSources(() => latest.current.completions),
        icons: false,
      }),
      keymap.of([
        { key: 'Mod-Enter', run: toggleTask, preventDefault: true },
        ...completionKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        if (update.transactions.every((tr) => tr.annotation(externalChange))) return;
        const next = update.state.doc.toString();
        shown.current = { path: shown.current.path, text: next };
        latest.current.onChange(next);
      }),
      noteTheme,
    ];
    const createState = (doc: string) =>
      EditorState.create({
        doc,
        extensions: [
          extensions,
          settings.of(settingsOf(latest.current.readOnly ?? false, latest.current.ariaLabel)),
        ],
      });
    const view = new EditorView({ state: createState(latest.current.text), parent: host });
    viewRef.current = view;
    createStateRef.current = createState;
    if (latest.current.autoFocus) view.focus();
    return () => {
      view.destroy();
      viewRef.current = null;
      createStateRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    const createState = createStateRef.current;
    if (!view || !createState) return;
    if (shown.current.path !== path) {
      shown.current = { path, text };
      view.setState(createState(text));
      return;
    }
    if (shown.current.text === text) return;
    shown.current = { path, text };
    const current = view.state.doc.toString();
    if (current === text) return;
    view.dispatch({
      changes: changeBetween(current, text),
      annotations: [externalChange.of(true), Transaction.addToHistory.of(false)],
    });
  }, [path, text]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: settings.reconfigure(settingsOf(readOnly, ariaLabel)) });
  }, [readOnly, ariaLabel]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || chipRenderer.current === renderChip) return;
    chipRenderer.current = renderChip;
    view.dispatch({ effects: refreshChips.of(null) });
  }, [renderChip]);

  return (
    <div ref={hostRef} className={className ? `bd-note-editor ${className}` : 'bd-note-editor'} />
  );
}
