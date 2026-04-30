import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AdoClient } from '@/services/ado/client';
import type { AzureDevOpsSettings, AdoAuthMethod } from '@/types';
import { Button, Chip, Dot, Input, Pill } from '@/components/shared/primitives';

interface AdoSectionProps {
  azureDevOps: AzureDevOpsSettings;
  onChange: (azureDevOps: AzureDevOpsSettings) => void;
}

export function AdoSection({ azureDevOps, onChange }: AdoSectionProps) {
  const [showToken, setShowToken] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');
  const [detectedStatus, setDetectedStatus] = useState<
    | { kind: 'ok' }
    | { kind: 'az_not_installed' }
    | { kind: 'az_not_logged_in' }
    | { kind: 'token_fetch_failed'; message: string }
    | null
  >(null);

  const update = (partial: Partial<AzureDevOpsSettings>) =>
    onChange({ ...azureDevOps, ...partial });

  // biome-ignore lint/correctness/useExhaustiveDependencies: run-once-on-mount detection; capturing azureDevOps/update would re-fire on every settings change
  useEffect(() => {
    if (azureDevOps.authAutoDetected) return;
    let cancelled = false;
    (async () => {
      try {
        const available = await invoke<boolean>('az_cli_available');
        if (cancelled) return;
        update({
          authMethod: available ? 'azCli' : 'pat',
          authAutoDetected: true,
        });
      } catch {
        if (cancelled) return;
        update({ authMethod: 'pat', authAutoDetected: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestError('');
    setDetectedStatus(null);
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
        if (azureDevOps.authMethod === 'azCli') {
          setDetectedStatus({ kind: 'ok' });
        }
      }
    } catch (e) {
      setTestStatus('error');
      // ado_resolve_auth_header rejection arrives here as a structured
      // error object — { kind, message } — when Rust returns AdoAuthError.
      const errObj = e as { kind?: string; message?: string };
      if (errObj?.kind === 'az_not_installed') {
        setDetectedStatus({ kind: 'az_not_installed' });
        setTestError('Azure CLI not found on PATH.');
      } else if (errObj?.kind === 'az_not_logged_in') {
        setDetectedStatus({ kind: 'az_not_logged_in' });
        setTestError('Not logged in to Azure.');
      } else if (errObj?.kind === 'token_fetch_failed') {
        setDetectedStatus({ kind: 'token_fetch_failed', message: errObj.message ?? 'Unknown error' });
        setTestError(`Couldn't fetch Azure token: ${errObj.message ?? 'Unknown error'}`);
      } else {
        setTestError('Connection failed.');
      }
    }
  };

  return (
    <div className="space-y-2.5" data-settings-section="azure-devops">
      <FieldLabel label="Organization">
        <Input
          value={azureDevOps.organization}
          onChange={(e) => update({ organization: e.target.value })}
          placeholder="my-org"
          className="w-full"
        />
      </FieldLabel>

      <FieldLabel label="Project">
        <Input
          value={azureDevOps.project}
          onChange={(e) => update({ project: e.target.value })}
          placeholder="my-project"
          className="w-full"
        />
      </FieldLabel>

      <FieldLabel label="Auth Method">
        <div className="flex gap-1">
          {(['azCli', 'pat'] as const).map((method) => (
            <Chip
              key={method}
              active={azureDevOps.authMethod === method}
              onClick={() =>
                update({ authMethod: method as AdoAuthMethod, authAutoDetected: true })
              }
              data-segmented-option
              data-active={azureDevOps.authMethod === method}
              className="flex-1 justify-center"
            >
              {method === 'azCli' ? 'Azure CLI' : 'Personal Access Token'}
            </Chip>
          ))}
        </div>
      </FieldLabel>

      {azureDevOps.authMethod === 'azCli' && detectedStatus && (
        <div className="text-[10px]">
          {detectedStatus.kind === 'ok' && (
            <div className="flex items-center gap-1">
              <Dot tone="green" />
              <Pill tone="success">
                Using your <code>az login</code> session.
              </Pill>
            </div>
          )}
          {detectedStatus.kind === 'az_not_installed' && (
            <div className="flex items-center gap-1">
              <Dot tone="red" />
              <Pill tone="error">
                Azure CLI not found on PATH. Install <code>az</code> or switch to Personal Access Token.
              </Pill>
            </div>
          )}
          {detectedStatus.kind === 'az_not_logged_in' && (
            <div className="flex items-center gap-1">
              <Dot tone="red" />
              <Pill tone="error">
                Not logged in to Azure. Run <code>az login</code> in a terminal, then click Test Connection.
              </Pill>
            </div>
          )}
          {detectedStatus.kind === 'token_fetch_failed' && (
            <div className="flex items-center gap-1">
              <Dot tone="red" />
              <Pill tone="error">
                Couldn&apos;t fetch Azure token: {detectedStatus.message}
              </Pill>
            </div>
          )}
        </div>
      )}

      {azureDevOps.authMethod === 'pat' && (
        <FieldLabel label="Personal Access Token">
          <Input
            type={showToken ? 'text' : 'password'}
            value={azureDevOps.personalAccessToken ?? ''}
            onChange={(e) => update({ personalAccessToken: e.target.value })}
            placeholder="ADO PAT"
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
        <Button
          variant="secondary"
          size="sm"
          onClick={handleTestConnection}
          disabled={testStatus === 'testing'}
        >
          {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
        </Button>
        {testStatus === 'success' && (
          <div className="flex items-center gap-1">
            <Dot tone="green" />
            <Pill tone="success">Connected</Pill>
          </div>
        )}
        {testStatus === 'error' && (
          <div className="flex items-center gap-1">
            <Dot tone="red" />
            <Pill tone="error">{testError || 'Failed'}</Pill>
          </div>
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
