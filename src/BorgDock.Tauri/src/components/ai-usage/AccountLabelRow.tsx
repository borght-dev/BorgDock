import clsx from 'clsx';
import { type ReactNode, useEffect, useState } from 'react';
import { Toggle } from '@/components/shared/primitives';
import {
  type AccountPreference,
  domainOf,
  IDENTITY_COLORS,
  LABEL_LENGTH,
  providerName,
  sanitizeLabel,
} from '@/services/ai-usage/model';
import type { AiAccount } from '@/services/ai-usage/types';
import { ProviderIcon } from './AccountMark';

function nextColor(color: number): number {
  const index = IDENTITY_COLORS.indexOf(color as (typeof IDENTITY_COLORS)[number]);
  return IDENTITY_COLORS[(index + 1) % IDENTITY_COLORS.length]!;
}

/** "Claude · acme.com": the provider and whose account it is. */
function accountTitle(account: AiAccount): string {
  const whose = domainOf(account.email) ?? account.t3Name;
  return whose ? `${providerName(account.provider)} · ${whose}` : providerName(account.provider);
}

export interface AccountLabelRowProps {
  account: AiAccount;
  preference: AccountPreference;
  onChange: (change: Partial<AccountPreference>) => void;
  /** Every colour as a swatch to pick from; without it one dot steps through them. */
  swatches?: boolean;
  /** Before the icon: the handle Settings drags a row by. */
  lead?: ReactNode;
}

/**
 * One account being named: its provider icon, the label in a field of three
 * characters, the label's colour, whose account it is, and whether the rail
 * shows it. The first-start sheet and Settings both list these.
 */
export function AccountLabelRow({
  account,
  preference,
  onChange,
  swatches,
  lead,
}: AccountLabelRowProps) {
  const title = accountTitle(account);
  // Two accounts can share a title (one domain, two folders); the folder tells them apart.
  const name = `${providerName(account.provider)} ${account.folder}`;
  // What is being typed. An emptied field keeps the last label until a letter arrives.
  const [draft, setDraft] = useState(preference.label);
  useEffect(() => setDraft(preference.label), [preference.label]);

  return (
    <div className="bd-ai-lblrow" data-account={account.id}>
      {lead}
      <ProviderIcon provider={account.provider} />
      <input
        className="bd-ai-lblrow__label"
        aria-label={`Label for ${name}`}
        value={draft}
        maxLength={LABEL_LENGTH}
        spellCheck={false}
        onChange={(event) => {
          const label = sanitizeLabel(event.target.value);
          setDraft(label);
          if (label) onChange({ label });
        }}
        onBlur={() => setDraft(preference.label)}
      />
      {swatches ? (
        <span className="bd-ai-swatches" role="radiogroup" aria-label={`Colour for ${name}`}>
          {IDENTITY_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={preference.color === color}
              aria-label={`Colour ${color}`}
              className="bd-ai-swatch"
              data-color={color}
              onClick={() => onChange({ color })}
            />
          ))}
        </span>
      ) : (
        <button
          type="button"
          className="bd-ai-swatch"
          data-color={preference.color}
          aria-label={`Change the colour for ${name}`}
          title="Change colour"
          onClick={() => onChange({ color: nextColor(preference.color) })}
        />
      )}
      <span className={clsx('bd-ai-lblrow__text', preference.hidden && 'bd-ai-lblrow__text--off')}>
        <span>{title}</span>
        <span className="bd-ai-lblrow__sub">
          {[account.folder, account.plan].filter(Boolean).join(' · ')}
        </span>
      </span>
      <Toggle
        on={!preference.hidden}
        onChange={(shown) => onChange({ hidden: !shown })}
        ariaLabel={`Show ${name} in the rail`}
      />
    </div>
  );
}
