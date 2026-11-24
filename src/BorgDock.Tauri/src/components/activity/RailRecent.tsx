import { Bell } from 'lucide-react';
import { RailFlyout } from '@/components/layout/rail-blocks';
import { selectNeedsYou, useActivityStore } from '@/stores/activity-store';
import { RecentCard } from './RecentCard';

const CARD_WIDTH = 380;

/** A count on a rail icon: "99+" above 99, like the folded sections' badges. */
function badgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** "Recent · 3 need you": what the trigger says on hover and to a screen reader. */
export function recentLabel(needsYou: number): string {
  if (needsYou <= 0) return 'Recent';
  return `Recent · ${needsYou} need${needsYou === 1 ? 's' : ''} you`;
}

export interface RailRecentProps {
  /** The rail is folded to icons. The bell looks the same either way; the rail's bar stacks it. */
  collapsed: boolean;
  /** Starts with the card open, for stories and screenshots. */
  defaultOpen?: boolean;
  /** The time the card counts from; stories fix it. */
  now?: Date;
}

/**
 * RailRecent — the bell in the bar at the foot of the rail: how many things
 * need you now as a badge, and behind it the Recent card. The count reads
 * live state, so it falls when the thing is handled, wherever that happened.
 */
export function RailRecent({ collapsed, defaultOpen, now }: RailRecentProps) {
  const needsYou = useActivityStore(selectNeedsYou);
  const label = recentLabel(needsYou);
  return (
    <RailFlyout
      label={label}
      className="bd-rail__recent"
      width={CARD_WIDTH}
      defaultOpen={defaultOpen}
      card={(close) => <RecentCard close={close} now={now} />}
    >
      <span className="bd-rail__recent-face" title={label} data-collapsed={collapsed || undefined}>
        <span className="bd-rail__glyph">
          <Bell size={16} strokeWidth={2} aria-hidden="true" className="bd-rail__icon" />
          {needsYou > 0 && (
            <span className="bd-rail__count bd-rail__count--badge bd-rail__count--hot">
              {badgeText(needsYou)}
            </span>
          )}
        </span>
      </span>
    </RailFlyout>
  );
}
