import clsx from 'clsx';
import type { Slot } from '@/services/dispatch/types';

/** Slots grouped per host, hosts and slots in the order the engine sorted them. */
export function groupSlotsByHost(slots: readonly Slot[]): { hostLabel: string; slots: Slot[] }[] {
  const groups = new Map<string, { hostLabel: string; slots: Slot[] }>();
  for (const slot of slots) {
    let group = groups.get(slot.hostId);
    if (!group) {
      group = { hostLabel: slot.hostLabel, slots: [] };
      groups.set(slot.hostId, group);
    }
    group.slots.push(slot);
  }
  return [...groups.values()];
}

export function slotTitle(slot: Slot): string {
  if (!slot.available) return `${slot.name}, ${slot.hostLabel} is offline`;
  if (slot.state === 'free') return `${slot.name}, free`;
  if (slot.state === 'busy') return `${slot.name}, busy with other work`;
  return `${slot.name}, AB#${slot.itemId}${slot.needsYou ? ', needs you' : ''}`;
}

interface SlotHandlers {
  /** One of my slots was picked: show the item its agent works on. */
  onShowItem?: (itemId: number) => void;
  /** A free slot was picked: start something there. */
  onStartIn?: (slot: Slot) => void;
  /** A work item id dropped on a free slot. */
  onDropItem?: (slot: Slot, itemId: number) => void;
}

interface SlotTileProps extends SlotHandlers {
  slot: Slot;
  selected?: boolean;
}

/** MIME type a dragged work item travels under. */
export const DISPATCH_ITEM_MIME = 'application/x-borgdock-work-item';

/** One slot as a small tile: dashed green when free, amber when its agent needs you. */
export function SlotTile({ slot, selected, onShowItem, onStartIn, onDropItem }: SlotTileProps) {
  const free = slot.available && slot.state === 'free';
  const itemId = slot.state === 'mine' ? slot.itemId : null;
  const pick =
    itemId !== null && onShowItem
      ? () => onShowItem(itemId)
      : free && onStartIn
        ? () => onStartIn(slot)
        : undefined;
  const droppable = free && onDropItem !== undefined;
  return (
    <button
      type="button"
      className={clsx('bd-dp-slot', selected && 'bd-dp-slot--selected')}
      data-slot-id={slot.id}
      data-state={slot.state}
      data-needs-you={slot.needsYou ? 'true' : undefined}
      data-running={slot.running && !slot.needsYou ? 'true' : undefined}
      data-offline={slot.available ? undefined : 'true'}
      title={slotTitle(slot)}
      aria-label={slotTitle(slot)}
      aria-pressed={selected}
      disabled={pick === undefined}
      onClick={pick}
      onDragOver={
        droppable
          ? (e) => {
              if (!e.dataTransfer.types.includes(DISPATCH_ITEM_MIME)) return;
              e.preventDefault();
              e.currentTarget.dataset.dropTarget = 'true';
            }
          : undefined
      }
      onDragLeave={
        droppable
          ? (e) => {
              delete e.currentTarget.dataset.dropTarget;
            }
          : undefined
      }
      onDrop={
        droppable
          ? (e) => {
              delete e.currentTarget.dataset.dropTarget;
              const itemId = Number(e.dataTransfer.getData(DISPATCH_ITEM_MIME));
              if (!itemId) return;
              e.preventDefault();
              onDropItem?.(slot, itemId);
            }
          : undefined
      }
    >
      {slot.name}
    </button>
  );
}

interface SlotStripProps extends SlotHandlers {
  slots: readonly Slot[];
}

/**
 * SlotStrip — every slot as a tile, grouped per host, with the free and
 * needs-you counts at the end. A free tile starts the next queued item there;
 * one of mine selects its item.
 */
export function SlotStrip({ slots, ...handlers }: SlotStripProps) {
  if (slots.length === 0) return null;
  const free = slots.filter((s) => s.available && s.state === 'free').length;
  const needYou = slots.filter((s) => s.needsYou).length;
  return (
    <div className="bd-dp-slots" role="group" aria-label="Slots">
      {groupSlotsByHost(slots).map((group) => (
        <div key={group.hostLabel} className="bd-dp-slots__host">
          <span className="bd-dp-slots__host-name">{group.hostLabel}</span>
          {group.slots.map((slot) => (
            <SlotTile key={slot.id} slot={slot} {...handlers} />
          ))}
        </div>
      ))}
      <span className="bd-dp-slots__summary">
        {free} free{needYou > 0 ? `, ${needYou} need you` : ''}
      </span>
    </div>
  );
}
