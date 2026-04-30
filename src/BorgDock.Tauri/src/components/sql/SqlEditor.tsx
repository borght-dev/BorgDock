import {
  autocompletion,
  type Completion,
  type CompletionSource,
  completionKeymap,
  moveCompletionSelection,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  keywordCompletionSource,
  MSSQL,
  SQLDialect,
  schemaCompletionSource,
  sql,
} from '@codemirror/lang-sql';
import { Compartment, EditorState } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { SqlSchemaPayload } from '@/types/sql-schema';
import { toCmSchema } from './to-cm-schema';

export interface SqlEditorHandle {
  /**
   * Returns the text the user wants to run: the current non-empty selection
   * if there is one, otherwise the whole document. Returns `null` if the
   * editor isn't mounted yet.
   */
  getRunText: () => string | null;
}

interface SqlEditorProps {
  value: string;
  onChange: (next: string) => void;
  /**
   * Called when the editor wants to execute a query. The argument is the
   * text the user is targeting — the current selection if any, else the
   * whole document. Callers should prefer this over reading `value` so
   * "run selection" works.
   */
  onRunQuery: (textToRun: string) => void;
  schema: SqlSchemaPayload | null;
  height: number;
}

function readRunText(view: EditorView | null): string | null {
  if (!view) return null;
  const sel = view.state.selection.main;
  if (sel.from !== sel.to) return view.state.sliceDoc(sel.from, sel.to);
  return view.state.doc.toString();
}

const MSSQL_CI = SQLDialect.define({
  ...MSSQL.spec,
  caseInsensitiveIdentifiers: true,
});

// How far back to scan from the cursor when looking for FROM/JOIN clauses.
// Bounded so very long documents don't make autocomplete O(N) per keystroke.
const FROM_SCAN_WINDOW = 4096;

type SchemaTable = SqlSchemaPayload['tables'][number];
interface TableLookup {
  byName: Map<string, SchemaTable>;
  byQualifiedName: Map<string, SchemaTable>;
}

function buildTableLookup(schema: SqlSchemaPayload | null): TableLookup | null {
  if (!schema || schema.tables.length === 0) return null;
  const byName = new Map<string, SchemaTable>();
  const byQualifiedName = new Map<string, SchemaTable>();
  for (const t of schema.tables) {
    byName.set(t.name.toLowerCase(), t);
    byQualifiedName.set(`${t.schema.toLowerCase()}.${t.name.toLowerCase()}`, t);
  }
  return { byName, byQualifiedName };
}

function fromTableCompletionSource(lookup: TableLookup | null): CompletionSource {
  return (context) => {
    if (!lookup) return null;

    const word = context.matchBefore(/[A-Za-z_][\w]*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;

    // Skip qualified positions like `tbl.col` — let lang-sql's source handle those.
    const charBefore = context.state.sliceDoc(Math.max(0, word.from - 1), word.from);
    if (charBefore === '.') return null;

    // Only scan a bounded window before the cursor, then trim to the current statement
    // (last `;` in the window). Avoids stringifying the entire document on every keystroke.
    const sliceStart = Math.max(0, word.from - FROM_SCAN_WINDOW);
    const windowText = context.state.sliceDoc(sliceStart, word.from);
    const lastSemi = windowText.lastIndexOf(';');
    const before = lastSemi >= 0 ? windowText.slice(lastSemi + 1) : windowText;

    const fromRe = /\b(?:FROM|JOIN)\s+(?:(\w+)\.)?(\w+)/gi;
    const columns: Completion[] = [];
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = fromRe.exec(before))) {
      const refName = m[2];
      if (!refName) continue;
      const refSchema = m[1];
      const table = refSchema
        ? lookup.byQualifiedName.get(`${refSchema.toLowerCase()}.${refName.toLowerCase()}`)
        : lookup.byName.get(refName.toLowerCase());
      if (!table) continue;
      for (const col of table.columns) {
        if (seen.has(col.name)) continue;
        seen.add(col.name);
        columns.push({
          label: col.name,
          type: 'property',
          detail: col.dataType,
          boost: 1,
        });
      }
    }

    if (columns.length === 0) return null;

    return {
      from: word.from,
      options: columns,
      validFor: /^\w*$/,
    };
  };
}

function buildSqlExtension(schema: SqlSchemaPayload | null) {
  const dialect = MSSQL_CI;
  const cmSchema = toCmSchema(schema);
  const lookup = buildTableLookup(schema);
  return [
    sql({
      dialect,
      schema: cmSchema,
      upperCaseKeywords: true,
    }),
    autocompletion({
      override: [
        fromTableCompletionSource(lookup),
        schemaCompletionSource({ dialect, schema: cmSchema, upperCaseKeywords: true }),
        keywordCompletionSource(dialect, true),
      ],
    }),
  ];
}

export const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(function SqlEditor(
  { value, onChange, onRunQuery, schema, height },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const sqlCompartmentRef = useRef<Compartment | null>(null);
  const onChangeRef = useRef(onChange);
  const onRunQueryRef = useRef(onRunQuery);
  // Tracks the latest doc text the editor has emitted (or accepted from a `value` prop sync).
  // Lets the value-sync effect compare against this in O(1) instead of stringifying the whole doc.
  const lastValueRef = useRef(value);
  onChangeRef.current = onChange;
  onRunQueryRef.current = onRunQuery;

  // Mount-only initialiser — value/schema seed the initial editor state;
  // subsequent changes are handled by the dedicated effects below, not by
  // recreating the editor.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only initialiser
  useEffect(() => {
    if (!hostRef.current) return;
    const sqlCompartment = new Compartment();
    sqlCompartmentRef.current = sqlCompartment;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        sqlCompartment.of(buildSqlExtension(schema)),
        keymap.of([
          {
            key: 'Mod-Enter',
            run: (view) => {
              const text = readRunText(view);
              if (text != null) onRunQueryRef.current(text);
              return true;
            },
            preventDefault: true,
          },
          { key: 'Tab', run: moveCompletionSelection(true), preventDefault: true },
          { key: 'Shift-Tab', run: moveCompletionSelection(false), preventDefault: true },
          ...completionKeymap,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            const next = u.state.doc.toString();
            lastValueRef.current = next;
            onChangeRef.current(next);
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '13px' },
          '.cm-scroller': { fontFamily: 'var(--font-mono, monospace)' },
          '.cm-content': { caretColor: 'var(--color-text-primary)' },
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
      sqlCompartmentRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    const compartment = sqlCompartmentRef.current;
    if (!view || !compartment) return;
    view.dispatch({
      effects: compartment.reconfigure(buildSqlExtension(schema)),
    });
  }, [schema]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (lastValueRef.current === value) return;
    lastValueRef.current = value;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  useImperativeHandle(
    ref,
    () => ({
      getRunText: () => readRunText(viewRef.current),
    }),
    [],
  );

  return <div ref={hostRef} className="sql-editor-cm" style={{ height }} />;
});
