import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { TurnFile } from '@/services/agent-overview-types';

interface DiffSnippet {
  hunks: Array<{ header: string; lines: Array<{ kind: 'add'|'delete'|'context'; content: string }> }>;
}

interface FileRowProps {
  cwd:      string;
  file:     TurnFile & { additions: number; deletions: number; status: string };
  cache:    React.MutableRefObject<Map<string, DiffSnippet | null>>;
}

const SNIPPET_LINE_CAP = 12;

export function InspectorFileRow({ cwd, file, cache }: FileRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [snippet, setSnippet] = useState<DiffSnippet | null | undefined>(cache.current.get(file.path));
  const inflight = useRef(false);

  useEffect(() => {
    if (!expanded || snippet !== undefined || inflight.current) return;
    inflight.current = true;
    (async () => {
      try {
        const result = await invoke<DiffSnippet>('diff_worktree_vs_head', {
          worktreePath: cwd, filePath: file.path,
        });
        cache.current.set(file.path, result);
        setSnippet(result);
      } catch {
        cache.current.set(file.path, null);
        setSnippet(null);
      } finally {
        inflight.current = false;
      }
    })();
  }, [expanded, snippet, file.path, cwd, cache]);

  const statusGlyph = file.status === 'added' ? 'A'
    : file.status === 'deleted' ? 'D'
    : file.status === 'renamed' ? 'R'
    : file.status === 'read' ? '·'
    : 'M';

  return (
    <div className="inspector-file-row">
      <button
        type="button"
        className="inspector-file-row__head"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="inspector-file-row__chev">{expanded ? '▾' : '▸'}</span>
        <span className="inspector-file-row__status" data-status={file.status}>{statusGlyph}</span>
        <span className="inspector-file-row__path">{file.path}</span>
        <span className="inspector-file-row__stats">
          {file.additions > 0 && <span className="inspector-file-row__add">+{file.additions}</span>}
          {file.deletions > 0 && <span className="inspector-file-row__del">−{file.deletions}</span>}
        </span>
      </button>
      {expanded && (
        <div className="inspector-file-row__body">
          {snippet === undefined && <div className="inspector-file-row__loading">loading…</div>}
          {snippet === null && <div className="inspector-file-row__empty">no preview — open in editor</div>}
          {snippet && snippet.hunks.length === 0 && (
            <div className="inspector-file-row__empty">no preview — file unchanged on disk</div>
          )}
          {snippet && snippet.hunks.length > 0 && (
            <SnippetView hunks={snippet.hunks} />
          )}
        </div>
      )}
    </div>
  );
}

function SnippetView({ hunks }: { hunks: DiffSnippet['hunks'] }) {
  let remaining = SNIPPET_LINE_CAP;
  return (
    <pre className="inspector-snippet">
      {hunks.flatMap((h, hi) => {
        if (remaining <= 0) return [];
        const taken = h.lines.slice(0, remaining);
        remaining -= taken.length;
        return [
          <div key={`h${hi}`} className="inspector-snippet__hunk">{h.header}</div>,
          ...taken.map((l, li) => (
            <div key={`l${hi}-${li}`} data-kind={l.kind} className="inspector-snippet__line">{l.content}</div>
          )),
        ];
      })}
    </pre>
  );
}
