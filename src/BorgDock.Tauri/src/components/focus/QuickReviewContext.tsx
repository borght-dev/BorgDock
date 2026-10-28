import {
  ChevronsLeft,
  ChevronsRight,
  CircleCheck,
  CircleDashed,
  CircleX,
  ClipboardList,
  Image,
  MessageSquare,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { type CheckBarState, IconButton, Tabs } from '@/components/shared/primitives';

export type ContextTab = 'proof' | 'checks' | 'work' | 'comments';
/** In tab order: keys 1–4 pick them. */
export const CONTEXT_TABS: readonly ContextTab[] = ['proof', 'checks', 'work', 'comments'];

const LABEL: Record<ContextTab, string> = {
  proof: 'Proof',
  checks: 'Checks',
  work: 'Work item',
  comments: 'Comments',
};

const RAIL_ICON = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;

function ChecksIcon({ state }: { state: CheckBarState }) {
  if (state === 'ok') return <CircleCheck {...RAIL_ICON} />;
  if (state === 'fail') return <CircleX {...RAIL_ICON} />;
  return <CircleDashed {...RAIL_ICON} />;
}

const ICON: Record<ContextTab, (state: CheckBarState) => ReactNode> = {
  proof: () => <Image {...RAIL_ICON} />,
  checks: (state) => <ChecksIcon state={state} />,
  work: () => <ClipboardList {...RAIL_ICON} />,
  comments: () => <MessageSquare {...RAIL_ICON} />,
};

interface Props {
  open: boolean;
  tab: ContextTab;
  /** Opens the panel on `tab`. */
  onTab: (tab: ContextTab) => void;
  onToggle: () => void;
  counts: Partial<Record<ContextTab, number>>;
  checks: CheckBarState;
  /** The open tab's content. */
  children: ReactNode;
}

/**
 * The file walk's right-hand panel: Proof, Checks, Work item and Comments
 * beside the diff. `]` folds it into a rail of icons that keeps the counts
 * in view; a rail icon opens the panel on its tab.
 */
export function QuickReviewContext({
  open,
  tab,
  onTab,
  onToggle,
  counts,
  checks,
  children,
}: Props) {
  if (!open)
    return (
      <aside className="qr-rail" aria-label="Context">
        <IconButton
          icon={<ChevronsLeft {...RAIL_ICON} />}
          tooltip="Show context panel (])"
          aria-label="Show context panel"
          aria-keyshortcuts="]"
          onClick={onToggle}
        />
        <span className="qr-rail__sep" />
        {CONTEXT_TABS.map((id) => {
          const count = counts[id];
          return (
            <button
              key={id}
              type="button"
              className="qr-rail__btn"
              data-tab={id}
              data-checks={id === 'checks' ? checks : undefined}
              aria-label={count ? `${LABEL[id]} · ${count}` : LABEL[id]}
              title={LABEL[id]}
              onClick={() => onTab(id)}
            >
              {ICON[id](checks)}
              {!!count && <b>{count}</b>}
            </button>
          );
        })}
      </aside>
    );
  return (
    <aside className="qr-side" aria-label="Context">
      <div className="qr-side__tabs">
        <Tabs
          dense
          value={tab}
          onChange={(id) => onTab(id as ContextTab)}
          tabs={CONTEXT_TABS.map((id) => ({
            id,
            label: LABEL[id],
            count: counts[id] || undefined,
          }))}
        />
        <IconButton
          icon={<ChevronsRight {...RAIL_ICON} />}
          tooltip="Hide context panel (])"
          aria-label="Hide context panel"
          aria-keyshortcuts="]"
          onClick={onToggle}
        />
      </div>
      <div className="qr-side__body" role="tabpanel" aria-label={LABEL[tab]}>
        {children}
      </div>
    </aside>
  );
}
