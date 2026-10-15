import { Check, ChevronDown } from 'lucide-react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DispatchItem, StateCategory } from '@/services/dispatch/types';

const GROUPS: readonly { category: StateCategory; label: string }[] = [
  { category: 'Proposed', label: 'Not started' },
  { category: 'InProgress', label: 'In progress' },
  { category: 'Resolved', label: 'Resolved' },
  { category: 'Completed', label: 'Closed' },
];

const MENU_GAP = 4;
const MENU_MAX_HEIGHT = 340;

/** Below the button, or above it when the window ends first; right edges aligned. */
function menuPosition(button: HTMLElement): CSSProperties {
  const rect = button.getBoundingClientRect();
  const right = window.innerWidth - rect.right;
  const below = window.innerHeight - rect.bottom;
  return below >= MENU_MAX_HEIGHT || below >= rect.top
    ? { top: rect.bottom + MENU_GAP, right, maxHeight: Math.min(MENU_MAX_HEIGHT, below - 12) }
    : {
        bottom: window.innerHeight - rect.top + MENU_GAP,
        right,
        maxHeight: Math.min(MENU_MAX_HEIGHT, rect.top - 12),
      };
}

interface StateMenuProps {
  item: DispatchItem;
  disabled?: boolean;
  onMove: (state: string) => void;
}

/**
 * StateMenu — the item's state as a button that opens every state of its
 * workflow, grouped like ADO groups them. Picking one has an agent move the item. The
 * menu floats over the page, so a collapsing list cannot clip it.
 */
export function StateMenu({ item, disabled = false, onMove }: StateMenuProps) {
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = position !== null;
  const close = () => setPosition(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = () => setPosition(null);
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) dismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      dismiss();
      buttonRef.current?.focus();
    };
    const onScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) dismiss();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);

  const groups = GROUPS.map((group) => ({
    ...group,
    states: item.states.filter((state) => state.category === group.category),
  })).filter((group) => group.states.length > 0);

  return (
    // The row behind it opens the item; a click on the menu must not.
    <div className="bd-dp-state" onClick={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        className="bd-dp-state__button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`State: ${item.state}. Have an agent move it`}
        disabled={disabled}
        onClick={(e) => setPosition(open ? null : menuPosition(e.currentTarget))}
      >
        <span className="bd-dp-state__name">{item.state}</span>
        <ChevronDown size={11} strokeWidth={2.25} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="bd-dp-state__menu"
            role="menu"
            aria-label={`Move AB#${item.id}`}
            style={position}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bd-dp-state__hint">An agent makes the move</div>
            {groups.map((group) => (
              <div key={group.category} role="group" aria-label={group.label}>
                <div className="bd-dp-state__group">{group.label}</div>
                {group.states.map((state) => {
                  const current = state.name === item.state;
                  return (
                    <button
                      key={state.name}
                      type="button"
                      role="menuitem"
                      className="bd-dp-state__option"
                      aria-current={current ? 'true' : undefined}
                      disabled={current}
                      onClick={() => {
                        close();
                        onMove(state.name);
                      }}
                    >
                      <span>{state.name}</span>
                      {current && <Check size={12} strokeWidth={2.5} aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
