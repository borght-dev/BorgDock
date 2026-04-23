import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useState } from 'react';
import type { Baseline, Mode, ViewMode } from './types';

interface Props {
  path: string;
  content: string | null;
  mode: Mode;
  baseline: Baseline;
  onSelectBaseline: (b: Baseline) => void;
  onSelectContent: () => void;
  viewMode: ViewMode;
  onSelectViewMode: (v: ViewMode) => void;
  inRepo: boolean;
  defaultBranchLabel: string | null;
}

export function FileViewerToolbar({
  path,
  content,
  mode,
  baseline,
  onSelectBaseline,
  onSelectContent,
  viewMode,
  onSelectViewMode,
  inRepo,
  defaultBranchLabel,
}: Props) {
  const [copied, setCopied] = useState(false);
  const copyAll = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  const diffVsHeadActive = mode === 'diff' && baseline === 'HEAD';
  const diffVsDefaultActive = mode === 'diff' && baseline === 'mergeBaseDefault';
  const contentActive = mode === 'content';
  const defaultLabel = defaultBranchLabel ?? 'default';

  return (
    <div className="fv-toolbar" data-tauri-drag-region>
      <span className="fv-path" title={path}>
        {path}
      </span>
      <div className="fv-actions">
        <div
          className="fv-segment"
          role="group"
          aria-label="View mode"
          title={inRepo ? undefined : 'Not in a git repository'}
        >
          <button
            type="button"
            className={`fv-seg-btn${diffVsHeadActive ? ' fv-seg-btn--active' : ''}`}
            onClick={() => onSelectBaseline('HEAD')}
            disabled={!inRepo}
          >
            vs HEAD
          </button>
          <button
            type="button"
            className={`fv-seg-btn${diffVsDefaultActive ? ' fv-seg-btn--active' : ''}`}
            onClick={() => onSelectBaseline('mergeBaseDefault')}
            disabled={!inRepo}
            title={`Diff against merge-base with origin/${defaultLabel}`}
          >
            vs {defaultLabel}
          </button>
          <button
            type="button"
            className={`fv-seg-btn${contentActive ? ' fv-seg-btn--active' : ''}`}
            onClick={onSelectContent}
          >
            File
          </button>
        </div>

        {mode === 'diff' && (
          <div className="fv-segment" role="group" aria-label="Diff layout">
            <button
              type="button"
              className={`fv-seg-btn${viewMode === 'unified' ? ' fv-seg-btn--active' : ''}`}
              onClick={() => onSelectViewMode('unified')}
              title="Unified diff (Ctrl+Shift+M)"
            >
              Unified
            </button>
            <button
              type="button"
              className={`fv-seg-btn${viewMode === 'split' ? ' fv-seg-btn--active' : ''}`}
              onClick={() => onSelectViewMode('split')}
              title="Split diff (Ctrl+Shift+M)"
            >
              Split
            </button>
          </div>
        )}

        <button type="button" className="fv-btn" onClick={copyAll} disabled={!content}>
          {copied ? 'Copied' : 'Copy all'}
        </button>
        <button
          type="button"
          className="fv-btn"
          onClick={() => invoke('open_in_editor', { path })}
        >
          Open in editor
        </button>
        <button
          type="button"
          className="fv-btn fv-btn--close"
          onClick={() => getCurrentWindow().close()}
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
}
