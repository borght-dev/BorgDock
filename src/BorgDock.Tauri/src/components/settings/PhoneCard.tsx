import { useEffect, useState } from 'react';
import { Button, Card, Field, Select, TextInput, ToggleRow } from '@/components/shared/primitives';
import { commands } from '@/generated/commands';
import { commandData } from '@/services/native-command';
import type { ActivityPushSettings } from '@/types/settings';

interface Props {
  push: ActivityPushSettings;
  onChange: (push: ActivityPushSettings) => void;
}

const AWAY_OPTIONS = [5, 10, 15, 30, 60].map((minutes) => ({
  value: String(minutes),
  label: `${minutes} minutes`,
}));

/**
 * PhoneCard — the phone channel: updates that need you, still unread once
 * you have been away from the laptop for a while, go to a Home Assistant
 * webhook, and disappear from the phone once handled. The address and
 * token are kept in the keychain.
 */
export function PhoneCard({ push, onChange }: Props) {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void commandData(commands.activityPushTarget())
      .then((target) => {
        setUrl(target.url ?? '');
        setHasToken(target.hasToken);
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await commandData(commands.activityPushSave(url, token ? token : null));
      if (token) setHasToken(true);
      setToken('');
      setStatus({ tone: 'ok', text: url.trim() ? 'Saved.' : 'Webhook removed.' });
    } catch (error) {
      setStatus({ tone: 'error', text: String(error) });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await commandData(commands.activityPushSave(url, token ? token : null));
      await commandData(commands.activityPushTest());
      setStatus({ tone: 'ok', text: 'Sent. It should be on your phone now.' });
    } catch (error) {
      setStatus({ tone: 'error', text: String(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant="default" padding="md">
      <h3 className="mb-1.5 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
        Phone
      </h3>
      <p className="mb-2 text-[11.5px] leading-relaxed text-[var(--color-text-tertiary)]">
        Updates that need you go to your phone through Home Assistant once you have been away from
        the laptop for a while, and disappear there once you handle them here or in T3. A locked
        screen counts as away. The phone shows which host to open for a T3 thread.
      </p>
      <div id="field-phone-push">
        <ToggleRow
          label="Push to my phone"
          hint="Choose which updates in the table above."
          on={push.enabled}
          onChange={(enabled) => onChange({ ...push, enabled })}
        />
      </div>
      <div className="flex flex-col gap-3 py-3">
        <Field label="Service" anchorId="phone-preset">
          <Select
            ariaLabel="Push service"
            value={push.preset}
            options={[{ value: 'home-assistant', label: 'Home Assistant' }]}
            onChange={() => onChange({ ...push, preset: 'home-assistant' })}
          />
        </Field>
        <Field
          label="Webhook address"
          anchorId="phone-webhook"
          hint="A Home Assistant webhook trigger, e.g. https://home.example.com/api/webhook/borgdock. The automation in docs/activity/home-assistant.yaml forwards it to your phone."
        >
          <TextInput
            ariaLabel="Webhook address"
            value={url}
            onChange={setUrl}
            placeholder="https://home.example.com/api/webhook/borgdock"
            mono
          />
        </Field>
        <Field
          label="Token"
          anchorId="phone-token"
          hint="Sent as a bearer token. Optional for Home Assistant webhooks."
        >
          <TextInput
            ariaLabel="Webhook token"
            type="password"
            value={token}
            onChange={setToken}
            placeholder={hasToken ? 'Stored; type to replace' : 'None'}
          />
        </Field>
        <Field label="Push after I'm away for" anchorId="phone-away">
          <Select
            ariaLabel="Push after I'm away for"
            value={String(push.awayMinutes)}
            options={AWAY_OPTIONS}
            onChange={(value) => onChange({ ...push, awayMinutes: Number(value) })}
          />
        </Field>
      </div>
      <div id="field-phone-hide-titles">
        <ToggleRow
          label="Hide titles"
          hint={'Send "An agent asks a question" instead of the item\'s title.'}
          on={push.hideTitles}
          onChange={(hideTitles) => onChange({ ...push, hideTitles })}
          last
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void save()}>
          Save address
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || !url.trim()}
          onClick={() => void test()}
        >
          Send a test
        </Button>
        {status && (
          <span
            role="status"
            className={
              status.tone === 'ok'
                ? 'text-[11px] text-[var(--color-success-badge-fg)]'
                : 'text-[11px] text-[var(--color-status-red)]'
            }
          >
            {status.text}
          </span>
        )}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
        Titles and summaries leave this machine when they are pushed, unless you hide titles.
      </p>
    </Card>
  );
}
