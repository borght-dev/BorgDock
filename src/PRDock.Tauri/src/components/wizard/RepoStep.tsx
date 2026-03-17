import clsx from 'clsx';

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
}

export function RepoStep({ repos, isScanning, onToggleRepo, onSelectAll, onDeselectAll }: RepoStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Select Repositories
        </h2>
        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
          Choose which repositories to monitor
        </p>
      </div>

      {/* Bulk actions */}
      <div className="flex items-center gap-2">
        <button
          className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)] transition-colors"
          onClick={onSelectAll}
        >
          Select All
        </button>
        <button
          className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)] transition-colors"
          onClick={onDeselectAll}
        >
          Deselect All
        </button>
        {isScanning && (
          <span className="text-[11px] text-[var(--color-text-muted)] animate-pulse">
            Discovering repositories...
          </span>
        )}
      </div>

      {/* Repo list */}
      <div className="max-h-[280px] space-y-1 overflow-y-auto">
        {repos.map((repo, i) => (
          <div
            key={`${repo.owner}/${repo.name}`}
            className={clsx(
              'flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-all',
              repo.isSelected
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
                : 'border-[var(--color-subtle-border)] hover:border-[var(--color-strong-border)]'
            )}
            onClick={() => onToggleRepo(i)}
          >
            {/* Checkbox */}
            <div
              className={clsx(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                repo.isSelected
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]'
                  : 'border-[var(--color-input-border)]'
              )}
            >
              {repo.isSelected && (
                <span className="text-[10px] text-[var(--color-accent-foreground)]">&#10003;</span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-[var(--color-text-primary)]">
                {repo.owner}/{repo.name}
              </div>
              <div className="truncate text-[10px] font-mono text-[var(--color-text-muted)]">
                {repo.localPath}
              </div>
            </div>
          </div>
        ))}

        {!isScanning && repos.length === 0 && (
          <div className="py-6 text-center text-xs text-[var(--color-text-muted)]">
            No repositories discovered. Add repos manually in Settings.
          </div>
        )}
      </div>
    </div>
  );
}
