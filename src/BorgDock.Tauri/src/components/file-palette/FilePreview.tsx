import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button, Kbd } from '@/components/shared/primitives';
import { FilePaletteCodeView, scanFindMatches, type FindMatch } from './FilePaletteCodeView';

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

  const [findOpen, setFindOpen] = useState(false);
  const [findTerm, setFindTerm] = useState('');
  const [findIdx, setFindIdx] = useState(0);
  const findInputRef = useRef<HTMLInputElement | null>(null);

  const matches: FindMatch[] = useMemo(
    () => (state.kind === 'ok' ? scanFindMatches(state.content, findTerm) : []),
    [state, findTerm],
  );

  useEffect(() => {
    if (matches.length === 0) setFindIdx(0);
    else if (findIdx >= matches.length) setFindIdx(0);
  }, [matches, findIdx]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setFindOpen(true);
        setTimeout(() => findInputRef.current?.focus(), 0);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const stepFind = (delta: 1 | -1) => {
    if (matches.length === 0) return;
    setFindIdx((i) => (i + delta + matches.length) % matches.length);
  };

  const currentMatchLine = matches[findIdx]?.line;

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
      {findOpen && (
        <div className="bd-fp-find-strip">
          <input
            ref={findInputRef}
            value={findTerm}
            onChange={(e) => setFindTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                stepFind(e.shiftKey ? -1 : 1);
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setFindOpen(false);
                setFindTerm('');
              }
            }}
            placeholder="Find in file…"
            className="bd-fp-find-input"
            aria-label="Find in file"
          />
          <span className="bd-mono">
            {matches.length === 0 ? '0' : `${findIdx + 1} of ${matches.length}`}
          </span>
          <button type="button" aria-label="Previous match" onClick={() => stepFind(-1)}>↑</button>
          <button type="button" aria-label="Next match" onClick={() => stepFind(1)}>↓</button>
          <button type="button" aria-label="Close find"
            onClick={() => { setFindOpen(false); setFindTerm(''); }}>✕</button>
          <span className="bd-fp-preview-spacer" />
          <Kbd>Esc</Kbd>
        </div>
      )}
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
            scrollToLine={currentMatchLine ?? scrollToLine}
            highlightedLines={contentHit?.matches.map((m) => m.line)}
            onIdentifierJump={onIdentifierJump}
            findMatches={matches}
            findCurrent={findIdx}
          />
        )}
      </div>
    </div>
  );
}
