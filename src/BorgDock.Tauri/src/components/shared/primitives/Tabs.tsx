import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

export interface TabDef {
  id: string;
  label: string;
  count?: number;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Currently selected tab id. */
  value: string;
  /** Fires on tab click with the new id. */
  onChange: (id: string) => void;
  /** Tab definitions in display order. */
  tabs: TabDef[];
  /** Tighter spacing — used by nested tab bars. Default false. */
  dense?: boolean;
}

/**
 * Tabs — horizontal tab bar with an animated underline on the active tab.
 * One primitive covers every tab bar in the app (PR detail, review, settings, focus subtabs, etc.).
 */
export function Tabs({
  value,
  onChange,
  tabs,
  dense = false,
  className,
  ...rest
}: TabsProps) {
  return (
    <div
      role="tablist"
      className={clsx('bd-tabs', dense && 'bd-tabs--dense', className)}
      {...rest}
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={clsx('bd-tab', active ? 'bd-tab--active' : 'bd-tab--inactive')}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {tab.count !== undefined && <span className="bd-tab__count">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
