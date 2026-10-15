import clsx from 'clsx';
import { Button, CheckBar, Dot, type DotTone } from '@/components/shared/primitives';
import { WorkItemTypePill } from '@/components/work-items/WorkItemTypePill';
import { BAY_LABEL, type Bay, type ItemOverview, type Slot } from '@/services/dispatch/types';
import { DispatchDrawer } from './DispatchDrawer';
import { canStart, UnitAside } from './DispatchRow';
import { DISPATCH_ITEM_MIME } from './SlotStrip';
import { currentThread, type DispatchActions, unitActions } from './unit-actions';
import { toCheckBarCounts, whyLine } from './unit-copy';

interface BoardColumn {
  key: string;
  label: string;
  tone: DotTone;
  bays: readonly Bay[];
  empty: string;
}

/** The board's columns, left to right. Paused and handed off sit in the lane below. */
export const BOARD_COLUMNS: readonly BoardColumn[] = [
  {
    key: 'you',
    label: 'Needs you',
    tone: 'red',
    bays: ['waiting', 'drift'],
    empty: 'Nothing waits on you.',
  },
  {
    key: 'working',
    label: 'Agents working',
    tone: 'green',
    bays: ['working'],
    empty: 'No agent is running.',
  },
  {
    key: 'next',
    label: 'Up next',
    tone: 'yellow',
    bays: ['next'],
    empty: 'Star an item to queue it here.',
  },
  {
    key: 'idle',
    label: 'Not started',
    tone: 'gray',
    bays: ['idle'],
    empty: 'Everything has been started.',
  },
];

const LANE_BAYS: readonly { bay: Bay; label: string }[] = [
  { bay: 'paused', label: 'Paused' },
  { bay: 'handed', label: BAY_LABEL.handed },
];

/** At most this many buttons on a card: the one it needs, and one way out. */
const CARD_ACTIONS = 2;

function startDrag(e: React.DragEvent, itemId: number) {
  e.dataTransfer.setData(DISPATCH_ITEM_MIME, String(itemId));
  e.dataTransfer.effectAllowed = 'move';
}

interface CardProps {
  overview: ItemOverview;
  selected: boolean;
  now: number;
  busy: boolean;
  actions: DispatchActions;
  onSelect: (id: number) => void;
}

function BoardCard({ overview, selected, now, busy, actions, onSelect }: CardProps) {
  const { item, pullRequest } = overview;
  const thread = currentThread(overview);
  const question = thread?.status === 'question' ? thread.questions[0]?.question : undefined;
  return (
    <article
      className="bd-fb-card bd-dp-card"
      data-dp-id={item.id}
      data-selected={selected ? 'true' : undefined}
      draggable={canStart(overview)}
      onDragStart={(e) => startDrag(e, item.id)}
    >
      <div
        className="bd-fb-card__main"
        role="button"
        tabIndex={0}
        aria-label={`${item.title}, AB#${item.id}`}
        onClick={() => onSelect(item.id)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(item.id);
          }
        }}
      >
        <div className="bd-fb-card__repo">
          <span className="bd-dp-card__id">
            <WorkItemTypePill type={item.typeName} /> {item.id}
          </span>
          <UnitAside overview={overview} />
        </div>
        <div className="bd-fb-card__title" title={item.title}>
          {item.title}
        </div>
        <div className="bd-fb-card__why bd-dp-card__why">{question ?? whyLine(overview, now)}</div>
        {pullRequest?.checks && pullRequest.checks.total > 0 && (
          <div className="bd-fb-card__foot">
            <CheckBar {...toCheckBarCounts(pullRequest.checks)} />
          </div>
        )}
      </div>
      <div className="bd-fb-card__acts">
        {unitActions(overview)
          .slice(0, CARD_ACTIONS)
          .map((action) => (
            <Button
              key={action.id}
              variant={action.primary ? 'primary' : 'secondary'}
              size="sm"
              disabled={busy}
              data-dp-action={action.id}
              title={action.label}
              onClick={() => action.run(actions)}
            >
              {action.shortLabel ?? action.label}
            </Button>
          ))}
      </div>
    </article>
  );
}

interface DispatchBoardProps {
  items: readonly ItemOverview[];
  slots: readonly Slot[];
  /** The item whose detail is open in the drawer. */
  openId: number | null;
  now: number;
  busy: boolean;
  actions: DispatchActions;
  onSelect: (id: number | null) => void;
}

/**
 * DispatchBoard — the same items as the list, as four columns: what needs
 * you, what agents are working on, what is queued and what nobody started.
 * Each card carries the one action it needs. A card that has no running
 * agent can be dragged onto a free slot. Picking a card opens its detail in
 * a drawer over the board.
 */
export function DispatchBoard({
  items,
  slots,
  openId,
  now,
  busy,
  actions,
  onSelect,
}: DispatchBoardProps) {
  const open = items.find((o) => o.item.id === openId) ?? null;
  return (
    <div className="bd-dp-board">
      <div className="bd-fb-cols">
        {BOARD_COLUMNS.map((column) => {
          const cards = items.filter((o) => column.bays.includes(o.bay));
          return (
            <section
              key={column.key}
              className="bd-fb-col"
              data-col={column.key}
              aria-label={column.label}
            >
              <header className="bd-fb-col__head">
                <Dot tone={column.tone} size={7} />
                <span className="bd-fb-col__label">{column.label}</span>
                <span className="bd-fb-col__count">{cards.length}</span>
              </header>
              <div className="bd-fb-col__stack">
                {cards.length === 0 && <p className="bd-fb-col__empty">{column.empty}</p>}
                {cards.map((overview) => (
                  <BoardCard
                    key={overview.item.id}
                    overview={overview}
                    selected={overview.item.id === openId}
                    now={now}
                    busy={busy}
                    actions={actions}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="bd-dp-lane">
        {LANE_BAYS.map(({ bay, label }) => {
          const parked = items.filter((o) => o.bay === bay);
          return (
            <div key={bay} className="bd-dp-lane__group">
              <span className="bd-dp-lane__label">
                {label} {parked.length}
              </span>
              {parked.map((overview) => (
                <button
                  key={overview.item.id}
                  type="button"
                  className={clsx(
                    'bd-dp-lane__chip',
                    overview.item.id === openId && 'bd-dp-lane__chip--on',
                  )}
                  data-dp-id={overview.item.id}
                  data-selected={overview.item.id === openId ? 'true' : undefined}
                  draggable={canStart(overview)}
                  onDragStart={(e) => startDrag(e, overview.item.id)}
                  onClick={() => onSelect(overview.item.id)}
                >
                  <WorkItemTypePill type={overview.item.typeName} />
                  <span className="bd-dp-lane__title">{overview.item.title}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {open && (
        <DispatchDrawer
          overview={open}
          slots={slots}
          actions={actions}
          now={now}
          busy={busy}
          onClose={() => onSelect(null)}
        />
      )}
    </div>
  );
}
