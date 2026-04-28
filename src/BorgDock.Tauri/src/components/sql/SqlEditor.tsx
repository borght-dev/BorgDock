import { autocompletion, completionKeymap, type CompletionSource, type Completion } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { MSSQL, SQLDialect, sql } from '@codemirror/lang-sql';
import { Compartment, EditorState } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { useEffect, useRef } from 'react';
import type { SqlSchemaPayload } from '@/types/sql-schema';
import { toCmSchema } from './to-cm-schema';

interface SqlEditorProps {
  value: string;
  onChange: (next: string) => void;
  onRunQuery: () => void;
  schema: SqlSchemaPayload | null;
  height: number;
}

const MSSQL_CI = SQLDialect.define({
  ...MSSQL.spec,
  caseInsensitiveIdentifiers: true,
});

function fromTableCompletionSource(schema: SqlSchemaPayload | null): CompletionSource {
  return (context) => {
    if (!schema) return null;

    const word = context.matchBefore(/[A-Za-z_][\w]*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;

    // Skip qualified positions like `tbl.col` — let lang-sql's source handle those.
    const charBefore = context.state.sliceDoc(Math.max(0, word.from - 1), word.from);
    if (charBefore === '.') return null;

    const before = context.state.sliceDoc(0, word.from);
    const fromRe = /\b(?:FROM|JOIN)\s+(?:(\w+)\.)?(\w+)/gi;
    const referenced: { schema?: string; name: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = fromRe.exec(before))) {
      if (m[2]) referenced.push({ schema: m[1] || undefined, name: m[2] });
    }
    if (referenced.length === 0) return null;

    const columns: Completion[] = [];
    const seen = new Set<string>();
    for (const ref of referenced) {
      const table = schema.tables.find((t) =>
        ref.schema
          ? t.name.toLowerCase() === ref.name.toLowerCase() &&
            t.schema.toLowerCase() === ref.schema.toLowerCase()
          : t.name.toLowerCase() === ref.name.toLowerCase(),
      );
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
  const langSupport = sql({
    dialect: MSSQL_CI,
    schema: toCmSchema(schema),
    upperCaseKeywords: true,
  });
  return [
    langSupport,
    langSupport.language.data.of({
      autocomplete: fromTableCompletionSource(schema),
    }),
  ];
}

export function SqlEditor({ value, onChange, onRunQuery, schema, height }: SqlEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const sqlCompartmentRef = useRef<Compartment | null>(null);
  const onChangeRef = useRef(onChange);
  const onRunQueryRef = useRef(onRunQuery);
  onChangeRef.current = onChange;
  onRunQueryRef.current = onRunQuery;

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
        autocompletion(),
        sqlCompartment.of(buildSqlExtension(schema)),
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              onRunQueryRef.current();
              return true;
            },
            preventDefault: true,
          },
          ...completionKeymap,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (view.state.doc.toString() === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  return (
    <div
      ref={hostRef}
      className="sql-editor-cm"
      style={{ height }}
    />
  );
}
