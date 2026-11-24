import { useEffect } from 'react';
import { RailCard, RailMeter } from '@/components/layout/rail-blocks';
import { refreshAiUsage } from '@/runtime/ai-usage-sync';
import { openAccountSettings, openManageUsage } from '@/services/ai-usage/actions';
import {
  type AccountView,
  currentLimits,
  DEFAULT_WARN_UNDER,
  formatCredits,
  paceTick,
  percentLeft,
  providerName,
  railAccounts,
  resetsIn,
  toneOf,
} from '@/services/ai-usage/model';
import { useAiUsageStore } from '@/stores/ai-usage-store';
import { formatAgo } from '@/utils/relative-time';
import { AccountMark } from './AccountMark';
import type { GitHubLimit } from './RailLimits';
import { useAccountViews } from './useAccountViews';

function ago(atMs: number, now: number): string {
  return formatAgo(new Date(atMs).toISOString(), now);
}

function AccountLimits({
  view,
  now,
  warnUnder,
}: {
  view: AccountView;
  now: number;
  warnUnder: number;
}) {
  const limits = currentLimits(view.reading, now);
  const problem = view.reading?.problem;
  return (
    <div
      className="bd-railcard__group bd-ai-acct"
      data-account={view.account.id}
      data-stale={problem ? '' : undefined}
    >
      <div className="bd-ai-acct__head">
        <AccountMark provider={view.account.provider} label={view.label} color={view.color} />
        <span>{providerName(view.account.provider)}</span>
        <span className="bd-ai-acct__folder" title={view.account.email ?? undefined}>
          {view.account.folder}
        </span>
        {view.account.plan && <span className="bd-ai-acct__plan">{view.account.plan}</span>}
      </div>
      {limits.map((limit) => {
        const left = percentLeft(limit);
        return (
          <div key={`${limit.kind}:${limit.label}`} className="bd-ai-limit">
            <span>{limit.label}</span>
            <RailMeter value={left} tone={toneOf(left, warnUnder)} tick={paceTick(limit, now)} />
            <b>{left}% left</b>
            <span className="bd-ai-limit__when">{resetsIn(limit.resetsAt, now)}</span>
          </div>
        );
      })}
      {view.reading?.credits && limits.length > 0 && (
        <div className="bd-ai-limit">
          <span>Credits</span>
          <span />
          <b>{formatCredits(view.reading.credits)}</b>
          <span />
        </div>
      )}
      {problem && (
        <p className="bd-ai-acct__problem">
          {problem.message}
          {limits.length > 0 && ` Read ${ago(view.reading!.readAt, now)}.`}
        </p>
      )}
      {!problem && limits.length === 0 && <p className="bd-ai-acct__problem">Not read yet.</p>}
    </div>
  );
}

export interface AiUsageCardProps {
  /** GitHub's API requests, when the rail shows them among the limits. */
  gitHub: GitHubLimit | null;
  /** Called when an action leaves the main window (Settings, the browser). */
  onLeave: () => void;
}

/**
 * AiUsageCard — what the Limits block opens: every shown account with its
 * plan, each limit as a bar with the share left and the time to its reset,
 * and a tick on the bar for the share of the window still to come. A bar
 * shorter than its tick runs out before the reset.
 */
export function AiUsageCard({ gitHub, onLeave }: AiUsageCardProps) {
  const { views, settings, now } = useAccountViews();
  const lastReadAt = useAiUsageStore((s) => s.lastReadAt);
  const isReading = useAiUsageStore((s) => s.isReading);
  const accounts = settings?.introduced ? railAccounts(views, settings) : [];
  const providers = [...new Set(accounts.map((view) => view.account.provider))];
  const warnUnder = settings?.warnUnder ?? DEFAULT_WARN_UNDER;

  useEffect(() => {
    refreshAiUsage();
  }, []);

  const leave = (action: () => void) => () => {
    action();
    onLeave();
  };

  return (
    <RailCard
      title="AI usage"
      meta={isReading ? 'reading…' : lastReadAt !== null ? `updated ${ago(lastReadAt, now)}` : null}
      footer={
        <>
          {providers.length === 1 ? (
            <button
              type="button"
              className="bd-railcard__link"
              onClick={leave(() => openManageUsage(providers[0]!))}
            >
              Manage usage
            </button>
          ) : (
            <span className="bd-ai-manage">
              Manage usage
              {providers.map((provider) => (
                <button
                  key={provider}
                  type="button"
                  className="bd-railcard__link bd-ai-manage__provider"
                  onClick={leave(() => openManageUsage(provider))}
                >
                  {providerName(provider)}
                </button>
              ))}
            </span>
          )}
          <button
            type="button"
            className="bd-railcard__link bd-railcard__link--end"
            disabled={isReading}
            onClick={() => refreshAiUsage(true)}
          >
            Refresh
          </button>
        </>
      }
    >
      {accounts.map((view) => (
        <AccountLimits key={view.account.id} view={view} now={now} warnUnder={warnUnder} />
      ))}
      {accounts.length === 0 && (
        <p className="bd-railcard__dim">
          No AI account is shown.{' '}
          <button type="button" className="bd-ai-inline-link" onClick={leave(openAccountSettings)}>
            Switch accounts on in Settings
          </button>
        </p>
      )}
      {gitHub && (
        <div className="bd-railcard__group bd-ai-acct">
          <div className="bd-ai-acct__head">
            <span>GitHub API</span>
          </div>
          <div className="bd-ai-limit">
            <span>This hour</span>
            <RailMeter value={gitHub.left} tone={gitHub.tone} />
            <b>{gitHub.left}% left</b>
            <span />
          </div>
          <p className="bd-ai-acct__problem">{gitHub.detail}</p>
        </div>
      )}
    </RailCard>
  );
}
