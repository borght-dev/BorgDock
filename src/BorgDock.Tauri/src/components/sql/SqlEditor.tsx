import { autocompletion } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { MSSQL, sql } from '@codemirror/lang-sql';
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

function buildSqlExtension(schema: SqlSchemaPayload | null) {
  return sql({
    dialect: MSSQL,
    schema: toCmSchema(schema),
    upperCaseKeywords: true,
  });
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
