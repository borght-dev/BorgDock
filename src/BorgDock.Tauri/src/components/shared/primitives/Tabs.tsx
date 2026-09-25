import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';
import { SlidingHighlight } from './SlidingHighlight';

export interface TabDef {
  id: string;
  label: string;
  /** Trailing count badge. Accepts numbers (e.g. 12) or strings (e.g. "13/15"). */
  count?: number | string;
  /** Optional adornment rendered before the label — e.g. a yellow spinner. */
  indicator?: ReactNode;
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
  /**
   * The underline slides from tab to tab (`SlidingHighlight`,
   * `--motion-move`) instead of appearing under the new tab. Default false.
   */
  sliding?: boolean;
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
  sliding = false,
  className,
  ...rest
}: TabsProps) {
  const buttons = tabs.map((tab) => {
    const active = tab.id === value;
    return (
      <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={active}
        className={clsx('bd-tab', active ? 'bd-tab--active' : 'bd-tab--inactive')}
        data-highlight-key={sliding ? tab.id : undefined}
        onClick={() => onChange(tab.id)}
      >
        {tab.indicator !== undefined && (
          <span className="bd-tab__indicator" aria-hidden="true">
            {tab.indicator}
          </span>
        )}
        {tab.label}
        {tab.count !== undefined && (
          <span className="bd-tab__count" aria-hidden="true">
            {String(tab.count)}
          </span>
        )}
      </button>
    );
  });

  if (sliding) {
    return (
      <SlidingHighlight
        activeKey={value}
        variant="underline"
        role="tablist"
        className={clsx('bd-tabs', 'bd-tabs--sliding', dense && 'bd-tabs--dense', className)}
        {...rest}
      >
        {buttons}
      </SlidingHighlight>
    );
  }

  return (
    <div role="tablist" className={clsx('bd-tabs', dense && 'bd-tabs--dense', className)} {...rest}>
      {buttons}
    </div>
  );
}
