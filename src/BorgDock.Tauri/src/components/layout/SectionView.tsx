import clsx from 'clsx';
import { useLayoutEffect, useRef, useState } from 'react';
import { FocusList } from '@/components/focus';
import { PrList } from '@/components/pr/PrList';
import { WorkItemsSection } from '@/components/work-items/WorkItemsSection';
import { WorktreesSection } from '@/components/worktree/WorktreesSection';
import { useVisibleSection } from '@/hooks/useVisibleSection';
import { useSettingsStore } from '@/stores/settings-store';
import type { ActiveSection } from '@/stores/ui-store';
import { motionMs, motionOK } from '@/utils/motion';

function SectionBody({ section }: { section: ActiveSection }) {
  switch (section) {
    case 'focus':
      return <FocusList />;
    case 'prs':
      return <PrList />;
    case 'workitems':
      return <WorkItemsSection />;
    case 'worktrees':
      return <WorktreesSection />;
  }
}

/**
 * SectionView — the list view of the main window: renders the active
 * section and crossfades when it changes (plans/ui-overhaul-workbench.md,
 * section 4). The outgoing section fades and drops 4 px while the incoming
 * one fades and rises 4 px, overlapping, over `--motion-base`. Each section
 * pane is its own scroll container, so the two can sit on top of each other
 * during the crossfade. The outgoing pane goes on `animationend` (a timer
 * backs that up where no animation runs), so a collapsed animation removes
 * it at once. Under reduced motion, and in the tab layout (`ui.layoutV3`
 * off, which never had the crossfade), the swap is instant.
 */
export function SectionView() {
  const active = useVisibleSection();
  const crossfade = useSettingsStore((s) => s.settings.ui.layoutV3 ?? false);
  const [leaving, setLeaving] = useState<ActiveSection | null>(null);
  const previousRef = useRef(active);

  useLayoutEffect(() => {
    const previous = previousRef.current;
    previousRef.current = active;
    if (previous === active) return;
    if (!crossfade || !motionOK()) {
      setLeaving(null);
      return;
    }
    setLeaving(previous);
    const timer = window.setTimeout(() => setLeaving(null), motionMs('--motion-base', 260));
    return () => window.clearTimeout(timer);
  }, [active, crossfade]);

  const outgoing = leaving !== null && leaving !== active ? leaving : null;

  return (
    <div className="bd-section-view">
      {outgoing !== null && (
        <div
          key={outgoing}
          className="bd-section bd-section--leaving"
          data-section={outgoing}
          aria-hidden="true"
          inert
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) setLeaving(null);
          }}
        >
          <SectionBody section={outgoing} />
        </div>
      )}
      <div
        key={active}
        className={clsx('bd-section', outgoing !== null && 'bd-section--entering')}
        data-section={active}
      >
        <SectionBody section={active} />
      </div>
    </div>
  );
}
