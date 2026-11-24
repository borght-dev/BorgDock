import { Button } from '@/components/shared/primitives';
import { actionLabel, revalidate } from '@/services/activity/actions';
import type { ActivityEntry } from '@/services/activity/types';
import { useCiFailuresStore } from '@/stores/ci-failures-store';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { actHere } from './take-action';

export interface EntryActionProps {
  entry: ActivityEntry;
  /** Runs before the action: a card closes itself. */
  onAct?: () => void;
}

/**
 * EntryAction — the one action that fits an entry, checked against the live
 * stores as it is drawn and again when it runs: "Open" when it no longer
 * applies, nothing when there is nothing to open.
 */
export function EntryAction({ entry, onAct }: EntryActionProps) {
  const threads = useDispatchStore((s) => s.threads);
  const hosts = useDispatchStore((s) => s.hosts);
  const pullRequests = usePrStore((s) => s.pullRequests);
  const groups = useCiFailuresStore((s) => s.groups);
  const check = revalidate(entry, false, { threads, hosts, pullRequests, groups });
  const target = check.ok ? check.action : check.fallback;
  if (!target) return null;
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        onAct?.();
        void actHere(entry);
      }}
    >
      {check.ok ? actionLabel(target) : 'Open'}
    </Button>
  );
}
