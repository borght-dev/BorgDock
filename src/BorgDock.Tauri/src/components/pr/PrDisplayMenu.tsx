import clsx from 'clsx';
import {
  ArrowDownUp,
  Check,
  Columns3,
  LayoutList,
  Rows3,
  SlidersHorizontal,
  Table2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Select, Toggle } from '@/components/shared/primitives';
import {
  COLUMN_OPTIONS,
  directionLabel,
  GROUP_OPTIONS,
  groupLabelOf,
  LAYOUT_OPTIONS,
  type PrColumn,
  type PrDisplay,
  type PrGroupBy,
  type PrLayout,
  type PrSortBy,
  SORT_OPTIONS,
  sortLabelOf,
} from '@/services/pr-list/display';
import { usePrStore } from '@/stores/pr-store';
import { usePrViewStore } from '@/stores/pr-view-store';
import { useSettingsStore } from '@/stores/settings-store';
import { PrPopover, usePopover } from './PrPopover';

/** Display changes go through the list, so it can animate the rows. */
export type DisplayChange = (patch: Partial<PrDisplay>) => void;

const LAYOUT_ICON: Record<PrLayout, ReactNode> = {
  list: <LayoutList size={14} strokeWidth={2} aria-hidden="true" />,
  table: <Table2 size={14} strokeWidth={2} aria-hidden="true" />,
  board: <Columns3 size={14} strokeWidth={2} aria-hidden="true" />,
};

/** A sort change: picking the current order again reverses it. */
export function sortPatch(display: PrDisplay, sortBy: PrSortBy): Partial<PrDisplay> {
  if (display.sortBy === sortBy) return { sortDir: display.sortDir === 'asc' ? 'desc' : 'asc' };
  return { sortBy, sortDir: SORT_OPTIONS.find((o) => o.value === sortBy)?.dir ?? 'desc' };
}

function Radio({
  on,
  label,
  hint,
  onPick,
}: {
  on: boolean;
  label: string;
  hint?: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={on}
      className="bd-wb-menu__item bd-prl-radio"
      onClick={onPick}
    >
      <span className="bd-wb-menu__check" aria-hidden="true">
        {on && <Check size={13} strokeWidth={2.25} />}
      </span>
      <span className="bd-prl-radio__text">
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </button>
  );
}

/** "Group: Status" — the primary grouping, one click away. */
export function GroupButton({
  display,
  onChange,
}: {
  display: PrDisplay;
  onChange: DisplayChange;
}) {
  const pop = usePopover();
  const sub = display.subGroupBy !== 'none' && display.layout !== 'board';
  return (
    <>
      <button
        ref={pop.anchor}
        type="button"
        className={clsx('bd-prl-chipbtn', pop.open && 'bd-prl-chipbtn--on')}
        aria-haspopup="menu"
        aria-expanded={pop.open}
        onClick={pop.toggle}
        data-group-button=""
      >
        <Rows3 size={13} strokeWidth={2} aria-hidden="true" />
        <span className="bd-prl-chipbtn__k">
          {display.layout === 'board' ? 'Columns' : 'Group'}
        </span>
        {groupLabelOf(display.groupBy)}
        {sub && ` › ${groupLabelOf(display.subGroupBy)}`}
      </button>
      {pop.open && (
        <PrPopover anchor={pop.anchor} onClose={pop.close} role="menu" label="Group by" width={280}>
          <div className="bd-wb-menu__label">Group by</div>
          {GROUP_OPTIONS.map((o) => (
            <Radio
              key={o.value}
              on={o.value === display.groupBy}
              label={o.label}
              hint={o.hint}
              onPick={() => {
                pop.close();
                onChange({ groupBy: o.value });
              }}
            />
          ))}
        </PrPopover>
      )}
    </>
  );
}

