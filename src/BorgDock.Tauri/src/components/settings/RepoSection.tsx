import { useCallback, useState } from 'react';
import type { RepoSettings } from '@/types';
import { Button, Card, IconButton, Input } from '@/components/shared/primitives';
import { ToggleSwitch } from './_ToggleSwitch';

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
    (index: number, next: boolean) => {
      const updated = repos.map((r, i) => (i === index ? { ...r, enabled: next } : r));
      onChange(updated);
    },
    [repos, onChange],
  );

  const updateRepo = useCallback(
    (index: number, patch: Partial<RepoSettings>) => {
      const updated = repos.map((r, i) => (i === index ? { ...r, ...patch } : r));
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

  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <div className="space-y-2.5" data-settings-section="repos">
      {/* Repo list */}
      {repos.map((repo, i) => (
        <Card
          key={`${repo.owner}/${repo.name}`}
          variant="default"
          padding="sm"
          interactive
          data-repo-row
          data-repo-name={repo.name}
        >
          <div className="flex items-center gap-2">
            {/* Toggle */}
            <ToggleSwitch
              checked={repo.enabled}
              onChange={(next) => toggleRepo(i, next)}
              aria-label={`Enable ${repo.name}`}
            />

            <button
              className="flex-1 truncate text-xs text-[var(--color-text-primary)] text-left cursor-pointer hover:text-[var(--color-accent)] transition-colors"
              onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
            >
              {repo.owner}/{repo.name}
            </button>

            <IconButton
              size={22}
              icon={<span aria-hidden>&#10005;</span>}
              aria-label="Remove"
              onClick={() => removeRepo(i)}
            />
          </div>

          {/* Expanded settings */}
          {expandedIndex === i && (
            <div className="mt-2 space-y-2 border-t border-[var(--color-separator)] pt-2">
              <div>
                <label className="text-[10px] text-[var(--color-text-muted)]">
                  Worktree base path
                </label>
                <Input
                  className="w-full"
                  value={repo.worktreeBasePath}
                  onChange={(e) => updateRepo(i, { worktreeBasePath: e.target.value })}
                  placeholder="e.g. D:\repos\my-project"
                />
              </div>
              <div>
                <label className="text-[10px] text-[var(--color-text-muted)]">
                  Claude instructions (for Fix &amp; Monitor)
                </label>
                <textarea
                  className="field-input w-full resize-y"
                  rows={3}
                  value={repo.fixPromptTemplate ?? ''}
                  onChange={(e) =>
                    updateRepo(i, {
                      fixPromptTemplate: e.target.value || undefined,
                    })
                  }
                  placeholder="e.g. When E2E tests fail, use /fix-e2e to fix them."
                />
              </div>
            </div>
          )}
        </Card>
      ))}

      {/* Add form */}
      <div className="flex items-end gap-1.5">
        <div className="flex-1">
          <label className="text-[10px] text-[var(--color-text-muted)]">Owner</label>
          <Input
            className="w-full"
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
            placeholder="owner"
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-[var(--color-text-muted)]">Name</label>
          <Input
            className="w-full"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="repo"
            onKeyDown={(e) => e.key === 'Enter' && addRepo()}
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={addRepo}
          disabled={!newOwner.trim() || !newName.trim()}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
