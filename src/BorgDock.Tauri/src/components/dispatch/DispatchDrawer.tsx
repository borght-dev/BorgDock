import { X } from 'lucide-react';
import { IconButton } from '@/components/shared/primitives';
import type { ItemOverview } from '@/services/dispatch/types';
import { DispatchDetail } from './DispatchDetail';
import type { DispatchActions } from './unit-actions';

interface DispatchDrawerProps {
  overview: ItemOverview;
  actions: DispatchActions;
  now: number;
  busy: boolean;
  onClose: () => void;
}

/** DispatchDrawer — an item's detail over the right side of the board or the walk. */
export function DispatchDrawer({ overview, actions, now, busy, onClose }: DispatchDrawerProps) {
  return (
    <aside className="bd-dp-drawer" aria-label="Work item">
      <header className="bd-dp-drawer__head">
        <span>Work item</span>
        <IconButton
          icon={<X size={13} strokeWidth={2.25} />}
          tooltip="Close (Esc)"
          aria-label="Close"
          size={22}
          onClick={onClose}
        />
      </header>
      <DispatchDetail overview={overview} actions={actions} now={now} busy={busy} />
    </aside>
  );
}
