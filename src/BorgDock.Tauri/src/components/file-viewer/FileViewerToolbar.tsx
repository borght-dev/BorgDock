import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useState } from 'react';
import { Button, Chip, IconButton } from '@/components/shared/primitives';
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

function XIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  );
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
      <span data-titlebar-path className="fv-path" title={path}>
        {path}
      </span>
      <div className="fv-actions">
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
          <div role="group" aria-label="Diff layout" className="flex items-center gap-1">
            <Chip
              active={viewMode === 'unified'}
              onClick={() => onSelectViewMode('unified')}
              title="Unified diff (Ctrl+Shift+M)"
            >
              Unified
            </Chip>
            <Chip
              active={viewMode === 'split'}
              onClick={() => onSelectViewMode('split')}
              title="Split diff (Ctrl+Shift+M)"
            >
              Split
            </Chip>
          </div>
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => invoke('open_in_editor', { path })}
        >
          Open in editor
        </Button>
        <IconButton
          icon={<XIcon />}
          tooltip="Close"
          aria-label="Close"
          size={22}
          onClick={() => getCurrentWindow().close()}
        />
      </div>
    </div>
  );
}
