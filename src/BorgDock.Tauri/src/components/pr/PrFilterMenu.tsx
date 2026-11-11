import clsx from 'clsx';
import { Check, ChevronLeft, ListFilter, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { chipText, FACET_FIELDS, facetValues, fieldLabel } from '@/services/pr-list/facets';
import type { PrFacts } from '@/services/pr-list/facts';
import {
  type MatchContext,
  parseQuery,
  type QueryField,
  type QueryTerm,
  removeTerm,
  setTerm,
} from '@/services/pr-list/query';
import { usePrStore } from '@/stores/pr-store';
import { PrPopover, usePopover } from './PrPopover';

function writeQuery(query: string) {
  usePrStore.getState().setSearchQuery(query);
}

interface ValueListProps {
  field: QueryField;
  /** The PRs of the current tab, for the counts. */
  facts: readonly PrFacts[];
  ctx: MatchContext;
  onBack?: () => void;
}

/** The values of one field as checkboxes, with "is any of / is none of". Edits the query as you click. */
function ValueList({ field, facts, ctx, onBack }: ValueListProps) {
  const query = usePrStore((s) => s.searchQuery);
  const term = parseQuery(query).terms.find((t) => t.field === field);
  const chosen = new Set(term?.values ?? []);
  const negate = term?.negate ?? false;
  const values = useMemo(() => facetValues(field, facts, ctx), [field, facts, ctx]);
  const [find, setFind] = useState('');
  const shown = find
    ? values.filter((v) => v.label.toLowerCase().includes(find.toLowerCase()))
    : values;

  const toggle = (value: string) => {
    const next = new Set(chosen);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    writeQuery(setTerm(query, field, [...next], negate));
  };

  return (
    <div className="bd-prl-values">
      <div className="bd-prl-values__head">
        {onBack && (
          <button type="button" className="bd-prl-iconbtn" aria-label="All fields" onClick={onBack}>
            <ChevronLeft size={13} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
        <span className="bd-prl-values__title">{fieldLabel(field)}</span>
        <span className="bd-prl-seg" role="group" aria-label="Match">
          <button
            type="button"
            aria-pressed={!negate}
            className={clsx(!negate && 'bd-prl-seg--on')}
            onClick={() => chosen.size > 0 && writeQuery(setTerm(query, field, [...chosen], false))}
          >
            is any of
          </button>
          <button
            type="button"
            aria-pressed={negate}
            className={clsx(negate && 'bd-prl-seg--on')}
            onClick={() => chosen.size > 0 && writeQuery(setTerm(query, field, [...chosen], true))}
          >
            is none of
          </button>
        </span>
      </div>
      {values.length > 8 && (
        <label className="bd-prl-find">
          <Search size={12} strokeWidth={2} aria-hidden="true" />
          <input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder={`Find ${fieldLabel(field).toLowerCase()}…`}
            aria-label={`Find ${fieldLabel(field)}`}
          />
        </label>
      )}
      <div className="bd-prl-values__list">
        {shown.length === 0 && <p className="bd-prl-values__empty">Nothing to pick</p>}
        {shown.map((v) => {
          const on = chosen.has(v.value);
          return (
            <button
              key={v.value}
              type="button"
              role="menuitemcheckbox"
              aria-checked={on}
              className="bd-wb-menu__item bd-prl-value"
              data-facet-value={v.value}
              onClick={() => toggle(v.value)}
            >
              <span className={clsx('bd-prl-box', on && 'bd-prl-box--on')} aria-hidden="true">
                {on && <Check size={10} strokeWidth={3} />}
              </span>
              <span className="bd-prl-value__label">{v.label}</span>
              <span className="bd-prl-value__count">{v.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface FilterProps {
  facts: readonly PrFacts[];
  ctx: MatchContext;
}

/** "+ Filter": pick a field, then its values. */
export function AddFilterButton({ facts, ctx }: FilterProps) {
  const pop = usePopover();
  const [field, setField] = useState<QueryField | null>(null);
  const close = () => {
    pop.close();
    setField(null);
  };
  return (
    <>
      <button
        ref={pop.anchor}
        type="button"
        className={clsx('bd-prl-chipbtn bd-prl-chipbtn--ghost', pop.open && 'bd-prl-chipbtn--on')}
        aria-haspopup="menu"
        aria-expanded={pop.open}
        onClick={() => (pop.open ? close() : pop.setOpen(true))}
        data-add-filter=""
      >
        <ListFilter size={13} strokeWidth={2} aria-hidden="true" />
        Filter
      </button>
      {pop.open && (
        <PrPopover
          anchor={pop.anchor}
          onClose={close}
          role="menu"
          label="Add a filter"
          align="start"
          width={270}
        >
          {field ? (
            <ValueList field={field} facts={facts} ctx={ctx} onBack={() => setField(null)} />
          ) : (
            <>
              <div className="bd-wb-menu__label">Filter by</div>
              {FACET_FIELDS.map((f) => (
                <button
                  key={f.field}
                  type="button"
                  role="menuitem"
                  className="bd-wb-menu__item"
                  data-facet-field={f.field}
                  onClick={() => setField(f.field)}
                >
                  <span className="bd-prl-value__label">
                    {f.label}
                    {f.hint && <small className="bd-prl-value__hint"> {f.hint}</small>}
                  </span>
                  <span className="bd-prl-value__count">{f.field}:</span>
                </button>
              ))}
            </>
          )}
        </PrPopover>
      )}
    </>
  );
}

/** One qualifier as a chip: click edits its values, × removes it. */
function FilterChip({ term, index, facts, ctx }: FilterProps & { term: QueryTerm; index: number }) {
  const pop = usePopover();
  const text = chipText(term);
  const editable = FACET_FIELDS.some((f) => f.field === term.field);
  return (
    <span className="bd-prl-fchip" data-filter-chip={term.field}>
      <button
        ref={pop.anchor}
        type="button"
        className="bd-prl-fchip__body"
        aria-haspopup={editable ? 'menu' : undefined}
        aria-expanded={editable ? pop.open : undefined}
        title={editable ? 'Change this filter' : undefined}
        onClick={() => editable && pop.toggle()}
      >
        <span className="bd-prl-fchip__field">{text.field}</span>
        <span className="bd-prl-fchip__op">{text.op}</span>
        <span className="bd-prl-fchip__val">{text.values}</span>
      </button>
      <button
        type="button"
        className="bd-prl-fchip__x"
        aria-label={`Remove ${text.field} filter`}
        onClick={() => writeQuery(removeTerm(usePrStore.getState().searchQuery, index))}
      >
        <X size={11} strokeWidth={2.25} aria-hidden="true" />
      </button>
      {pop.open && (
        <PrPopover
          anchor={pop.anchor}
          onClose={pop.close}
          role="menu"
          label={`${text.field} filter`}
          align="start"
          width={270}
        >
          <ValueList field={term.field} facts={facts} ctx={ctx} />
        </PrPopover>
      )}
    </span>
  );
}

/** The query's qualifiers as chips. */
export function FilterChips({ terms, facts, ctx }: FilterProps & { terms: readonly QueryTerm[] }) {
  return (
    <>
      {terms.map((term, index) => (
        <FilterChip
          // biome-ignore lint/suspicious/noArrayIndexKey: a term is identified by its place in the query
          key={`${index}:${term.field}`}
          term={term}
          index={index}
          facts={facts}
          ctx={ctx}
        />
      ))}
    </>
  );
}
