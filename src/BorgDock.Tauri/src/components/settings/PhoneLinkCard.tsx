import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Dot,
  Field,
  Pill,
  TextInput,
  ToggleRow,
} from '@/components/shared/primitives';
import { commands, events, type PhoneLinkStart, type PhoneLinkState } from '@/generated/commands';
import { commandData } from '@/services/native-command';
import type { PhoneLinkSettings } from '@/types/settings';

interface Props {
  phoneLink: PhoneLinkSettings;
  onChange: (phoneLink: PhoneLinkSettings) => void;
}

/** How often a started link asks the server whether the phone approved it. */
export const LINK_POLL_MS = 2_000;

type PendingLink = PhoneLinkStart & { server: string };

const qrSource = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/**
 * PhoneLinkCard — links this desktop to BorgDock for iPhone's server. The
 * phone approves a code (or scans its QR); from then on the desktop tells
 * the server when you're at your desk and shares what you read. The
 * session token is kept in the keychain.
 */
export function PhoneLinkCard({ phoneLink, onChange }: Props) {
  const [state, setState] = useState<PhoneLinkState | null>(null);
  const [server, setServer] = useState(phoneLink.serverUrl);
  const [pending, setPending] = useState<PendingLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stopped = false;
    const load = () =>
      void commandData(commands.phoneLinkState())
        .then((linkState) => {
          if (!stopped) setState(linkState);
        })
        .catch((reason) => {
          if (!stopped) setError(String(reason));
        });
    load();
    let unlisten: (() => void) | undefined;
    void events.phoneLinkChanged
      .listen(load)
      .then((stop) => {
        if (stopped) stop();
        else unlisten = stop;
      })
      .catch(() => {});
    return () => {
      stopped = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const answer = await commandData(commands.phoneLinkPoll(pending.linkId));
        if (stopped) return;
        if (answer.status === 'pending') {
          timer = setTimeout(poll, LINK_POLL_MS);
          return;
        }
        setPending(null);
        if (answer.status === 'approved') {
          setState({ linked: true, server: pending.server, serverName: answer.serverName });
        } else {
          setError('The code expired before your iPhone approved it. Link again.');
        }
      } catch (reason) {
        if (stopped) return;
        setPending(null);
        setError(String(reason));
      }
    };
    timer = setTimeout(poll, LINK_POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
      void commands.phoneLinkCancel(pending.linkId);
    };
  }, [pending]);

  const link = async () => {
    setBusy(true);
    setError(null);
    try {
      if (server.trim() !== phoneLink.serverUrl)
        onChange({ ...phoneLink, serverUrl: server.trim() });
      setPending({
        ...(await commandData(commands.phoneLinkStart(server))),
        server: server.trim(),
      });
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    setError(null);
    try {
      await commandData(commands.phoneLinkUnlink());
      setState({ linked: false, server: null, serverName: null });
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant="default" padding="md">
      <div id="field-phone-link" className="mb-1.5 flex items-center gap-2">
        <h3 className="text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          BorgDock for iPhone
        </h3>
        {state?.linked && <Pill tone="success">Linked</Pill>}
      </div>
      <p className="mb-2 text-[11.5px] leading-relaxed text-[var(--color-text-tertiary)]">
        Link this desktop to the BorgDock app on your iPhone. The phone stays quiet while you're at
        your desk, and what you read on one is read on the other.
      </p>

      {state?.linked ? (
        <div
          className="flex items-center gap-3 border-b border-[var(--color-subtle-border)] py-3"
          data-testid="phone-link-linked"
        >
          <Dot tone="green" />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-medium text-[var(--color-text-primary)]">
              Linked to {state.serverName}
            </div>
            <div className="truncate font-mono text-[11px] text-[var(--color-text-muted)]">
              {state.server}
            </div>
          </div>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void unlink()}>
            Unlink
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 border-b border-[var(--color-subtle-border)] py-3">
          <Field label="Server address" hint="The BorgDock server your iPhone app uses.">
            <TextInput
              ariaLabel="Server address"
              value={server}
              onChange={setServer}
              placeholder="https://example.ts.net/borgdock"
              mono
            />
          </Field>
          {pending ? (
            <div className="flex items-center gap-4" data-testid="phone-link-pending">
              <img
                src={qrSource(pending.qrSvg)}
                alt="QR code to link this desktop"
                width={140}
                height={140}
                className="shrink-0 rounded-[var(--radius-md)]"
              />
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="text-[11.5px] text-[var(--color-text-tertiary)]">
                  Scan this with your iPhone, or enter the code in the app:
                </span>
                <span className="font-mono text-[20px] font-semibold tracking-[0.12em] text-[var(--color-text-primary)]">
                  {pending.code}
                </span>
                <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--color-text-secondary)]">
                  <Dot tone="yellow" pulse />
                  Waiting for your iPhone…
                </span>
                <div>
                  <Button variant="ghost" size="sm" onClick={() => setPending(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <Button
                variant="primary"
                size="sm"
                disabled={busy || !server.trim() || state === null}
                onClick={() => void link()}
              >
                Link iPhone
              </Button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="status" className="mt-2 text-[11px] text-[var(--color-status-red)]">
          {error}
        </p>
      )}

      <div id="field-phone-link-desk">
        <ToggleRow
          label="Share when I'm at my desk"
          hint="Tells the server how long you've been idle here, so your iPhone stays quiet while you work."
          on={phoneLink.shareDesk}
          onChange={(shareDesk) => onChange({ ...phoneLink, shareDesk })}
        />
      </div>
      <div id="field-phone-link-reads">
        <ToggleRow
          label="Share what I've read"
          hint="Updates you read here are read on your iPhone, and the other way round."
          on={phoneLink.shareReads}
          onChange={(shareReads) => onChange({ ...phoneLink, shareReads })}
          last
        />
      </div>
    </Card>
  );
}
