import clsx from 'clsx';
import { memo, useLayoutEffect, useRef, useState } from 'react';
import { FocusList } from '@/components/focus';
import { PrList } from '@/components/pr/PrList';
import { WorkItemsSection } from '@/components/work-items/WorkItemsSection';
import { WorktreesSection } from '@/components/worktree/WorktreesSection';
import { type ActiveSection, useUiStore } from '@/stores/ui-store';
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
 * section 4). The outgoing section fades out over `--motion-exit`; the
 * incoming one fades and rises 6 px over `--motion-base`, starting halfway
 * through that fade so the two never blur into each other. Each section
 * pane is its own scroll container, so the two can sit on top of each other
 * during the crossfade. The outgoing pane goes when the incoming one's
 * `animationend` fires (a timer backs that up where no animation runs), so a
 * collapsed animation removes it at once. Under reduced motion the swap is
 * instant.
 *
 * Memoised: it takes no props and reads the section from the store, so a
 * push or pop in the ViewStack (which re-renders its layers) does not
 * re-render the whole list under the detail view.
 */
export const SectionView = memo(function SectionView() {
  const active = useUiStore((s) => s.activeSection);
  const [leaving, setLeaving] = useState<ActiveSection | null>(null);
  const previousRef = useRef(active);

  useLayoutEffect(() => {
    const previous = previousRef.current;
    previousRef.current = active;
    if (previous === active) return;
    if (!motionOK()) {
      setLeaving(null);
      return;
    }
    setLeaving(previous);
    const timer = window.setTimeout(
      () => setLeaving(null),
      motionMs('--motion-exit', 110) / 2 + motionMs('--motion-base', 200),
    );
    return () => window.clearTimeout(timer);
  }, [active]);

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
        >
          <SectionBody section={outgoing} />
        </div>
      )}
      <div
        key={active}
        className={clsx('bd-section', outgoing !== null && 'bd-section--entering')}
        data-section={active}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget) setLeaving(null);
        }}
      >
        <SectionBody section={active} />
      </div>
    </div>
  );
});
