import clsx from 'clsx';
import {
  RailBlock,
  RailFlyout,
  RailMeter,
  RailStat,
  type RailTone,
} from '@/components/layout/rail-blocks';
import { HoverPopover } from '@/components/shared/primitives';
import { type AccountView, accountSummary, railAccounts, toneOf } from '@/services/ai-usage/model';
import { usePrStore } from '@/stores/pr-store';
import { AccountBadge, AccountMark, ProviderIcon } from './AccountMark';
import { AiUsageCard } from './AiUsageCard';
import { useAccountViews } from './useAccountViews';

const RING_SIZE = 28;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** GitHub's API requests as a row among the limits: what is left of the hour's allowance. */
export interface GitHubLimit {
  left: number;
  tone: RailTone;
  /** "4,412 of 5,000 requests left (REST)". */
  detail: string;
}

const numberFormat = new Intl.NumberFormat('en-US');

function useGitHubLimit(warnUnder: number | undefined): GitHubLimit | null {
  const rate = usePrStore((s) => s.rateLimit);
  if (!rate || rate.limit <= 0) return null;
  const percentLeft = Math.min(1, Math.max(0, rate.remaining / rate.limit)) * 100;
  const tone = toneOf(percentLeft, warnUnder);
  if (tone !== 'critical') return null;
  const pool = rate.pool ? ` (${rate.pool === 'graphql' ? 'GraphQL' : 'REST'})` : '';
  return {
    left: Math.round(percentLeft),
    tone,
    detail: `${numberFormat.format(rate.remaining)} of ${numberFormat.format(rate.limit)} requests left${pool}`,
  };
}

function LimitRing({ left, tone }: { left: number | null; tone: RailTone }) {
  return (
    <svg
      className="bd-ai-ring__arc"
      width={RING_SIZE}
      height={RING_SIZE}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      data-tone={tone}
      aria-hidden="true"
    >
      <circle
        className="bd-ai-ring__track"
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        strokeWidth={RING_STROKE}
      />
      {left !== null && left > 0 && (
        <circle
          className="bd-ai-ring__value"
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          strokeWidth={RING_STROKE}
          strokeDasharray={`${(left / 100) * RING_LENGTH} ${RING_LENGTH}`}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      )}
    </svg>
  );
}

/** The folded rail's account: a ring of what is left around the provider's icon, the label under it. */
function AccountRing({ view }: { view: AccountView }) {
  return (
    <HoverPopover
      variant="tooltip"
      tooltipSide="right"
      content={accountSummary(view)}
      triggerClassName="bd-ai-ring"
    >
      <LimitRing left={view.left} tone={view.tone} />
      <ProviderIcon provider={view.account.provider} size={12} className="bd-ai-ring__icon" />
      <AccountBadge label={view.label} color={view.color} className="bd-ai-ring__badge" />
    </HoverPopover>
  );
}

function leftText(left: number | null): string {
  return left === null ? '–' : `${left}%`;
}

function AccountRow({ view }: { view: AccountView }) {
  return (
    <RailStat
      lead={<AccountMark provider={view.account.provider} label={view.label} color={view.color} />}
      meter={<RailMeter value={view.left ?? 0} tone={view.tone} />}
      value={leftText(view.left)}
      tone={view.tone}
    />
  );
}

export interface RailLimitsProps {
  collapsed: boolean;
  /** Opens with its card showing, for stories and screenshots. */
  defaultOpen?: boolean;
}

/**
 * RailLimits — "Limits left" at the foot of the rail: one row per AI account
 * on this machine (provider icon, account label, a bar and the share left),
 * least left first, with a low GitHub API quota shown last.
 * Folded, each account is a ring. Either opens the AI usage card.
 */
export function RailLimits({ collapsed, defaultOpen }: RailLimitsProps) {
  const { views, settings } = useAccountViews();
  const gitHub = useGitHubLimit(settings?.warnUnder);
  const accounts = settings?.introduced ? railAccounts(views, settings) : [];
  const gitHubRow = settings?.showGitHub === false ? null : gitHub;
  if (accounts.length === 0 && !gitHubRow) return null;

  return (
    <RailFlyout
      label="Limits left"
      width={380}
      defaultOpen={defaultOpen}
      className={clsx(collapsed && 'bd-ai-limits--folded')}
      card={(close) => <AiUsageCard gitHub={gitHubRow} onLeave={close} />}
    >
      {collapsed ? (
        <span className="bd-rail__block">
          {accounts.map((view) => (
            <AccountRing key={view.account.id} view={view} />
          ))}
          {gitHubRow && (
            <HoverPopover
              variant="tooltip"
              tooltipSide="right"
              content={`GitHub API · ${gitHubRow.detail}`}
              triggerClassName="bd-ai-ring"
            >
              <LimitRing left={gitHubRow.left} tone={gitHubRow.tone} />
              <span className="text-[9px] font-semibold" aria-hidden="true">
                GH
              </span>
            </HoverPopover>
          )}
        </span>
      ) : (
        <RailBlock title="Limits left">
          {accounts.map((view) => (
            <AccountRow key={view.account.id} view={view} />
          ))}
          {gitHubRow && (
            <RailStat
              lead={<span className="bd-ai-mark bd-ai-mark--text">GitHub</span>}
              meter={<RailMeter value={gitHubRow.left} tone={gitHubRow.tone} />}
              value={`${gitHubRow.left}%`}
              tone={gitHubRow.tone}
            />
          )}
        </RailBlock>
      )}
    </RailFlyout>
  );
}
