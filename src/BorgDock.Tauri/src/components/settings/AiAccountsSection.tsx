import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react';
import { AccountLabelRow } from '@/components/ai-usage/AccountLabelRow';
import { Button, Card, SectionHeader, ToggleRow } from '@/components/shared/primitives';
import {
  type AccountPreference,
  accountPreferences,
  DEFAULT_WARN_UNDER,
  providerName,
  withEveryAccount,
} from '@/services/ai-usage/model';
import { createLogger } from '@/services/logger';
import { useAiUsageStore } from '@/stores/ai-usage-store';
import type { AiUsageSettings } from '@/types/settings';

const log = createLogger('ai-accounts-settings');

/** The share left under which an account shows red can be set between these. */
const WARN_UNDER_RANGE = { min: 1, max: 50 };

interface Props {
  aiUsage: AiUsageSettings | undefined;
  onChange: (aiUsage: AiUsageSettings) => void;
}

function moved(order: readonly string[], id: string, to: number): string[] {
  const without = order.filter((other) => other !== id);
  without.splice(Math.max(0, Math.min(without.length, to)), 0, id);
  return without;
}

/**
 * Settings, AI, Accounts: the Claude and Codex accounts found on this
 * machine. Each has a label of up to three characters and a colour, can be
 * left out of the rail, and can be dragged into an order the rail keeps when
 * asked to.
 */
export function AiAccountsSection({ aiUsage, onChange }: Props) {
  const found = useAiUsageStore((s) => s.accounts);
  const looked = useAiUsageStore((s) => s.looked);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const [dragging, setDragging] = useState<string | null>(null);

  const look = () =>
    void useAiUsageStore
      .getState()
      .findAccounts()
      .catch((error) => log.warn('account lookup failed', { error }));
  useEffect(look, []);

  const preferences = accountPreferences(found, aiUsage);
  const saved = aiUsage?.order ?? [];
  const order = [
    ...saved.filter((id) => found.some((account) => account.id === id)),
    ...found.filter((account) => !saved.includes(account.id)).map((account) => account.id),
  ];
  const accounts = order.map((id) => found.find((account) => account.id === id)!);

  /** Every account is saved with each edit, so an account never counts as new after one. */
  const save = (next: Record<string, AccountPreference>, rest: Partial<AiUsageSettings> = {}) =>
    onChange({ ...withEveryAccount(aiUsage, found, next), order, ...rest });
  const set = (partial: Partial<AiUsageSettings>) => save(preferences, partial);
  const reorder = (id: string, to: number) => save(preferences, { order: moved(order, id, to) });

  const onGripMove = (event: PointerEvent) => {
    if (!dragging) return;
    const over = order.find((id) => {
      const rect = rows.current.get(id)?.getBoundingClientRect();
      return !!rect && event.clientY >= rect.top && event.clientY < rect.bottom;
    });
    if (over && over !== dragging) reorder(dragging, order.indexOf(over));
  };
  const onGripKey = (id: string) => (event: KeyboardEvent) => {
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (step === 0) return;
    event.preventDefault();
    reorder(id, order.indexOf(id) + step);
  };

  const warnUnder = aiUsage?.warnUnder ?? DEFAULT_WARN_UNDER;
  return (
    <>
      <SectionHeader
        title="AI accounts"
        subtitle="The Claude and Codex accounts on this machine, and how the rail shows what is left of each."
      />
      <Card variant="default" padding="md">
        <h3 className="mb-1 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          AI accounts on this machine
        </h3>
        <p className="mb-3 text-[11.5px] text-[var(--color-text-muted)]">
          Drag to order. The rail still puts the account with the least left first unless you keep
          your order.
        </p>
        <div id="field-ai-accounts" className="bd-ai-lblrows">
          {accounts.map((account) => (
            <div
              key={account.id}
              ref={(element) => {
                if (element) rows.current.set(account.id, element);
                else rows.current.delete(account.id);
              }}
              className="bd-ai-lblrows__row"
              data-dragging={dragging === account.id ? '' : undefined}
            >
              <AccountLabelRow
                account={account}
                preference={preferences[account.id]!}
                swatches
                onChange={(change) =>
                  save({
                    ...preferences,
                    [account.id]: { ...preferences[account.id]!, ...change },
                  })
                }
                lead={
                  <button
                    type="button"
                    className="bd-ai-grip"
                    aria-label={`Move ${providerName(account.provider)} ${preferences[account.id]!.label}. Arrow keys move it.`}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setDragging(account.id);
                    }}
                    onPointerMove={onGripMove}
                    onPointerUp={() => setDragging(null)}
                    onPointerCancel={() => setDragging(null)}
                    onKeyDown={onGripKey(account.id)}
                  />
                }
              />
            </div>
          ))}
          {looked && accounts.length === 0 && (
            <p className="text-[11.5px] text-[var(--color-text-muted)]">
              No Claude Code or Codex sign-in was found on this machine.
            </p>
          )}
        </div>
        <div className="mt-3 border-t border-[var(--color-subtle-border)]">
          <div id="field-ai-show-github">
            <ToggleRow
              label="Show GitHub API with the limits"
              on={aiUsage?.showGitHub !== false}
              onChange={(showGitHub) => set({ showGitHub })}
            />
          </div>
          <div id="field-ai-keep-order">
            <ToggleRow
              label="Keep my order in the rail"
              hint="Off: least left first."
              on={aiUsage?.keepOrder === true}
              onChange={(keepOrder) => set({ keepOrder })}
            />
          </div>
          <label id="field-ai-warn-under" className="bd-ai-warn">
            <span className="bd-ai-warn__text">Warn under this percentage left</span>
            <input
              className="bd-ai-lblrow__label"
              type="number"
              min={WARN_UNDER_RANGE.min}
              max={WARN_UNDER_RANGE.max}
              value={warnUnder}
              onChange={(event) => {
                const value = Math.round(Number(event.target.value));
                if (value >= WARN_UNDER_RANGE.min && value <= WARN_UNDER_RANGE.max)
                  set({ warnUnder: value });
              }}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={look}>
            Look for accounts again
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const suggested = accountPreferences(found, undefined);
              save(
                Object.fromEntries(
                  found.map(({ id }) => [
                    id,
                    { ...suggested[id]!, hidden: preferences[id]!.hidden },
                  ]),
                ),
              );
            }}
          >
            Reset labels
          </Button>
        </div>
      </Card>
    </>
  );
}
