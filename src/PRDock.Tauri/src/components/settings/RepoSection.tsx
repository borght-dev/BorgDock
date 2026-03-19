import clsx from 'clsx';
import { useCallback, useState } from 'react';
import type { RepoSettings } from '@/types';

interface RepoSectionProps {
  repos: RepoSettings[];
  onChange: (repos: RepoSettings[]) => void;
}

export function RepoSection({ repos, onChange }: RepoSectionProps) {
  const [newOwner, setNewOwner] = useState('');
  const [newName, setNewName] = useState('');

  const addRepo = useCallback(() => {
    if (!newOwner.trim() || !newName.trim()) return;
    onChange([
      ...repos,
      {
        owner: newOwner.trim(),
        name: newName.trim(),
        enabled: true,
        worktreeBasePath: '',
        worktreeSubfolder: '.worktrees',
      },
    ]);
    setNewOwner('');
    setNewName('');
  }, [newOwner, newName, repos, onChange]);

  const toggleRepo = useCallback(
    (index: number) => {
      const updated = repos.map((r, i) => (i === index ? { ...r, enabled: !r.enabled } : r));
      onChange(updated);
    },
    [repos, onChange],
  );

  const removeRepo = useCallback(
    (index: number) => {
      onChange(repos.filter((_, i) => i !== index));
    },
    [repos, onChange],
  );

  return (
    <div className="space-y-2.5">
      {/* Repo list */}
      {repos.map((repo, i) => (
        <div
          key={`${repo.owner}/${repo.name}`}
          className="flex items-center gap-2 rounded-md border border-[var(--color-subtle-border)] px-2.5 py-1.5"
        >
          {/* Toggle */}
          <button
            className={clsx(
              'h-4 w-7 rounded-full transition-colors relative shrink-0',
              repo.enabled ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-filter-chip-bg)]',
            )}
            onClick={() => toggleRepo(i)}
          >
            <span
              className={clsx(
                'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform shadow-sm',
                repo.enabled ? 'left-3.5' : 'left-0.5',
              )}
            />
          </button>

          <span className="flex-1 truncate text-xs text-[var(--color-text-primary)]">
            {repo.owner}/{repo.name}
          </span>

          <button
            className="text-[10px] text-[var(--color-text-ghost)] hover:text-[var(--color-status-red)] transition-colors"
            onClick={() => removeRepo(i)}
          >
            &#10005;
          </button>
        </div>
      ))}

      {/* Add form */}
      <div className="flex items-end gap-1.5">
        <div className="flex-1">
          <label className="text-[10px] text-[var(--color-text-muted)]">Owner</label>
          <input
            className="field-input w-full"
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
            placeholder="owner"
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-[var(--color-text-muted)]">Name</label>
          <input
            className="field-input w-full"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="repo"
            onKeyDown={(e) => e.key === 'Enter' && addRepo()}
          />
        </div>
        <button
          className="shrink-0 rounded-md px-2 py-[7px] text-[11px] font-medium text-[var(--color-accent-foreground)] bg-[var(--color-accent)] hover:opacity-90 transition-opacity disabled:opacity-40"
          onClick={addRepo}
          disabled={!newOwner.trim() || !newName.trim()}
        >
          Add
        </button>
      </div>
    </div>
  );
}
