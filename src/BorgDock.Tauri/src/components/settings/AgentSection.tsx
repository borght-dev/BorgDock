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
  const [pairing, setPairing] = useState(false);

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

  const pair = useCallback(
    async (command: 't3_pair_local' | 't3_pair', args: Record<string, unknown>) => {
      setPairError('');
      setPairing(true);
      try {
        await invoke(command, args);
        setPairingCredential('');
        await probeT3();
      } catch (error) {
        setPairError(String(error));
      } finally {
        setPairing(false);
      }
    },
    [probeT3],
  );

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
          BorgDock starts and follows T3 threads through T3's local server. Pairing gives it a token
          that can read and operate threads, nothing else. The token lasts 30 days.
        </p>
        <Field label="T3 path" hint="Leave empty to use the default install location.">
          <TextInput
            value={agents.t3Path ?? ''}
            onChange={(t3Path) => onAgentsChange({ ...agents, t3Path: t3Path || undefined })}
            placeholder="T3 Code.exe"
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
          anchorId="t3-pairing"
          hint={
            t3?.paired
              ? 'Paired. BorgDock can start, answer and settle threads.'
              : t3?.running
                ? 'Not paired, or the pairing expired. Pair with one click, or paste a credential from t3 pair.'
                : 'T3 is closed. Start it to pair.'
          }
        >
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pairing || !t3?.running}
              className="rounded-md border border-[var(--color-input-border)] px-3 py-1 text-xs disabled:opacity-40"
              onClick={() => void pair('t3_pair_local', { executable: agents.t3Path })}
            >
              {t3?.paired ? 'Pair again' : 'Pair with T3 on this machine'}
            </button>
          </div>
          <div className="mt-2 flex gap-2">
            <div className="flex-1">
              <TextInput
                ariaLabel="T3 pairing credential"
                value={pairingCredential}
                onChange={setPairingCredential}
                type="password"
                placeholder="Or paste a pairing credential"
                mono
              />
            </div>
            <button
              type="button"
              disabled={pairing || !pairingCredential.trim()}
              className="rounded-md border border-[var(--color-input-border)] px-3 text-xs disabled:opacity-40"
              onClick={() => void pair('t3_pair', { pairingCredential })}
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
