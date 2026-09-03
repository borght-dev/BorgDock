import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';
import { Card, Field, SectionHeader, Select, TextInput } from '@/components/shared/primitives';
import type {
  AgentProvider,
  AgentSettings,
  PostFixAction,
  SummarySettings,
} from '@/types/settings';

interface Props {
  agents: AgentSettings;
  summaries: SummarySettings;
  onAgentsChange: (settings: AgentSettings) => void;
  onSummariesChange: (settings: SummarySettings) => void;
}

const PROVIDERS = [
  { value: 'claude', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
];

const POST_FIX_OPTIONS = [
  { value: 'commitAndNotify', label: 'Commit & Notify' },
  { value: 'commitOnly', label: 'Commit Only' },
  { value: 'notifyOnly', label: 'Notify Only' },
  { value: 'none', label: 'None' },
];

export function AgentSection({ agents, summaries, onAgentsChange, onSummariesChange }: Props) {
  const [availability, setAvailability] = useState<{ claude: boolean; codex: boolean } | null>(
    null,
  );
  const [t3, setT3] = useState<{ running: boolean; paired: boolean } | null>(null);
  const [pairingCredential, setPairingCredential] = useState('');
  const [pairError, setPairError] = useState('');

  useEffect(() => {
    invoke<{ claude: boolean; codex: boolean }>('agent_provider_availability', {
      claudePath: agents.claudePath,
      codexPath: agents.codexPath,
    })
      .then(setAvailability)
      .catch(() => setAvailability(null));
  }, [agents.claudePath, agents.codexPath]);

  const probeT3 = useCallback(
    () =>
      invoke<{ running: boolean; paired: boolean }>('t3_probe')
        .then(setT3)
        .catch(() => setT3({ running: false, paired: false })),
    [],
  );

  useEffect(() => {
    void probeT3();
  }, [probeT3]);

  return (
    <>
      <SectionHeader
        title="Agents"
        subtitle="Choose where interactive work runs and which authenticated CLI creates summaries."
      />
      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold text-[var(--color-text-primary)]">
          Interactive sessions
        </h3>
        <Field label="Default provider" anchorId="default-agent-provider">
          <Select
            ariaLabel="Default agent provider"
            value={agents.defaultProvider}
            options={PROVIDERS}
            onChange={(defaultProvider) =>
              onAgentsChange({ ...agents, defaultProvider: defaultProvider as AgentProvider })
            }
          />
        </Field>
        <Field label="Post-fix action">
          <Select
            value={agents.defaultPostFixAction}
            options={POST_FIX_OPTIONS}
            onChange={(defaultPostFixAction) =>
              onAgentsChange({
                ...agents,
                defaultPostFixAction: defaultPostFixAction as PostFixAction,
              })
            }
          />
        </Field>
        <Field
          label="Claude path"
          hint={availability?.claude === false ? 'Claude was not found.' : undefined}
        >
          <TextInput
            value={agents.claudePath ?? ''}
            onChange={(claudePath) =>
              onAgentsChange({ ...agents, claudePath: claudePath || undefined })
            }
            placeholder="claude"
            mono
          />
        </Field>
        <Field
          label="Codex path"
          hint={availability?.codex === false ? 'Codex was not found.' : undefined}
        >
          <TextInput
            value={agents.codexPath ?? ''}
            onChange={(codexPath) =>
              onAgentsChange({ ...agents, codexPath: codexPath || undefined })
            }
            placeholder="codex"
            mono
          />
        </Field>
        <Field label="Codex model">
          <TextInput
            value={agents.codexModel ?? ''}
            onChange={(codexModel) =>
              onAgentsChange({ ...agents, codexModel: codexModel || undefined })
            }
            placeholder="Use Codex default"
            mono
          />
        </Field>
      </Card>

      <Card variant="default" padding="md">
        <h3 className="mb-1 text-[13px] font-semibold text-[var(--color-text-primary)]">T3 Code</h3>
        <p className="mb-3 text-[11.5px] text-[var(--color-text-muted)]">
          "Open a new thread in T3" on a pull request creates a thread on the PR's worktree and
          brings T3 to the front.
        </p>
        <Field label="T3 path" hint="Leave empty to use the default install location.">
          <TextInput
            value={agents.t3Path ?? ''}
            onChange={(t3Path) => onAgentsChange({ ...agents, t3Path: t3Path || undefined })}
            placeholder="T3 Code (Alpha).exe"
            mono
          />
        </Field>
        <Field label="T3 model" hint="Only used when T3 has no default model for the project yet.">
          <TextInput
            value={agents.t3Model}
            onChange={(t3Model) => onAgentsChange({ ...agents, t3Model })}
            placeholder="claude-fable-5"
            mono
          />
        </Field>
        <Field label="T3 model instance">
          <TextInput
            value={agents.t3ModelInstance}
            onChange={(t3ModelInstance) => onAgentsChange({ ...agents, t3ModelInstance })}
            placeholder="claudeAgent"
            mono
          />
        </Field>
        <Field
          label="T3 pairing"
          hint={
            t3?.paired
              ? 'Paired. New threads are created and linked to the PR automatically.'
              : t3?.running
                ? 'Paste a one-time credential from t3 pair. Without it BorgDock can only bring T3 to the front.'
                : 'T3 is closed. Start it to pair or to open threads.'
          }
        >
          <div className="flex gap-2">
            <div className="flex-1">
              <TextInput
                ariaLabel="T3 pairing credential"
                value={pairingCredential}
                onChange={setPairingCredential}
                type="password"
                placeholder={t3?.paired ? 'Paired' : 'Paste pairing credential'}
                mono
              />
            </div>
            <button
              type="button"
              disabled={!pairingCredential.trim()}
              className="rounded-md border border-[var(--color-input-border)] px-3 text-xs disabled:opacity-40"
              onClick={async () => {
                setPairError('');
                try {
                  await invoke('t3_pair', { pairingCredential });
                  setPairingCredential('');
                  await probeT3();
                } catch (error) {
                  setPairError(String(error));
                }
              }}
            >
              Pair
            </button>
          </div>
          {pairError && (
            <p className="mt-1 text-[10.5px] text-[var(--color-status-red)]">{pairError}</p>
          )}
        </Field>
      </Card>

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold text-[var(--color-text-primary)]">
          Summaries
        </h3>
        <Field
          label="Provider"
          hint="Uses your existing CLI login. No API key is stored by BorgDock."
        >
          <Select
            ariaLabel="Summary provider"
            value={summaries.provider}
            options={PROVIDERS}
            onChange={(provider) =>
              onSummariesChange({ ...summaries, provider: provider as AgentProvider })
            }
          />
        </Field>
        <Field label="Model" hint="Claude aliases such as sonnet stay current automatically.">
          <TextInput
            value={summaries.model}
            onChange={(model) => onSummariesChange({ ...summaries, model })}
            placeholder={summaries.provider === 'claude' ? 'sonnet' : 'Use Codex default'}
            mono
          />
        </Field>
      </Card>
    </>
  );
}
