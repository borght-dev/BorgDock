import clsx from 'clsx';
import { useState } from 'react';
import { AdoClient } from '@/services/ado/client';
import type { AzureDevOpsSettings, AdoAuthMethod } from '@/types';

interface AdoSectionProps {
  azureDevOps: AzureDevOpsSettings;
  onChange: (azureDevOps: AzureDevOpsSettings) => void;
}

export function AdoSection({ azureDevOps, onChange }: AdoSectionProps) {
  const [showToken, setShowToken] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  const update = (partial: Partial<AzureDevOpsSettings>) =>
    onChange({ ...azureDevOps, ...partial });

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestError('');
    try {
      const client = new AdoClient(
        azureDevOps.organization,
        azureDevOps.project,
        azureDevOps.personalAccessToken ?? '',
        azureDevOps.authMethod,
      );
      const error = await client.testConnection();
      if (error) {
        setTestStatus('error');
        setTestError(error);
      } else {
        setTestStatus('success');
      }
    } catch {
      setTestStatus('error');
      setTestError('Connection failed.');
    }
  };

  return (
    <div className="space-y-2.5">
      <FieldLabel label="Organization">
        <input
          className="field-input w-full"
          value={azureDevOps.organization}
          onChange={(e) => update({ organization: e.target.value })}
          placeholder="my-org"
        />
      </FieldLabel>

      <FieldLabel label="Project">
        <input
          className="field-input w-full"
          value={azureDevOps.project}
          onChange={(e) => update({ project: e.target.value })}
          placeholder="my-project"
        />
      </FieldLabel>

      <FieldLabel label="Auth Method">
        <div className="flex gap-1">
          {(['azCli', 'pat'] as const).map((method) => (
            <button
              key={method}
              className={clsx(
                'flex-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                azureDevOps.authMethod === method
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
                  : 'bg-[var(--color-filter-chip-bg)] text-[var(--color-filter-chip-fg)] hover:bg-[var(--color-surface-hover)]',
              )}
              onClick={() =>
                update({ authMethod: method as AdoAuthMethod, authAutoDetected: true })
              }
            >
              {method === 'azCli' ? 'Azure CLI' : 'Personal Access Token'}
            </button>
          ))}
        </div>
      </FieldLabel>

      {azureDevOps.authMethod === 'pat' && (
        <FieldLabel label="Personal Access Token">
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              className="field-input w-full pr-8"
              value={azureDevOps.personalAccessToken ?? ''}
              onChange={(e) => update({ personalAccessToken: e.target.value })}
              placeholder="ADO PAT"
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

      <FieldLabel label={`Poll Interval: ${azureDevOps.pollIntervalSeconds}s`}>
        <input
          type="range"
          className="w-full accent-[var(--color-accent)]"
          min={30}
          max={600}
          step={10}
          value={azureDevOps.pollIntervalSeconds}
          onChange={(e) => update({ pollIntervalSeconds: Number(e.target.value) })}
        />
      </FieldLabel>

      <div className="flex items-center gap-2">
        <button
          className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[var(--color-action-secondary-fg)] bg-[var(--color-action-secondary-bg)] border border-[var(--color-subtle-border)] hover:bg-[var(--color-surface-hover)] transition-colors disabled:opacity-50"
          onClick={handleTestConnection}
          disabled={testStatus === 'testing'}
        >
          {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
        </button>
        {testStatus === 'success' && (
          <span className="text-[10px] text-[var(--color-status-green)]">Connected</span>
        )}
        {testStatus === 'error' && (
          <span className="text-[10px] text-[var(--color-status-red)]">
            {testError || 'Failed'}
          </span>
        )}
      </div>
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
