import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button, Checkbox } from '@/components/shared/primitives';
import type { RepoSettings } from '@/types/settings';

interface Candidate {
  path: string;
  owner: string | null;
  name: string;
  alreadyTracked: boolean;
}

interface Props {
  isOpen: boolean;
  parentPath: string;
  onClose: () => void;
  onAdd: (selected: RepoSettings[]) => void;
}

export function RepoScanDialog({ isOpen, parentPath, onClose, onAdd }: Props) {
  const [results, setResults] = useState<Candidate[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setResults([]);
    setPicked(new Set());
    setError(null);
    invoke<Candidate[]>('scan_repos_under', { path: parentPath })
      .then(setResults)
      .catch((e) => setError(String(e)));
  }, [isOpen, parentPath]);

  if (!isOpen) return null;

  const untracked = results.filter((r) => !r.alreadyTracked && r.owner);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan results"
      className="fixed inset-0 z-50 grid place-items-center bg-[var(--color-overlay-bg)]"
    >
      <div className="w-[480px] rounded-lg bg-[var(--color-surface)] p-5 shadow-xl">
        <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
          Repositories under <code className="font-mono text-xs">{parentPath}</code>
        </h3>
        {error && (
          <div className="mb-3 rounded-md border border-[var(--color-error-badge-border)] bg-[var(--color-error-badge-bg)] px-3 py-2 text-xs text-[var(--color-error-badge-fg)]">
            {error}
          </div>
        )}
        {!error && untracked.length === 0 && (
          <p className="text-xs text-[var(--color-text-muted)]">
            {results.length === 0
              ? 'Scanning…'
              : 'Nothing new to add — every git repo here is already tracked.'}
          </p>
        )}
        {untracked.length > 0 && (
          <ul className="max-h-[300px] space-y-1 overflow-auto">
            {untracked.map((c) => (
              <li key={c.path}>
                <Checkbox
                  checked={picked.has(c.path)}
                  onChange={(on) => {
                    const n = new Set(picked);
                    if (on) n.add(c.path);
                    else n.delete(c.path);
                    setPicked(n);
                  }}
                  label={`${c.owner ?? '?'}/${c.name}`}
                  hint={c.path}
                />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={picked.size === 0}
            onClick={() => {
              const selected: RepoSettings[] = untracked
                .filter((c) => picked.has(c.path) && c.owner)
                .map((c) => ({
                  owner: c.owner!,
                  name: c.name,
                  enabled: true,
                  worktreeBasePath: c.path,
                  worktreeSubfolder: '.worktrees',
                }));
              onAdd(selected);
              onClose();
            }}
          >
            Add {picked.size > 0 ? picked.size : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}
