import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Kbd } from '@/components/shared/primitives';
import { useSyntaxHighlight } from '@/hooks/useSyntaxHighlight';
import { parsePatch } from '@/services/diff-parser';
import { SplitDiffView } from '@/components/pr-detail/diff/SplitDiffView';
import { UnifiedDiffView } from '@/components/pr-detail/diff/UnifiedDiffView';
import type { AppSettings } from '@/types/settings';

interface DiffOutput {
  patch: string;
  baselineRef: string;
  inRepo: boolean;
}

interface Props {
  path: string;
  relPath: string;
  initialBaseline: 'HEAD' | 'mergeBaseDefault';
  onPopOut: (baseline: 'HEAD' | 'mergeBaseDefault') => void;
}

export function DiffPreview({ path, relPath, initialBaseline, onPopOut }: Props) {
  const [baseline, setBaseline] = useState<'HEAD' | 'mergeBaseDefault'>(initialBaseline);
  const [view, setView] = useState<'unified' | 'split'>('unified');
  const [diff, setDiff] = useState<DiffOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Hydrate persisted view mode (shared with FileViewer window).
  useEffect(() => {
    invoke<AppSettings>('load_settings')
      .then((s) => {
        const v = s.ui?.fileViewerDefaultViewMode;
        if (v === 'split' || v === 'unified') setView(v);
      })
      .catch(() => {});
  }, []);

  // Persist view mode on change and sync to other windows via settings.
  const setViewPersist = useCallback((v: 'unified' | 'split') => {
    setView(v);
    void invoke<AppSettings>('load_settings')
      .then((s) =>
        invoke('save_settings', {
          settings: { ...s, ui: { ...s.ui, fileViewerDefaultViewMode: v } },
        }),
      )
      .catch(() => {});
  }, []);

  // Reset baseline when the selection changes (parent passes new initialBaseline + path).
  useEffect(() => {
    setBaseline(initialBaseline);
  }, [path, initialBaseline]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.ctrlKey || e.key !== '/') return;
      // Skip if the user is typing in an input or textarea (find strip, search box, etc.)
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      setViewPersist(view === 'unified' ? 'split' : 'unified');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, setViewPersist]);

  useEffect(() => {
    setDiff(null);
    setError(null);
    invoke<DiffOutput>('git_file_diff', { path, baseline })
      .then((d) => setDiff(d))
      .catch((e) =>
        setError(typeof e === 'string' ? e : (e as { message?: string }).message ?? 'Error'),
      );
  }, [path, baseline]);

  const hunks = useMemo(() => (diff?.patch ? parsePatch(diff.patch) : []), [diff]);
  const syntaxHighlights = useSyntaxHighlight(path, hunks);

  const totalAdd = hunks.reduce(
    (s, h) => s + h.lines.filter((l) => l.type === 'add').length,
    0,
  );
  const totalDel = hunks.reduce(
    (s, h) => s + h.lines.filter((l) => l.type === 'delete').length,
    0,
  );

  const scrollToHunk = useCallback((delta: 1 | -1) => {
    const root = bodyRef.current;
    if (!root) return;
    const hunkEls = Array.from(root.querySelectorAll<HTMLElement>('[data-hunk-header]'));
    if (hunkEls.length === 0) return;
    const top = root.scrollTop;
    const idx = hunkEls.findIndex((el) => el.offsetTop > top + 4);
    let target: HTMLElement | undefined;
    if (delta === 1) {
      target = idx >= 0 ? hunkEls[idx] : hunkEls[hunkEls.length - 1];
    } else {
      const before = hunkEls.filter((el) => el.offsetTop < top - 4);
      target = before[before.length - 1] ?? hunkEls[0];
    }
    if (target) root.scrollTop = target.offsetTop;
  }, []);

  return (
    <div className="bd-fp-preview bd-fp-preview--diff">
      <div className="bd-fp-preview-actionbar">
        <span className="bd-mono bd-fp-preview-path">{relPath}</span>
        <span
          style={{
            color: 'var(--color-status-green)',
            fontFamily: 'var(--font-code)',
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          +{totalAdd}
        </span>
        <span
          style={{
            color: 'var(--color-status-red)',
            fontFamily: 'var(--font-code)',
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          −{totalDel}
        </span>
        <span className="bd-fp-preview-spacer" />
        <SegToggle
          value={baseline}
          onChange={setBaseline}
          options={[
            { id: 'HEAD', label: 'vs HEAD' },
            { id: 'mergeBaseDefault', label: 'vs main' },
          ]}
        />
        <SegToggle
          value={view}
          onChange={setViewPersist}
          options={[
            { id: 'unified', label: 'Unified' },
            { id: 'split', label: 'Split' },
          ]}
        />
        <button
          type="button"
          aria-label="Copy patch"
          onClick={() => diff?.patch && navigator.clipboard.writeText(diff.patch)}
        >
          📋
        </button>
        <button type="button" aria-label="Open in window" onClick={() => onPopOut(baseline)}>
          ↗
        </button>
      </div>
      <div className="bd-fp-preview-hunknav">
        <span className="bd-mono">
          {hunks.length} hunk{hunks.length === 1 ? '' : 's'}
        </span>
        <span className="bd-fp-preview-spacer" />
        <button type="button" onClick={() => scrollToHunk(-1)}>
          ↑ Prev
        </button>
        <button type="button" onClick={() => scrollToHunk(1)}>
          Next ↓
        </button>
        <Kbd>Ctrl+/</Kbd>
      </div>
      <div ref={bodyRef} className="bd-fp-preview-body bd-scroll">
        {error ? (
          <div className="bd-fp-preview-empty">{error}</div>
        ) : diff == null ? (
          <div className="bd-fp-preview-empty">Loading diff…</div>
        ) : !diff.inRepo ? (
          <div className="bd-fp-preview-empty">Not in a git repository</div>
        ) : hunks.length === 0 ? (
          <div className="bd-fp-preview-empty">No changes vs {diff.baselineRef}</div>
        ) : view === 'split' ? (
          <SplitDiffView hunks={hunks} syntaxHighlights={syntaxHighlights} />
        ) : (
          <UnifiedDiffView hunks={hunks} syntaxHighlights={syntaxHighlights} />
        )}
      </div>
    </div>
  );
}

interface SegToggleOption<T extends string> {
  id: T;
  label: string;
}

interface SegToggleProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: SegToggleOption<T>[];
}

function SegToggle<T extends string>({ value, onChange, options }: SegToggleProps<T>) {
  return (
    <div className="bd-fp-segtoggle">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`bd-fp-segtoggle__btn${value === o.id ? ' bd-fp-segtoggle__btn--on' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
