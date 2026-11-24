import { resetsIn } from '@/services/ai-usage/model';
import { isRemote } from '@/services/dispatch/hosts';
import { AccountMark } from './AccountMark';
import { useAccountViews } from './useAccountViews';

export interface LaunchAccountHintProps {
  /** The environment the agent starts in. */
  hostId: string | null;
  /** The picked launch model, `<provider instance>/<model>`. */
  modelId: string;
}

/**
 * LaunchAccountHint — under a launch sheet's model picker: the account the
 * picked model spends, and what is left of it. Only for this machine's T3:
 * another machine's provider instances sign in from its own folders, which
 * BorgDock cannot read. Says nothing when the account is unknown or unread.
 */
export function LaunchAccountHint({ hostId, modelId }: LaunchAccountHintProps) {
  const { views, now } = useAccountViews();
  if (!hostId || isRemote({ id: hostId })) return null;
  const instance = modelId.split('/')[0];
  const view = views.find((candidate) => candidate.account.t3Instances.includes(instance ?? ''));
  if (!view?.headline || view.left === null) return null;

  const window = view.headline.kind === 'session' ? 'session' : 'week';
  const reset = resetsIn(view.headline.resetsAt, now);
  return (
    <p className="bd-dp-sheet__hint bd-ai-launch" data-tone={view.tone}>
      <AccountMark provider={view.account.provider} label={view.label} color={view.color} />
      <span>
        {view.tone === 'critical' ? 'Only ' : ''}
        {view.left}% of its {window} left{reset ? `, resets in ${reset}` : ''}.
      </span>
    </p>
  );
}
