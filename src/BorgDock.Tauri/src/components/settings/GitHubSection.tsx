import { useState } from 'react';
import type { GitHubSettings } from '@/types';
import { Button, Chip, Input } from '@/components/shared/primitives';

interface GitHubSectionProps {
  github: GitHubSettings;
  onChange: (github: GitHubSettings) => void;
}

export function GitHubSection({ github, onChange }: GitHubSectionProps) {
  const [showToken, setShowToken] = useState(false);

  const update = (partial: Partial<GitHubSettings>) => onChange({ ...github, ...partial });

  return (
    <div className="space-y-2.5" data-settings-section="github" data-auth-method={github.authMethod}>
      {/* Auth method */}
      <FieldLabel label="Auth Method">
        <div className="flex gap-1">
          {(['ghCli', 'pat'] as const).map((method) => (
            <Chip
              key={method}
              active={github.authMethod === method}
              onClick={() => update({ authMethod: method })}
              data-segmented-option
              data-active={github.authMethod === method}
              className="flex-1 justify-center"
            >
              {method === 'ghCli' ? 'GitHub CLI' : 'Personal Access Token'}
            </Chip>
          ))}
        </div>
      </FieldLabel>

      {/* PAT input */}
      {github.authMethod === 'pat' && (
        <FieldLabel label="Personal Access Token">
          <Input
            type={showToken ? 'text' : 'password'}
            value={github.personalAccessToken ?? ''}
            onChange={(e) => update({ personalAccessToken: e.target.value })}
            placeholder="ghp_..."
            className="w-full"
            trailing={
              <button
                className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                onClick={() => setShowToken((prev) => !prev)}
                type="button"
              >
                {showToken ? 'Hide' : 'Show'}
              </button>
            }
          />
        </FieldLabel>
      )}

      {/* Username */}
      <FieldLabel label="Username">
        <Input
          value={github.username}
          onChange={(e) => update({ username: e.target.value })}
          placeholder="GitHub username"
          className="w-full"
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
      <Button variant="secondary" size="sm">
        Test Connection
      </Button>
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
