import clsx from 'clsx';
import { useState } from 'react';
import type { GitHubSettings } from '@/types';

interface GitHubSectionProps {
  github: GitHubSettings;
  onChange: (github: GitHubSettings) => void;
}

export function GitHubSection({ github, onChange }: GitHubSectionProps) {
  const [showToken, setShowToken] = useState(false);

  const update = (partial: Partial<GitHubSettings>) => onChange({ ...github, ...partial });

  return (
    <div className="space-y-2.5">
      {/* Auth method */}
      <FieldLabel label="Auth Method">
        <div className="flex gap-1">
          {(['ghCli', 'pat'] as const).map((method) => (
            <button
              key={method}
              className={clsx(
                'flex-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                github.authMethod === method
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
                  : 'bg-[var(--color-filter-chip-bg)] text-[var(--color-filter-chip-fg)] hover:bg-[var(--color-surface-hover)]',
              )}
              onClick={() => update({ authMethod: method })}
            >
              {method === 'ghCli' ? 'GitHub CLI' : 'Personal Access Token'}
            </button>
          ))}
        </div>
      </FieldLabel>

      {/* PAT input */}
      {github.authMethod === 'pat' && (
        <FieldLabel label="Personal Access Token">
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              className="field-input w-full pr-8"
              value={github.personalAccessToken ?? ''}
              onChange={(e) => update({ personalAccessToken: e.target.value })}
              placeholder="ghp_..."
            />
            <button
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              onClick={() => setShowToken((prev) => !prev)}
              type="button"
            >
              {showToken ? 'Hide' : 'Show'}
            </button>
          </div>
        </FieldLabel>
      )}

      {/* Username */}
      <FieldLabel label="Username">
        <input
          className="field-input w-full"
          value={github.username}
          onChange={(e) => update({ username: e.target.value })}
          placeholder="GitHub username"
        />
      </FieldLabel>

      {/* Poll interval */}
      <FieldLabel label={`Poll Interval: ${github.pollIntervalSeconds}s`}>
        <input
          type="range"
          className="w-full accent-[var(--color-accent)]"
          min={15}
          max={300}
          step={5}
          value={github.pollIntervalSeconds}
          onChange={(e) => update({ pollIntervalSeconds: Number(e.target.value) })}
        />
      </FieldLabel>

      {/* Test connection */}
      <button className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[var(--color-action-secondary-fg)] bg-[var(--color-action-secondary-bg)] border border-[var(--color-subtle-border)] hover:bg-[var(--color-surface-hover)] transition-colors">
        Test Connection
      </button>
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-[var(--color-text-tertiary)]">{label}</label>
      {children}
    </div>
  );
}
