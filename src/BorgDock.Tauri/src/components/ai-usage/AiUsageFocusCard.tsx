import { Button } from '@/components/shared/primitives';
import { openManageUsage } from '@/services/ai-usage/actions';
import {
  type AccountView,
  accountName,
  accountsRunOut,
  bestAlternative,
  resetMoment,
} from '@/services/ai-usage/model';
import { threadsStoppedOn } from '@/services/ai-usage/threads';
import { showSection } from '@/services/navigation';
import { useDispatchStore } from '@/stores/dispatch-store';
import { AccountMark } from './AccountMark';
import { useAccountViews } from './useAccountViews';

function alternativeSentence(alternative: AccountView | null): string {
  if (!alternative || alternative.left === null || !alternative.headline) return '';
  const window = alternative.headline.kind === 'session' ? 'session' : 'week';
  return `${accountName(alternative)} has ${alternative.left}% of its ${window} left.`;
}

function stoppedSentence(count: number): string {
  if (count === 0) return '';
  return `${count} ${count === 1 ? 'thread' : 'threads'} stopped on its limit.`;
}

/**
 * AiUsageFocusCard — on Focus while an account has nothing left: when it
 * resets, the threads that stopped on it, and the account of the same
 * provider that still has room. Renders nothing while every account has some.
 */
export function AiUsageFocusCard() {
  const { views, settings, now } = useAccountViews();
  const threads = useDispatchStore((s) => s.threads);
  if (!settings?.introduced) return null;
  const out = accountsRunOut(views);
  if (out.length === 0) return null;

  return (
    <>
      {out.map((view) => {
        const stopped = threadsStoppedOn(view.account, threads);
        const text = [
          stoppedSentence(stopped.length),
          alternativeSentence(bestAlternative(view, views)),
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <section
            key={view.account.id}
            className="bd-dp-fcard bd-ai-fcard"
            aria-label={`${accountName(view)} is out of usage`}
          >
            <div className="bd-ai-fcard__head">
              <AccountMark provider={view.account.provider} label={view.label} color={view.color} />
              <b>Out until {resetMoment(view.headline!.resetsAt!, now)}</b>
            </div>
            {text && <span className="bd-ai-fcard__text">{text}</span>}
            <div className="bd-ai-fcard__actions">
              {stopped.length > 0 && (
                <Button variant="secondary" size="sm" onClick={() => void showSection('dispatch')}>
                  Open the threads
                </Button>
              )}
              <Button
                variant={stopped.length > 0 ? 'ghost' : 'secondary'}
                size="sm"
                onClick={() => openManageUsage(view.account.provider)}
              >
                Manage usage
              </Button>
            </div>
          </section>
        );
      })}
    </>
  );
}
