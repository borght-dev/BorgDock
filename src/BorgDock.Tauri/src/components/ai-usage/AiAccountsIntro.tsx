import { FocusTrap } from 'focus-trap-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/shared/primitives';
import {
  type AccountPreference,
  accountPreferences,
  withEveryAccount,
} from '@/services/ai-usage/model';
import type { AiAccount } from '@/services/ai-usage/types';
import { useAiUsageStore } from '@/stores/ai-usage-store';
import { useSettingsStore } from '@/stores/settings-store';
import { AccountLabelRow } from './AccountLabelRow';

type Preferences = Record<string, AccountPreference>;

function everyAccountHidden(preferences: Preferences): Preferences {
  return Object.fromEntries(
    Object.entries(preferences).map(([id, preference]) => [id, { ...preference, hidden: true }]),
  );
}

interface AccountsSheetProps {
  accounts: readonly AiAccount[];
  suggested: Preferences;
  /** The answer: every account with its label, colour and whether the rail shows it. */
  onAnswer: (preferences: Preferences) => void;
}

/** The sheet itself, apart from the stores: what the first start after the update shows. */
export function AiAccountsSheet({ accounts, suggested, onAnswer }: AccountsSheetProps) {
  const [preferences, setPreferences] = useState(suggested);
  const notNow = () => onAnswer(everyAccountHidden(suggested));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onAnswer(everyAccountHidden(suggested));
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onAnswer, suggested]);

  const title = `BorgDock found ${accounts.length} AI ${accounts.length === 1 ? 'account' : 'accounts'}`;
  return (
    <FocusTrap
      focusTrapOptions={{
        allowOutsideClick: true,
        escapeDeactivates: false,
        tabbableOptions: { displayCheck: 'none' },
      }}
    >
      <div className="bd-ai-intro">
        <div className="bd-ai-intro__overlay" />
        <section
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="bd-railcard bd-ai-intro__card"
        >
          <header className="bd-railcard__head">
            <h2 className="bd-railcard__title">{title}</h2>
          </header>
          <div className="bd-railcard__body">
            <p className="bd-railcard__dim">
              Each gets a short label next to its provider icon. Change a label, or switch off an
              account you do not want in the rail.
            </p>
            {accounts.map((account) => (
              <AccountLabelRow
                key={account.id}
                account={account}
                preference={preferences[account.id]!}
                onChange={(change) =>
                  setPreferences((current) => ({
                    ...current,
                    [account.id]: { ...current[account.id]!, ...change },
                  }))
                }
              />
            ))}
          </div>
          <footer className="bd-railcard__foot">
            <span>Later in Settings, AI, Accounts</span>
            <span className="bd-ai-intro__actions">
              <Button variant="ghost" size="sm" onClick={notNow}>
                Not now
              </Button>
              <Button variant="primary" size="sm" onClick={() => onAnswer(preferences)}>
                Show in the rail
              </Button>
            </span>
          </footer>
        </section>
      </div>
    </FocusTrap>
  );
}

/**
 * AiAccountsIntro — once, on the first start after the update that brought
 * AI usage: the accounts found on this machine with a suggested label each.
 * "Show in the rail" saves what the sheet shows; "Not now" keeps the labels
 * and leaves every account off until Settings switches it on. Nothing is read
 * from a provider before this is answered.
 */
export function AiAccountsIntro() {
  const accounts = useAiUsageStore((s) => s.accounts);
  const ready = useSettingsStore((s) => s.hasLoaded && s.settings.setupComplete);
  const settings = useSettingsStore((s) => s.settings.aiUsage);
  if (!ready || settings?.introduced || accounts.length === 0) return null;

  return (
    <AiAccountsSheet
      accounts={accounts}
      suggested={accountPreferences(accounts, settings)}
      onAnswer={(preferences) =>
        useSettingsStore
          .getState()
          .updateSettings({ aiUsage: withEveryAccount(settings, accounts, preferences) })
      }
    />
  );
}