/** "Sort: Priority ↓" — the order, and its direction. */
export function SortButton({ display, onChange }: { display: PrDisplay; onChange: DisplayChange }) {
  const pop = usePopover();
  const arrow = display.sortDir === 'asc' ? '↑' : '↓';
  return (
    <>
      <button
        ref={pop.anchor}
        type="button"
        className={clsx('bd-prl-chipbtn', pop.open && 'bd-prl-chipbtn--on')}
        aria-haspopup="menu"
        aria-expanded={pop.open}
        onClick={pop.toggle}
        data-sort-button=""
        title={directionLabel(display.sortBy, display.sortDir)}
      >
        <ArrowDownUp size={13} strokeWidth={2} aria-hidden="true" />
        <span className="bd-prl-chipbtn__k">Sort</span>
        {sortLabelOf(display.sortBy)} {arrow}
      </button>
      {pop.open && (
        <PrPopover anchor={pop.anchor} onClose={pop.close} role="menu" label="Sort by" width={260}>
          <div className="bd-wb-menu__label">Order by</div>
          {SORT_OPTIONS.map((o) => (
            <Radio
              key={o.value}
              on={o.value === display.sortBy}
              label={o.label}
              hint={o.hint}
              onPick={() => {
                pop.close();
                onChange(sortPatch(display, o.value));
              }}
            />
          ))}
          <div className="bd-wb-menu__separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="bd-wb-menu__item"
            onClick={() => {
              pop.close();
              onChange({ sortDir: display.sortDir === 'asc' ? 'desc' : 'asc' });
            }}
          >
            <span className="bd-wb-menu__check" aria-hidden="true">
              {arrow}
            </span>
            {directionLabel(display.sortBy, display.sortDir)}
            <small className="bd-prl-menu__aside">reverse</small>
          </button>
        </PrPopover>
      )}
    </>
  );
}

function SwitchRow({
  label,
  on,
  onChange,
  disabled,
}: {
  label: string;
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={clsx('bd-prl-switch', disabled && 'bd-prl-switch--off')}>
      <span>{label}</span>
      <Toggle on={on} onChange={onChange} ariaLabel={label} disabled={disabled} />
    </div>
  );
}

const SUB_GROUP_OPTIONS = [
  { value: 'none', label: 'Nothing' },
  ...GROUP_OPTIONS.filter((o) => o.value !== 'none').map((o) => ({
    value: o.value,
    label: o.label,
  })),
];

/**
 * "Display": layout (list, table, board), grouping and sub-grouping, order,
 * the switches, the table's columns, and the shared CI failures summary.
 */
