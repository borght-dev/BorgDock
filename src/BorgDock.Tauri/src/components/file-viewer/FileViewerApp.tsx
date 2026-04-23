import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings } from '@/types/settings';
import { useSyntaxHighlight } from '@/hooks/useSyntaxHighlight';
import { parsePatch } from '@/services/diff-parser';
import { CodeView } from '../file-palette/CodeView';
import { SplitDiffView } from '../pr-detail/diff/SplitDiffView';
import { UnifiedDiffView } from '../pr-detail/diff/UnifiedDiffView';
import { FileViewerToolbar } from './FileViewerToolbar';
import type { Baseline, Mode, ViewMode } from './types';

type ContentState =
  | { kind: 'loading' }
  | { kind: 'ok'; content: string }
  | { kind: 'error'; message: string };

interface DiffOutput {
  patch: string;
  baselineRef: string;
  inRepo: boolean;
}

type DiffState =
  | { kind: 'loading' }
  | { kind: 'ok'; patch: string; baselineRef: string; inRepo: boolean }
  | { kind: 'error'; message: string };

export function FileViewerApp() {
  const path = useMemo(() => {
    const p = new URLSearchParams(window.location.search).get('path');
    return p ?? '';
  }, []);

  const [contentState, setContentState] = useState<ContentState>({ kind: 'loading' });
  const [diffState, setDiffState] = useState<DiffState>({ kind: 'loading' });
  const [baseline, setBaseline] = useState<Baseline>(() => {
    const raw = new URLSearchParams(window.location.search).get('baseline');
    return raw === 'mergeBaseDefault' ? 'mergeBaseDefault' : 'HEAD';
  });
  // 'auto' defers the choice to the first diff response — if the file is
  // changed vs HEAD we open in diff mode, otherwise plain content.
  const [mode, setMode] = useState<Mode | 'auto'>('auto');
  const [viewMode, setViewModeState] = useState<ViewMode>('unified');
  // Suppress the first persist: we apply the value loaded from settings, and
  // don't want that round-trip to immediately re-save the same value.
  const viewModeHydrated = useRef(false);
  const [defaultBranchLabel, setDefaultBranchLabel] = useState<string | null>(null);

  useEffect(() => {
    invoke<AppSettings>('load_settings')
      .then((s) => {
        const saved = s.ui?.fileViewerDefaultViewMode;
        if (saved === 'split' || saved === 'unified') setViewModeState(saved);
      })
      .catch(() => {
        /* fall back to default 'unified' */
      })
      .finally(() => {
        viewModeHydrated.current = true;
      });
  }, []);

  const setViewMode = useCallback((next: ViewMode | ((prev: ViewMode) => ViewMode)) => {
    setViewModeState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      if (viewModeHydrated.current && resolved !== prev) {
        void invoke<AppSettings>('load_settings')
          .then((s) =>
            invoke('save_settings', {
              settings: { ...s, ui: { ...s.ui, fileViewerDefaultViewMode: resolved } },
            }),
          )
          .catch(() => {
            /* ignore persistence failure — in-session state is still correct */
          });
      }
      return resolved;
    });
  }, []);

  useEffect(() => {
    if (!path) {
      setContentState({ kind: 'error', message: 'No file path supplied' });
      return;
    }
    invoke<string>('read_text_file', { path })
      .then((content) => setContentState({ kind: 'ok', content }))
      .catch((e) => setContentState({ kind: 'error', message: extractMessage(e) }));
  }, [path]);

  useEffect(() => {
    if (!path) return;
    setDiffState({ kind: 'loading' });
    invoke<DiffOutput>('git_file_diff', { path, baseline })
      .then((r) => {
        setDiffState({ kind: 'ok', ...r });
        if (r.inRepo && baseline === 'mergeBaseDefault' && r.baselineRef) {
          setDefaultBranchLabel(r.baselineRef);
        }
      })
      .catch((e) => setDiffState({ kind: 'error', message: String(e) }));
  }, [path, baseline]);

  const effectiveMode: Mode =
    mode !== 'auto'
      ? mode
      : diffState.kind === 'ok' && diffState.inRepo && diffState.patch.length > 0
        ? 'diff'
        : 'content';

  const hunks = useMemo(() => {
    if (diffState.kind !== 'ok' || !diffState.patch) return [];
    return parsePatch(diffState.patch);
  }, [diffState]);

  const syntaxHighlights = useSyntaxHighlight(path, hunks);

  const inRepo = diffState.kind === 'ok' && diffState.inRepo;

  const selectBaseline = useCallback((b: Baseline) => {
    setBaseline(b);
    setMode('diff');
  }, []);

  const selectContentMode = useCallback(() => {
    setMode('content');
  }, []);

  const cycleBaseline = useCallback(() => {
    if (!inRepo) return;
    setMode('diff');
    setBaseline((b) => (b === 'HEAD' ? 'mergeBaseDefault' : 'HEAD'));
  }, [inRepo]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        getCurrentWindow().close();
        return;
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        if (effectiveMode === 'diff') {
          setViewMode((v) => (v === 'unified' ? 'split' : 'unified'));
        }
        return;
      }
      if (e.ctrlKey && !e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        cycleBaseline();
      }
    },
    [effectiveMode, cycleBaseline],
  );

  return (
    <div className="fv-root" onKeyDown={handleKey} tabIndex={-1}>
      <FileViewerToolbar
        path={path}
        content={contentState.kind === 'ok' ? contentState.content : null}
        mode={effectiveMode}
        baseline={baseline}
        onSelectBaseline={selectBaseline}
        onSelectContent={selectContentMode}
        viewMode={viewMode}
        onSelectViewMode={setViewMode}
        inRepo={inRepo}
        defaultBranchLabel={defaultBranchLabel}
      />
      <div className="fv-body">
        {renderBody({
          effectiveMode,
          contentState,
          diffState,
          hunks,
          path,
          viewMode,
          syntaxHighlights,
        })}
      </div>
    </div>
  );
}

interface RenderBodyArgs {
  effectiveMode: Mode;
  contentState: ContentState;
  diffState: DiffState;
  hunks: ReturnType<typeof parsePatch>;
  path: string;
  viewMode: ViewMode;
  syntaxHighlights: ReturnType<typeof useSyntaxHighlight>;
}

function renderBody(args: RenderBodyArgs) {
  const { effectiveMode, contentState, diffState, hunks, path, viewMode, syntaxHighlights } = args;

  if (effectiveMode === 'content') {
    if (contentState.kind === 'loading') return <div className="fv-empty">Loading…</div>;
    if (contentState.kind === 'error') return <div className="fv-empty">{contentState.message}</div>;
    return <CodeView path={path} content={contentState.content} />;
  }

  if (diffState.kind === 'loading') return <div className="fv-empty">Loading diff…</div>;
  if (diffState.kind === 'error') return <div className="fv-empty">{diffState.message}</div>;
  if (!diffState.inRepo) return <div className="fv-empty">Not in a git repository</div>;
  if (hunks.length === 0) {
    return <div className="fv-empty">No changes vs {diffState.baselineRef}</div>;
  }
  return viewMode === 'unified' ? (
    <UnifiedDiffView hunks={hunks} syntaxHighlights={syntaxHighlights} />
  ) : (
    <SplitDiffView hunks={hunks} syntaxHighlights={syntaxHighlights} />
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
