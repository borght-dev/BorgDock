import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { CodeView } from './CodeView';
import { joinRootAndRel } from './join-path';

interface Props {
  rootPath: string | null;
  relPath: string | null;
  scrollToLine?: number;
  highlightedLines?: number[];
  onIdentifierJump?: (word: string) => void;
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; content: string }
  | { kind: 'binary' }
  | { kind: 'too_large'; size: number; limit: number }
  | { kind: 'error'; message: string };

export function PreviewPane({
  rootPath,
  relPath,
  scrollToLine,
  highlightedLines,
  onIdentifierJump,
}: Props) {
  const [state, setState] = useState<LoadState>({ kind: 'idle' });
  const absPath = rootPath && relPath ? joinRootAndRel(rootPath, relPath) : null;

  useEffect(() => {
    if (!absPath) {
      setState({ kind: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    invoke<string>('read_text_file', { path: absPath, maxBytes: null })
      .then((content) => {
        if (!cancelled) setState({ kind: 'ok', content });
      })
      .catch((err) => {
        if (cancelled) return;
        const e = normalizeError(err);
        setState(e);
      });
    return () => { cancelled = true; };
  }, [absPath]);

  if (state.kind === 'idle') {
    return <div className="fp-preview-empty">Select a file to preview</div>;
  }
  if (state.kind === 'loading') {
    return <div className="fp-preview-empty">Loading…</div>;
  }
  if (state.kind === 'binary') {
    return (
      <div className="fp-preview-empty">
        Binary file — preview disabled.
        <button
          type="button"
          className="fp-preview-action"
          onClick={() => absPath && invoke('open_in_editor', { path: absPath })}
        >
          Open in editor
        </button>
      </div>
    );
  }
  if (state.kind === 'too_large') {
    return (
      <div className="fp-preview-empty">
        File too large ({(state.size / 1024).toFixed(0)} KB &gt; {(state.limit / 1024).toFixed(0)} KB).
        <button
          type="button"
          className="fp-preview-action"
          onClick={() => absPath && invoke('open_in_editor', { path: absPath })}
        >
          Open in editor
        </button>
      </div>
    );
  }
  if (state.kind === 'error') {
    return <div className="fp-preview-empty">Could not read file: {state.message}</div>;
  }
  return (
    <CodeView
      path={relPath ?? ''}
      content={state.content}
      scrollToLine={scrollToLine}
      highlightedLines={highlightedLines}
      onIdentifierJump={onIdentifierJump}
    />
  );
}

function normalizeError(err: unknown): LoadState {
  if (err && typeof err === 'object' && 'kind' in (err as Record<string, unknown>)) {
    const e = err as { kind: string; size?: number; limit?: number; message?: string };
    if (e.kind === 'notFound') return { kind: 'error', message: 'File not found' };
    if (e.kind === 'tooLarge') return { kind: 'too_large', size: e.size ?? 0, limit: e.limit ?? 0 };
    if (e.kind === 'binary') return { kind: 'binary' };
    return { kind: 'error', message: e.message ?? 'unknown error' };
  }
  return { kind: 'error', message: String(err) };
}