export function DisplayButton({
  display,
  onChange,
  onHideFailing,
}: {
  display: PrDisplay;
  onChange: DisplayChange;
  onHideFailing: (hide: boolean) => void;
}) {
  const pop = usePopover();
  const hideFailing = usePrStore((s) => s.hideFailing);
  const filter = usePrStore((s) => s.filter);
  const showCiSummary = usePrViewStore((s) => s.showCiSummary);
  const activeViewId = usePrViewStore((s) => s.activeViewId);
  const density = useSettingsStore((s) => s.settings.ui.prDensity ?? 'comfortable');
  const board = display.layout === 'board';

  const setDensity = (compact: boolean) => {
    const settings = useSettingsStore.getState();
    settings.updateSettings({
      ui: { ...settings.settings.ui, prDensity: compact ? 'compact' : 'comfortable' },
    });
  };
  const toggleColumn = (column: PrColumn) => {
    const columns = display.columns.includes(column)
      ? display.columns.filter((c) => c !== column)
      : COLUMN_OPTIONS.map((o) => o.value).filter(
          (c) => c === column || display.columns.includes(c),
        );
    onChange({ columns });
  };

  return (
    <>
      <button
        ref={pop.anchor}
        type="button"
        className={clsx('bd-prl-chipbtn', pop.open && 'bd-prl-chipbtn--on')}
        aria-haspopup="dialog"
        aria-expanded={pop.open}
        onClick={pop.toggle}
        data-display-button=""
      >
        <SlidersHorizontal size={13} strokeWidth={2} aria-hidden="true" />
        <span className="bd-prl-chipbtn__label">Display</span>
      </button>
      {pop.open && (
        <PrPopover
          anchor={pop.anchor}
          onClose={pop.close}
          role="dialog"
          label="Display options"
          width={340}
          className="bd-prl-display"
        >
          <section className="bd-prl-display__sec">
            <div className="bd-prl-pop__label">Layout</div>
            <div className="bd-prl-layouts" role="radiogroup" aria-label="Layout">
              {LAYOUT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={display.layout === o.value}
                  className={clsx(display.layout === o.value && 'bd-prl-layouts--on')}
                  onClick={() => onChange({ layout: o.value })}
                  data-layout-option={o.value}
                >
                  {LAYOUT_ICON[o.value]}
                  {o.label}
                </button>
              ))}
            </div>
          </section>
          <section className="bd-prl-display__sec">
            <div className="bd-prl-field">
              <span>{board ? 'Columns' : 'Grouping'}</span>
              <Select
                ariaLabel="Grouping"
                value={display.groupBy}
                options={GROUP_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                onChange={(v) => onChange({ groupBy: v as PrGroupBy })}
              />
            </div>
            {!board && (
              <div className="bd-prl-field">
                <span>Then by</span>
                <Select
                  ariaLabel="Then group by"
                  value={display.subGroupBy}
                  options={SUB_GROUP_OPTIONS}
                  onChange={(v) => onChange({ subGroupBy: v as PrGroupBy })}
                />
              </div>
            )}
            <div className="bd-prl-field">
              <span>Ordering</span>
              <Select
                ariaLabel="Ordering"
                value={display.sortBy}
                options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                onChange={(v) => onChange(sortPatch(display, v as PrSortBy))}
              />
              <button
                type="button"
                className="bd-prl-iconbtn bd-prl-iconbtn--boxed"
                aria-label={`Reverse order (now ${directionLabel(display.sortBy, display.sortDir).toLowerCase()})`}
                title={directionLabel(display.sortBy, display.sortDir)}
                onClick={() => onChange({ sortDir: display.sortDir === 'asc' ? 'desc' : 'asc' })}
              >
                {display.sortDir === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </section>
          <section className="bd-prl-display__sec">
            <SwitchRow
              label="Pin “Your turn” above other groups"
              on={display.pinYourTurn}
              disabled={board}
              onChange={(pinYourTurn) => onChange({ pinYourTurn })}
            />
            <SwitchRow
              label="Collapse groups with nothing for you"
              on={display.collapseQuiet}
              disabled={board}
              onChange={(collapseQuiet) => onChange({ collapseQuiet })}
            />
            <SwitchRow
              label="Show empty groups"
              on={display.showEmptyGroups}
              onChange={(showEmptyGroups) => onChange({ showEmptyGroups })}
            />
            <SwitchRow
              label="Hide PRs with failing checks"
              on={hideFailing}
              disabled={filter === 'failing'}
              onChange={onHideFailing}
            />
            <SwitchRow
              label="Compact rows"
              on={density === 'compact'}
              disabled={board}
              onChange={setDensity}
            />
            <SwitchRow
              label="Shared CI failures summary"
              on={showCiSummary}
              onChange={(show) => usePrViewStore.getState().setShowCiSummary(show)}
            />
          </section>
          {display.layout === 'table' && (
            <section className="bd-prl-display__sec">
              <div className="bd-prl-pop__label">Columns</div>
              <div className="bd-prl-props">
                {COLUMN_OPTIONS.map((o) => {
                  const on = display.columns.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={on}
                      className={clsx('bd-prl-prop', on && 'bd-prl-prop--on')}
                      onClick={() => toggleColumn(o.value)}
                      data-column-option={o.value}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          <footer className="bd-prl-display__foot">
            <button
              type="button"
              className="bd-prl-btn bd-prl-btn--quiet"
              onClick={() => usePrViewStore.getState().resetDisplay()}
            >
              Reset to default
            </button>
            <span className="bd-prl-display__note">
              {activeViewId
                ? 'Changes apply to this view until you save it'
                : '“+ View” saves this setup'}
            </span>
          </footer>
        </PrPopover>
      )}
    </>
  );
}
