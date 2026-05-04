import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Card, Button } from '@/components/shared/primitives';
import { Field, SectionHeader, Seg2, Slider, TextInput, ToggleRow } from '@/components/shared/primitives';
import { AdoClient } from '@/services/ado/client';
import type { AzureDevOpsSettings } from '@/types/settings';

interface Props {
  azureDevOps: AzureDevOpsSettings;
  onChange: (a: AzureDevOpsSettings) => void;
}

type DetectedStatus =
  | { kind: 'ok' }
  | { kind: 'az_not_installed' }
  | { kind: 'az_not_logged_in' }
  | { kind: 'token_fetch_failed'; message: string }
  | null;

export function AdoSection({ azureDevOps, onChange }: Props) {
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');
  const [detectedStatus, setDetectedStatus] = useState<DetectedStatus>(null);

  const update = (partial: Partial<AzureDevOpsSettings>) =>
    onChange({ ...azureDevOps, ...partial });

  // Auto-detect az CLI on first mount only
  // biome-ignore lint/correctness/useExhaustiveDependencies: run-once-on-mount detection
  useEffect(() => {
    if (azureDevOps.authAutoDetected) return;
    let cancelled = false;
    (async () => {
      try {
        const available = await invoke<boolean>('az_cli_available');
        if (cancelled) return;
        update({ authMethod: available ? 'azCli' : 'pat', authAutoDetected: true });
      } catch {
        if (cancelled) return;
        update({ authMethod: 'pat', authAutoDetected: true });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <>
      <SectionHeader
        title="Azure DevOps"
        subtitle="BorgDock pulls work-items, build status and policy info from Azure DevOps to enrich PR cards."
      />

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">Connection</h3>

        <div className="grid grid-cols-2 gap-3.5">
          <Field label="Organization" dense anchorId="organization">
            <TextInput
              ariaLabel="ADO organization"
              value={azureDevOps.organization}
              onChange={(organization) => update({ organization })}
              placeholder="my-org"
            />
          </Field>
          <Field label="Project" dense anchorId="project">
            <TextInput
              ariaLabel="ADO project"
              value={azureDevOps.project}
              onChange={(project) => update({ project })}
              placeholder="my-project"
            />
          </Field>
        </div>

        <Field label="Auth method" anchorId="auth-method">
          <Seg2
            value={azureDevOps.authMethod === 'pat' ? 'pat' : 'cli'}
            options={[
              { value: 'cli', label: 'Azure CLI' },
              { value: 'pat', label: 'Personal Access Token' },
            ]}
            onChange={(v) => update({ authMethod: v === 'pat' ? 'pat' : 'azCli' })}
          />
        </Field>

        {azureDevOps.authMethod === 'pat' && (
          <Field label="Personal Access Token" hint="Needs work-item read scope.">
            <TextInput
              ariaLabel="ADO personal access token"
              value={azureDevOps.personalAccessToken ?? ''}
              onChange={(personalAccessToken) => update({ personalAccessToken })}
              type="password"
              mono
              placeholder="…"
            />
          </Field>
        )}

        <Field label="Poll interval" anchorId="poll-interval">
          <Slider
            ariaLabel="ADO poll interval"
            value={azureDevOps.pollIntervalSeconds}
            min={30}
            max={900}
            step={10}
            suffix="s"
            onChange={(pollIntervalSeconds) => update({ pollIntervalSeconds })}
          />
        </Field>

        {testStatus === 'success' && (
          <div className="mb-[18px] flex items-center gap-2 rounded-md border border-[var(--color-success-badge-border)] bg-[var(--color-success-badge-bg)] px-3 py-2 text-xs text-[var(--color-success-badge-fg)]">
            ✓ Connection successful
          </div>
        )}
        {testStatus === 'error' && (
          <div className="mb-[18px] rounded-md border border-[var(--color-error-badge-border)] bg-[var(--color-error-badge-bg)] px-3 py-2 text-xs text-[var(--color-error-badge-fg)]">
            <div className="font-medium">{testError || 'Connection failed.'}</div>
            {detectedStatus?.kind === 'az_not_installed' && (
              <div className="mt-1 text-[11px] opacity-80">
                Install the Azure CLI from <code className="font-mono">https://aka.ms/installazurecliwindows</code>, or switch to Personal Access Token above.
              </div>
            )}
            {detectedStatus?.kind === 'az_not_logged_in' && (
              <div className="mt-1 text-[11px] opacity-80">
                Run <code className="font-mono">az login</code> in a terminal, then test again.
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={handleTestConnection} disabled={testStatus === 'testing'}>
            {testStatus === 'testing' ? 'Testing…' : 'Test connection'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!azureDevOps.organization}
            onClick={() => openUrl(`https://dev.azure.com/${azureDevOps.organization}`).catch(console.error)}
          >
            Open ADO
          </Button>
        </div>
      </Card>

      <Card variant="default" padding="md">
        <h3 className="mb-1.5 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Work-item linking
        </h3>
        <p className="mb-3.5 text-[11.5px] leading-relaxed text-[var(--color-text-tertiary)]">
          How BorgDock matches a PR to its ADO work-item.
        </p>

        <Field label="Match by" anchorId="match-by">
          <Seg2
            value={azureDevOps.linkMatchBy}
            options={[
              { value: 'branch', label: 'Branch name' },
              { value: 'title',  label: 'PR title (AB#)' },
              { value: 'both',   label: 'Both' },
            ]}
            onChange={(v) => update({ linkMatchBy: v as 'branch' | 'title' | 'both' })}
          />
        </Field>

        <ToggleRow
          label="Show work-item state on PR card"
          on={azureDevOps.showWorkItemStateOnPrCard}
          onChange={(showWorkItemStateOnPrCard) => update({ showWorkItemStateOnPrCard })}
        />
        <ToggleRow
          label="Update PR status when WI moves to Done"
          on={azureDevOps.updatePrStatusWhenWiDone}
          onChange={(updatePrStatusWhenWiDone) => update({ updatePrStatusWhenWiDone })}
          last
        />
      </Card>
    </>
  );
}
