import clsx from 'clsx';
import { useState } from 'react';
import { Button, Card, Input } from '../shared/primitives';

interface DiscoveredRepo {
  owner: string;
  name: string;
  localPath: string;
  isSelected: boolean;
}

interface RepoStepProps {
  repos: DiscoveredRepo[];
  isScanning: boolean;
  onToggleRepo: (index: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onAddRepo: (repo: DiscoveredRepo) => void;
}

export function RepoStep({
  repos,
  isScanning,
  onToggleRepo,
  onSelectAll,
  onDeselectAll,
  onAddRepo,
}: RepoStepProps) {
  const [manualInput, setManualInput] = useState('');
  const [addError, setAddError] = useState('');

  const handleAdd = async () => {
    const input = manualInput.trim();
    if (!input) return;
    setAddError('');

    // Check if it looks like a local path (drive letter or starts with / or \)
    const isPath = /^[a-zA-Z]:[/\\]/.test(input) || input.startsWith('/') || input.startsWith('\\');

    if (isPath) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const repo = await invoke<{ owner: string; name: string; localPath: string }>(
          'resolve_repo_path',
          { path: input },
        );
        const exists = repos.some((r) => r.owner === repo.owner && r.name === repo.name);
        if (!exists) {
          onAddRepo({ ...repo, isSelected: true });
        }
        setManualInput('');
      } catch {
        setAddError('Not a valid git repo with a remote');
      }
    } else if (input.includes('/')) {
      const [owner, ...rest] = input.split('/');
      const name = rest.join('/');
      if (owner && name) {
        const exists = repos.some((r) => r.owner === owner && r.name === name);
        if (!exists) {
          onAddRepo({ owner, name, localPath: '', isSelected: true });
        }
        setManualInput('');
      }
    } else {
      setAddError('Enter a local path or owner/name');
    }
  };

  return (
    <div className="flex flex-col gap-4" data-wizard-step="repos">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-text-primary">Select Repositories</h2>
        <p className="mt-1 text-xs text-text-tertiary">
          Add repos by path or owner/name, or select from discovered repos
        </p>
      </div>

      {/* Manual add */}
      <div className="flex gap-2">
        <Input
          type="text"
          value={manualInput}
          onChange={(e) => {
            setManualInput(e.target.value);
            setAddError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="D:\repos\my-project or owner/name"
          className="flex-1"
        />
        <Button variant="primary" size="sm" onClick={handleAdd}>
          Add
        </Button>
      </div>
      {addError && <p className="-mt-2 text-[10px] text-status-red">{addError}</p>}

      {/* Bulk actions */}
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onSelectAll}>
          Select All
        </Button>
        <Button variant="secondary" size="sm" onClick={onDeselectAll}>
          Deselect All
        </Button>
        {isScanning && (
          <span className="text-[11px] text-text-muted animate-pulse">Scanning...</span>
        )}
      </div>

      {/* Repo list */}
      <div className="max-h-[280px] space-y-1 overflow-y-auto">
        {repos.map((repo, i) => (
          <Card
            key={`${repo.owner}/${repo.name}`}
            variant="default"
            padding="sm"
            interactive
            data-repo-row
            data-repo-name={repo.name}
            className={clsx(
              repo.isSelected
                ? 'border-accent bg-accent-subtle'
                : 'border-subtle-border hover:border-strong-border',
            )}
            onClick={() => onToggleRepo(i)}
          >
            <div className="flex items-center gap-3">
              {/* Checkbox */}
              <div
                className={clsx(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                  repo.isSelected
                    ? 'border-accent bg-accent'
                    : 'border-input-border',
                )}
              >
                {repo.isSelected && (
                  <span className="text-[10px] text-accent-foreground">&#10003;</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-text-primary">
                  {repo.owner}/{repo.name}
                </div>
                <div className="truncate text-[10px] font-mono text-text-muted">
                  {repo.localPath}
                </div>
              </div>
            </div>
          </Card>
        ))}

        {!isScanning && repos.length === 0 && (
          <div className="py-6 text-center text-xs text-text-muted">
            No repositories discovered. Add repos manually in Settings.
          </div>
        )}
      </div>
    </div>
  );
}
