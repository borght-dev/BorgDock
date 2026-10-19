import clsx from 'clsx';
import { Check, ChevronDown, Search } from 'lucide-react';
import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

export interface SearchSelectOption {
  value: string;
  label: string;
  /** Muted at the right: on the trigger always, in the list when its section shows badges. */
  badge?: string;
}

export interface SearchSelectSection {
  label: string;
  options: SearchSelectOption[];
  /** Show the options' badges in the list. Default true. */
  showBadges?: boolean;
}

export interface SearchSelectProps {
  ariaLabel: string;
  value: string;
  sections: readonly SearchSelectSection[];
  onChange: (value: string) => void;
  /** On the trigger while nothing is picked, e.g. "Loading…". */
  placeholder?: string;
  filterPlaceholder?: string;
  disabled?: boolean;
}

const POPOVER_GAP = 4;
const POPOVER_MAX_HEIGHT = 380;
const POPOVER_MIN_WIDTH = 280;
const VIEWPORT_MARGIN = 12;

/** Under the trigger, or over it when the window ends first; at least as wide as the trigger. */
function popoverPosition(trigger: HTMLElement): CSSProperties {
  const rect = trigger.getBoundingClientRect();
  const width = Math.max(rect.width, POPOVER_MIN_WIDTH);
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN),
  );
  const below = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
  const above = rect.top - VIEWPORT_MARGIN;
  return below >= POPOVER_MAX_HEIGHT || below >= above
    ? {
        top: rect.bottom + POPOVER_GAP,
        left,
        width,
        maxHeight: Math.min(POPOVER_MAX_HEIGHT, below),
      }
    : {
        bottom: window.innerHeight - rect.top + POPOVER_GAP,
        left,
        width,
        maxHeight: Math.min(POPOVER_MAX_HEIGHT, above),
      };
}

function matches(option: SearchSelectOption, section: SearchSelectSection, needle: string) {
  return [option.label, option.badge ?? '', section.label].some((text) =>
    text.toLowerCase().includes(needle),
  );
}

/**
 * SearchSelect — a select for long lists: the trigger shows the pick on one
 * line with its badge; the list opens in a popover with a filter field and
 * named sections. Type to filter, arrows to move, Enter to pick, Esc to close
 * (Esc closes only the popover, not a sheet it sits in). The popover floats
 * over the page, so a sheet's overflow cannot clip it.
 */
export function SearchSelect({
  ariaLabel,
  value,
  sections,
  onChange,
  placeholder = '',
  filterPlaceholder = 'Filter',
  disabled = false,
}: SearchSelectProps) {
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const open = position !== null;

  const selected = sections.flatMap((s) => s.options).find((o) => o.value === value);
  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          options: needle
            ? section.options.filter((option) => matches(option, section, needle))
            : section.options,
        }))
        .filter((section) => section.options.length > 0),
    [sections, needle],
  );
  const flat = visible.flatMap((section) => section.options);
  const activeValue = flat.some((o) => o.value === active) ? active : (flat[0]?.value ?? null);

  const close = (refocus: boolean) => {
    setPosition(null);
    setQuery('');
    if (refocus) triggerRef.current?.focus();
  };

  const openPopover = () => {
    if (!triggerRef.current) return;
    setActive(value || null);
    setPosition(popoverPosition(triggerRef.current));
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: `close` only sets state, so a stale one is fine
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!popoverRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        close(false);
      }
    };
    // On window in the capture phase: runs before a sheet's own Esc listener on document.
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      close(true);
    };
    const onScroll = (e: Event) => {
      if (!popoverRef.current?.contains(e.target as Node)) close(false);
    };
    const onResize = () => close(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !activeValue) return;
    popoverRef.current
      ?.querySelector(`[data-value="${CSS.escape(activeValue)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, activeValue]);

  const pick = (next: string) => {
    onChange(next);
    close(true);
  };

  const onFilterKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const index = flat.findIndex((o) => o.value === activeValue);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive(flat[(index + step + flat.length) % flat.length]!.value);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeValue) pick(activeValue);
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  const optionId = (optionValue: string) => `${listId}-${optionValue.replace(/[^\w-]/g, '_')}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="bd-picker"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-open={open ? 'true' : undefined}
        disabled={disabled}
        onClick={() => (open ? close(false) : openPopover())}
      >
        <span className={clsx('bd-picker__value', !selected && 'bd-picker__value--empty')}>
          {selected?.label ?? placeholder}
        </span>
        {selected?.badge && <span className="bd-picker__badge">{selected.badge}</span>}
        <ChevronDown size={12} strokeWidth={2} aria-hidden="true" className="bd-picker__chev" />
      </button>
      {open &&
        createPortal(
          <div ref={popoverRef} className="bd-picker__popover" style={position}>
            <label className="bd-picker__filter">
              <Search size={13} strokeWidth={2} aria-hidden="true" />
              <input
                autoFocus
                type="text"
                role="combobox"
                aria-label={`Filter ${ariaLabel.toLowerCase()}`}
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={activeValue ? optionId(activeValue) : undefined}
                placeholder={filterPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onFilterKey}
              />
            </label>
            <div id={listId} className="bd-picker__list" role="listbox" aria-label={ariaLabel}>
              {visible.map((section) => (
                <div key={section.label} role="group" aria-label={section.label}>
                  <div className="bd-picker__section" aria-hidden="true">
                    {section.label}
                  </div>
                  {section.options.map((option) => {
                    const isSelected = option.value === value;
                    return (
                      <div
                        key={option.value}
                        id={optionId(option.value)}
                        role="option"
                        aria-selected={isSelected}
                        tabIndex={-1}
                        className="bd-picker__option"
                        data-value={option.value}
                        data-active={option.value === activeValue ? 'true' : undefined}
                        onMouseEnter={() => setActive(option.value)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pick(option.value)}
                      >
                        <span className="bd-picker__check" aria-hidden="true">
                          {isSelected && <Check size={12} strokeWidth={2.5} />}
                        </span>
                        <span className="bd-picker__label">{option.label}</span>
                        {option.badge && section.showBadges !== false && (
                          <span className="bd-picker__badge">{option.badge}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              {visible.length === 0 && <div className="bd-picker__empty">Nothing matches</div>}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
