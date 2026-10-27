import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem {
  id: string;
  label: string;
  /** A quieter second line, or why it is disabled. */
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

export interface MenuGroup {
  label?: string;
  items: MenuItem[];
}

const MENU_GAP = 4;
const MENU_MAX_HEIGHT = 360;

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

interface MenuProps {
  /** The button that opens the menu; it gets the click and the ARIA wiring. */
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  }) => ReactNode;
  label: string;
  groups: MenuGroup[];
}

/**
 * Menu — a list of actions that floats over the page from a button, so a
 * scrolling table can't clip it. Arrow keys move, Enter picks, Esc closes and
 * gives focus back to the button. Uses the opaque menu surface in both themes.
 */
export function Menu({ trigger, label, groups }: MenuProps) {
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = position !== null;

  useEffect(() => {
    if (!open) return;
    const dismiss = () => setPosition(null);
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) dismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      const items = [
        ...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
          '[role="menuitem"]:not(:disabled)',
        ) ?? []),
      ];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        dismiss();
        buttonRef.current?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        items[(index + step + items.length) % items.length]?.focus();
      } else if (e.key === 'Tab') {
        dismiss();
      }
    };
    const onScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) dismiss();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', dismiss);
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);

  return (
    <>
      {trigger({
        ref: buttonRef,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        onClick: (e) => {
          e.stopPropagation();
          setPosition(open ? null : menuPosition(e.currentTarget));
        },
      })}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="bd-ws-menu"
            role="menu"
            aria-label={label}
            style={position}
            onClick={(e) => e.stopPropagation()}
          >
            {groups
              .filter((group) => group.items.length > 0)
              .map((group, i) => (
                <div
                  key={group.label ?? i}
                  role="group"
                  aria-label={group.label}
                  className="bd-ws-menu__group"
                >
                  {group.label && <div className="bd-ws-menu__label">{group.label}</div>}
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      className="bd-ws-menu__item"
                      data-danger={item.danger || undefined}
                      disabled={item.disabled}
                      title={item.disabled ? item.hint : undefined}
                      onClick={() => {
                        setPosition(null);
                        buttonRef.current?.focus();
                        item.onSelect();
                      }}
                    >
                      <span>{item.label}</span>
                      {item.hint && <span className="bd-ws-menu__hint">{item.hint}</span>}
                    </button>
                  ))}
                </div>
              ))}
          </div>,
          document.body,
        )}
    </>
  );
}
