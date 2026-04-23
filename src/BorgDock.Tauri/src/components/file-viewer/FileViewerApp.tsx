import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CodeView } from '../file-palette/CodeView';
import { FileViewerToolbar } from './FileViewerToolbar';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; content: string }
  | { kind: 'error'; message: string };

export function FileViewerApp() {
  const path = useMemo(() => {
    const p = new URLSearchParams(window.location.search).get('path');
    return p ?? '';
  }, []);
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (!path) {
      setState({ kind: 'error', message: 'No file path supplied' });
      return;
    }
    invoke<string>('read_text_file', { path })
      .then((content) => setState({ kind: 'ok', content }))
      .catch((e) => setState({ kind: 'error', message: extractMessage(e) }));
  }, [path]);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey && (e.key === 'w' || e.key === 'W')) {
      e.preventDefault();
      getCurrentWindow().close();
    }
  }, []);

  return (
    <div className="fv-root" onKeyDown={handleKey} tabIndex={-1}>
      <FileViewerToolbar
        path={path}
        content={state.kind === 'ok' ? state.content : null}
      />
      <div className="fv-body">
        {state.kind === 'loading' && <div className="fv-empty">Loading…</div>}
        {state.kind === 'error' && <div className="fv-empty">{state.message}</div>}
        {state.kind === 'ok' && <CodeView path={path} content={state.content} />}
      </div>
    </div>
  );
}

function extractMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'kind' in (e as Record<string, unknown>)) {
    const err = e as { kind: string; message?: string };
    if (err.kind === 'notFound') return 'File not found';
    if (err.kind === 'binary') return 'Binary file — preview disabled';
    if (err.kind === 'tooLarge') return 'File too large to preview';
    return err.message ?? 'Unknown error';
  }
  return String(e);
}
