import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/shared/primitives';
import { FilePaletteCodeView } from './FilePaletteCodeView';

interface ContentHit {
  matches: { line: number }[];
}

interface Props {
  path: string;
  relPath: string;
  contentHit: ContentHit | null;
  scrollToLine?: number;
  onIdentifierJump: (word: string) => void;
  onPopOut: () => void;
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; content: string }
  | { kind: 'binary' }
  | { kind: 'too_large'; size: number; limit: number }
  | { kind: 'error'; message: string };

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

export function FilePreview({ path, relPath, contentHit, scrollToLine, onIdentifierJump, onPopOut }: Props) {
  const [state, setState] = useState<LoadState>({ kind: 'idle' });

  useEffect(() => {
    if (!path) {
      setState({ kind: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    invoke<string>('read_text_file', { path, maxBytes: null })
      .then((content) => {
        if (!cancelled) setState({ kind: 'ok', content });
      })
      .catch((err) => {
        if (!cancelled) setState(normalizeError(err));
      });
    return () => { cancelled = true; };
  }, [path]);

  const ext = relPath.includes('.') ? relPath.split('.').pop() : 'txt';
  const lines = state.kind === 'ok' ? state.content.split('\n').length : 0;
  const sizeKb = state.kind === 'ok' ? Math.round(state.content.length / 102.4) / 10 : 0;

  return (
    <div className="bd-fp-preview bd-fp-preview--file">
      <div className="bd-fp-preview-actionbar">
        <span className="bd-mono bd-fp-preview-path">{relPath}</span>
        <span className="bd-fp-preview-spacer" />
        <span className="bd-fp-preview-pill">{ext}</span>
        {state.kind === 'ok' && (
          <span className="bd-mono bd-fp-preview-counts">{lines} lines · {sizeKb} KB</span>
        )}
        <button
          type="button"
          aria-label="Copy contents"
          onClick={() => state.kind === 'ok' && navigator.clipboard.writeText(state.content)}
        >📋</button>
        <button type="button" aria-label="Open in window" onClick={onPopOut}>↗</button>
      </div>
      <div className="bd-fp-preview-body">
        {state.kind === 'loading' && <div className="bd-fp-preview-empty">Loading…</div>}
        {state.kind === 'binary' && (
          <div className="bd-fp-preview-empty">
            Binary file — preview disabled.
            <Button variant="primary" size="sm" onClick={() => invoke('open_in_editor', { path })}>
              Open in editor
            </Button>
          </div>
        )}
        {state.kind === 'too_large' && (
          <div className="bd-fp-preview-empty">
            File too large ({(state.size / 1024).toFixed(0)} KB &gt; {(state.limit / 1024).toFixed(0)} KB).
            <Button variant="primary" size="sm" onClick={() => invoke('open_in_editor', { path })}>
              Open in editor
            </Button>
          </div>
        )}
        {state.kind === 'error' && (
          <div className="bd-fp-preview-empty">Could not read file: {state.message}</div>
        )}
        {state.kind === 'ok' && (
          <FilePaletteCodeView
            path={relPath}
            content={state.content}
            scrollToLine={scrollToLine}
            highlightedLines={contentHit?.matches.map((m) => m.line)}
            onIdentifierJump={onIdentifierJump}
          />
        )}
      </div>
    </div>
  );
}
