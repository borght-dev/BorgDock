import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { Button, Chip, Seg2 } from '@/components/shared/primitives';
import { WindowTitleBar } from '@/components/shared/WindowTitleBar';
import type { Baseline, Mode, ViewMode } from './types';

const VIEW_MODES: ReadonlyArray<{ value: ViewMode; label: string }> = [
  { value: 'unified', label: 'Unified' },
  { value: 'split', label: 'Split' },
];

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

/**
 * The file viewer's title bar: the shared `WindowTitleBar` with the file path as
 * its title (JetBrains Mono, it is code) and the view controls as its actions.
 */
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
    <WindowTitleBar
      title={
        <span data-titlebar-path className="bd-fv-path" title={path} data-tauri-drag-region>
          {path}
        </span>
      }
      actions={
        <>
          <div
            role="group"
            aria-label="View mode"
            className="flex items-center gap-1"
            title={inRepo ? undefined : 'Not in a git repository'}
          >
            <Chip
              active={diffVsHeadActive}
              onClick={() => onSelectBaseline('HEAD')}
              disabled={!inRepo}
            >
              vs HEAD
            </Chip>
            <Chip
              active={diffVsDefaultActive}
              onClick={() => onSelectBaseline('mergeBaseDefault')}
              disabled={!inRepo}
              title={`Diff against merge-base with origin/${defaultLabel}`}
            >
              vs {defaultLabel}
            </Chip>
            <Chip active={contentActive} onClick={onSelectContent}>
              File
            </Chip>
          </div>

          {mode === 'diff' && (
            <span title="Unified or split diff (Ctrl+Shift+M)">
              <Seg2
                ariaLabel="Diff layout"
                size="sm"
                value={viewMode}
                options={VIEW_MODES}
                onChange={onSelectViewMode}
              />
            </span>
          )}

          <Button
            variant="secondary"
            size="sm"
            data-action="copy-contents"
            onClick={copyAll}
            disabled={!content}
          >
            {copied ? 'Copied' : 'Copy all'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => invoke('open_in_editor', { path })}>
            Open in editor
          </Button>
        </>
      }
    />
  );
}
