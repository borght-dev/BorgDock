import { useEffect, useState } from 'react';
import { Card, Pill } from '@/components/shared/primitives';
import { listWorktreeChanges } from '@/services/worktree-changes';
import type {
  FileChange, WorktreeChangeSet, DiffSource,
} from '@/types/worktree-changes';
import { WorktreeChangeRow } from './WorktreeChangeRow';
import { WorktreeDiffOverlay } from './WorktreeDiffOverlay';

interface Props {
  worktreePath: string;
}

interface OpenFile {
  change: FileChange;
  source: DiffSource;
}

export function WorktreeChangesPanel({ worktreePath }: Props) {
  const [data, setData] = useState<WorktreeChangeSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);
    listWorktreeChanges(worktreePath)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(String(e)); });
    return () => {
      cancelled = true;
    };
  }, [worktreePath]);

  if (error) {
    return (
      <Card padding="md" data-worktree-changes-panel>
        <p className="text-[12px] text-[var(--color-status-red)]">{error}</p>
      </Card>
    );
  }
  if (!data) {
    return (
      <div
        data-worktree-changes-panel
        className="p-3 text-[12px] text-[var(--color-text-muted)]"
      >
        Loading changes\u2026
      </div>
    );
  }

  const empty = data.vsHead.length === 0 && data.vsBase.length === 0;

  return (
    <div
      data-worktree-changes-panel
      data-base-branch={data.baseBranch}
      data-detached-head={data.detachedHead ? 'true' : 'false'}
      className="flex flex-col h-full overflow-auto relative"
    >
      {data.mergeBaseUnavailable && (
        <Card padding="sm" className="m-2">
          <p className="text-[11px] text-[var(--color-status-yellow)]">
            Couldn&apos;t determine base branch &mdash; defaulting to <code>{data.baseBranch}</code>.
          </p>
        </Card>
      )}

      {empty && !data.mergeBaseUnavailable && (
        <div className="p-4 text-center text-[12px] text-[var(--color-text-muted)]">
          No changes in this worktree.
        </div>
      )}

      <Section
        title="Uncommitted"
        slug="vs-head"
        emptyHint="No uncommitted changes"
        files={data.vsHead}
        onClick={(c) => setOpenFile({ change: c, source: 'vs-head' })}
      />
      <Section
        title={`Ahead of ${data.baseBranch}`}
        slug="vs-base"
        emptyHint={`No commits ahead of ${data.baseBranch}`}
        files={data.vsBase}
        onClick={(c) => setOpenFile({ change: c, source: 'vs-base' })}
      />

      {openFile && (
        <WorktreeDiffOverlay
          worktreePath={worktreePath}
          baseBranch={data.baseBranch}
          change={openFile.change}
          initialSource={openFile.source}
          onClose={() => setOpenFile(null)}
        />
      )}
    </div>
  );
}

function Section({
  title, slug, emptyHint, files, onClick,
}: {
  title: string;
  slug: 'vs-head' | 'vs-base';
  emptyHint: string;
  files: FileChange[];
  onClick: (c: FileChange) => void;
}) {
  return (
    <section
      data-changes-section={slug}
      className="border-t border-[var(--color-subtle-border)]"
    >
      <header className="flex items-center gap-2 px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
        {title}
        <Pill tone="ghost">{files.length}</Pill>
      </header>
      {files.length === 0 ? (
        <p className="px-2 py-1 text-[11px] text-[var(--color-text-muted)]">{emptyHint}</p>
      ) : (
        <div>
          {files.map((c) => (
            <WorktreeChangeRow
              key={`${slug}:${c.path}`}
              change={c}
              onClick={onClick}
            />
          ))}
        </div>
      )}
    </section>
  );
}
