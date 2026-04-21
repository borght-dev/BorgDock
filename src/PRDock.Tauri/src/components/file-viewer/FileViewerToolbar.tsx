import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useState } from 'react';

interface Props {
  path: string;
  content: string | null;
}

export function FileViewerToolbar({ path, content }: Props) {
  const [copied, setCopied] = useState(false);
  const copyAll = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch { /* ignore */ }
  };

  return (
    <div className="fv-toolbar" data-tauri-drag-region>
      <span className="fv-path" title={path}>{path}</span>
      <div className="fv-actions">
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
