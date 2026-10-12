import { invoke } from '@tauri-apps/api/core';
import { X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Field, IconButton, TextInput } from '@/components/shared/primitives';
import { addressProblem } from '@/services/dispatch/hosts';
import type { T3HostSettings } from '@/types/settings';

interface Props {
  hosts: T3HostSettings[];
  onChange: (hosts: T3HostSettings[]) => void;
}

interface Probe {
  running: boolean;
  paired: boolean;
}

const NOT_REACHABLE: Probe = { running: false, paired: false };

function statusOf(probe: Probe | null): { text: string; tone: 'ok' | 'warn' | 'muted' } {
  if (!probe) return { text: 'Checking…', tone: 'muted' };
  if (!probe.running) return { text: 'Not reachable', tone: 'warn' };
  return probe.paired ? { text: 'Paired', tone: 'ok' } : { text: 'Not paired', tone: 'warn' };
}

const TONE_COLOR = {
  ok: 'var(--color-status-green)',
  warn: 'var(--color-warning-badge-fg)',
  muted: 'var(--color-text-muted)',
};

function HostRow({ host, onRemove }: { host: T3HostSettings; onRemove: () => void }) {
  const [probe, setProbe] = useState<Probe | null>(null);
  const [credential, setCredential] = useState('');
  const [error, setError] = useState('');
  const [pairing, setPairing] = useState(false);
  const { id, baseUrl } = host;

  const check = useCallback(
    () =>
      invoke<Probe>('t3_probe', { host: { id, baseUrl } })
        .then(setProbe)
        .catch(() => setProbe(NOT_REACHABLE)),
    [id, baseUrl],
  );

  useEffect(() => {
    void check();
  }, [check]);

  const pair = async () => {
    setError('');
    setPairing(true);
    try {
      await invoke('t3_pair', { pairingCredential: credential, host: { id, baseUrl } });
      setCredential('');
      await check();
    } catch (err) {
      setError(String(err));
    } finally {
      setPairing(false);
    }
  };

  const remove = async () => {
    // The token goes with the host; a failure to delete it must not keep the host.
    await invoke('t3_unpair', { host: { id, baseUrl } }).catch(() => {});
    onRemove();
  };

  const status = statusOf(probe);
  const name = host.label || host.baseUrl;

  return (
    <div
      className="rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface)] p-3"
      data-t3-host={host.id}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-[var(--color-text-primary)]">
            {name}
          </div>
          <div className="truncate font-mono text-[11px] text-[var(--color-text-muted)]">
            {host.baseUrl}
          </div>
        </div>
        <span className="text-[11px] font-medium" style={{ color: TONE_COLOR[status.tone] }}>
          {status.text}
        </span>
        <IconButton
          aria-label={`Remove T3 host ${name}`}
          size={22}
          icon={<X size={13} strokeWidth={1.5} />}
          onClick={() => void remove()}
        />
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
        <TextInput
          ariaLabel={`Pairing link for ${name}`}
          value={credential}
          onChange={setCredential}
          type="password"
          placeholder={probe?.paired ? 'Paste a new pairing link to pair again' : 'Pairing link'}
          mono
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={pairing || !credential.trim()}
          onClick={() => void pair()}
        >
          Pair
        </Button>
      </div>
      {error && <p className="mt-1 text-[10.5px] text-[var(--color-status-red)]">{error}</p>}
    </div>
  );
}

/**
 * T3HostsCard — the T3 Code servers on other machines that Dispatch follows.
 * A host's address is set when it is added; to change it, remove the host and
 * add it again, so Dispatch never polls a half-typed address.
 */
export function T3HostsCard({ hosts, onChange }: Props) {
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [problem, setProblem] = useState('');

  const add = () => {
    const invalid = addressProblem(address);
    if (invalid) {
      setProblem(invalid);
      return;
    }
    onChange([
      ...hosts,
      { id: crypto.randomUUID(), label: label.trim(), baseUrl: address.trim().replace(/\/+$/, '') },
    ]);
    setLabel('');
    setAddress('');
    setProblem('');
  };

  return (
    <Card id="field-t3-hosts" variant="default" padding="md">
      <h3 className="mb-1 text-[13px] font-semibold text-[var(--color-text-primary)]">
        T3 on other machines
      </h3>
      <p className="mb-3 text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">
        Dispatch also follows T3 Code on other machines. Their slots and agents show beside the ones
        on this machine. To pair, run <code className="font-mono">t3 pair</code> on that machine and
        paste the link it prints.
      </p>

      {hosts.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {hosts.map((host) => (
            <HostRow
              key={host.id}
              host={host}
              onRemove={() => onChange(hosts.filter((other) => other.id !== host.id))}
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-[1fr_1.6fr_auto] items-end gap-2">
        <Field label="Name" dense>
          <TextInput
            ariaLabel="Name of the T3 host"
            value={label}
            onChange={setLabel}
            placeholder="Mac mini"
          />
        </Field>
        <Field label="Address" dense>
          <TextInput
            ariaLabel="Address of the T3 host"
            value={address}
            onChange={setAddress}
            placeholder="http://mac-mini:3773"
            mono
          />
        </Field>
        <div className="mb-3">
          <Button variant="secondary" size="sm" disabled={!address.trim()} onClick={add}>
            Add host
          </Button>
        </div>
      </div>
      {problem && <p className="text-[10.5px] text-[var(--color-status-red)]">{problem}</p>}
    </Card>
  );
}
