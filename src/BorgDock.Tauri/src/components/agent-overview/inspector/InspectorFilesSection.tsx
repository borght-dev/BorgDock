import { useEffect, useRef, useState } from 'react';
import type { SessionRecord } from '@/services/agent-overview-types';
import { fetchTurnFilesDiffstat } from '@/services/agent-overview';
import { InspectorFileRow } from './InspectorFileRow';

interface DiffSnippet {
  hunks: Array<{ header: string; lines: Array<{ kind: 'add'|'delete'|'context'; content: string }> }>;
}

export function InspectorFilesSection({ session }: { session: SessionRecord }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchTurnFilesDiffstat>>>([]);
  const snippetCache = useRef(new Map<string, DiffSnippet | null>());

  useEffect(() => {
    let cancelled = false;
    fetchTurnFilesDiffstat(session.cwd, session.currentTurnFiles).then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => { cancelled = true; };
  }, [session.cwd, session.currentTurnFiles]);

  const totalAdd = rows.reduce((s, r) => s + r.additions, 0);
  const totalDel = rows.reduce((s, r) => s + r.deletions, 0);

  if (session.currentTurnFiles.length === 0) return null;

  return (
    <section className="inspector-files">
      <header className="inspector-files__head">
        <span>Files changed ({rows.length || session.currentTurnFiles.length})</span>
        {totalAdd > 0 && <span className="inspector-files__add">+{totalAdd}</span>}
        {totalDel > 0 && <span className="inspector-files__del">−{totalDel}</span>}
      </header>
      {rows.map((r) => (
        <InspectorFileRow key={r.path} cwd={session.cwd} file={r} cache={snippetCache} />
      ))}
    </section>
  );
}
