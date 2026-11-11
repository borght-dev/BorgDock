import clsx from 'clsx';
import { MoreHorizontal, Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { BUILT_IN_VIEWS, type PrViewKey } from '@/services/pr-list/model';
import { usePrStore } from '@/stores/pr-store';
import { useActiveSavedView, usePrViewStore } from '@/stores/pr-view-store';
import { PrPopover, usePopover } from './PrPopover';

/** A tab change, handed to the list so it can animate the rows. */
export type PrViewChoice = { kind: 'builtIn'; key: PrViewKey } | { kind: 'saved'; id: string };

interface NameFormProps {
  initial: string;
  submitLabel: string;
  onSubmit: (name: string) => void;
}

/** One text field and a button: naming a new view, or renaming one. */
function NameForm({ initial, submitLabel, onSubmit }: NameFormProps) {
  const [name, setName] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) onSubmit(name.trim());
  };
  return (
    <form className="bd-prl-name" onSubmit={submit}>
      <label className="bd-prl-pop__label" htmlFor="bd-prl-view-name">
        View name
      </label>
      <input
        id="bd-prl-view-name"
        className="bd-prl-name__input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Vera’s red PRs"
        maxLength={60}
      />
      <p className="bd-prl-name__hint">Keeps the tab, the filters, the grouping and the order.</p>
      <button type="submit" className="bd-prl-btn bd-prl-btn--primary" disabled={!name.trim()}>
        {submitLabel}
      </button>
    </form>
  );
}

/** "+ View": save the list as it is now under a name. */
export function SaveViewButton({ label = 'View' }: { label?: string }) {
  const pop = usePopover();
  const saveView = usePrViewStore((s) => s.saveView);
  return (
    <>
      <button
        ref={pop.anchor}
        type="button"
        className="bd-prl-tab bd-prl-tab--add"
        aria-haspopup="dialog"
        aria-expanded={pop.open}
        title="Save the current tab, filters, grouping and order as a view"
        onClick={pop.toggle}
      >
        <Plus size={13} strokeWidth={2} aria-hidden="true" />
        {label}
      </button>
      {pop.open && (
        <PrPopover
          anchor={pop.anchor}
          onClose={pop.close}
          role="dialog"
          label="Save view"
          align="start"
          width={260}
        >
          <NameForm
            initial=""
            submitLabel="Save view"
            onSubmit={(name) => {
              saveView(name);
              pop.close();
            }}
          />
        </PrPopover>
      )}
    </>
  );
}

/** The active saved view's menu: rename, update, revert, delete. */
function SavedViewMenu({ id, name, edited }: { id: string; name: string; edited: boolean }) {
  const pop = usePopover();
  const [renaming, setRenaming] = useState(false);
  const store = usePrViewStore.getState;
  const close = () => {
    pop.close();
    setRenaming(false);
  };
  return (
    <>
      <button
        ref={pop.anchor}
        type="button"
        className="bd-prl-tab__more"
        aria-label={`${name} view options`}
        aria-haspopup="menu"
        aria-expanded={pop.open}
        onClick={pop.toggle}
      >
        <MoreHorizontal size={13} strokeWidth={2} aria-hidden="true" />
      </button>
      {pop.open &&
        (renaming ? (
          <PrPopover
            anchor={pop.anchor}
            onClose={close}
            role="dialog"
            label="Rename view"
            align="start"
            width={260}
          >
            <NameForm
              initial={name}
              submitLabel="Rename"
              onSubmit={(next) => {
                store().renameView(id, next);
                close();
              }}
            />
          </PrPopover>
        ) : (
          <PrPopover
            anchor={pop.anchor}
            onClose={close}
            role="menu"
            label={`${name} view`}
            align="start"
            width={200}
          >
            <button
              type="button"
              role="menuitem"
              className="bd-wb-menu__item"
              disabled={!edited}
              onClick={() => {
                store().updateActiveView();
                close();
              }}
            >
              Save changes to view
            </button>
            <button
              type="button"
              role="menuitem"
              className="bd-wb-menu__item"
              disabled={!edited}
              onClick={() => {
                store().revertActiveView();
                close();
              }}
            >
              Discard changes
            </button>
            <button
              type="button"
              role="menuitem"
              className="bd-wb-menu__item"
              onClick={() => setRenaming(true)}
            >
              Rename…
            </button>
            <div className="bd-wb-menu__separator" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="bd-wb-menu__item bd-wb-menu__item--danger"
              onClick={() => {
                store().deleteView(id);
                close();
              }}
            >
              Delete view
            </button>
          </PrPopover>
        ))}
    </>
  );
}

interface PrViewTabsProps {
  /** The tab to show as chosen (the list passes a just-picked one before the stores have it). */
  pending: PrViewChoice | null;
  counts: Record<PrViewKey, number>;
  savedCounts: Record<string, number>;
  onPick: (choice: PrViewChoice) => void;
}

/**
 * PrViewTabs — the list's views: the built-in tabs (All, Your turn, Mine,
 * Failing, Ready to merge, Stale) with their counts, then the saved views,
 * then "+ View". The active saved view shows a dot while the list differs
 * from what it saved, and a menu to save, discard, rename or delete.
 */
export function PrViewTabs({ pending, counts, savedCounts, onPick }: PrViewTabsProps) {
  const filter = usePrStore((s) => s.filter);
  const savedViews = usePrViewStore((s) => s.savedViews);
  const activeId = usePrViewStore((s) => s.activeViewId);
  const { edited } = useActiveSavedView();

  const chosen: PrViewChoice =
    pending ?? (activeId ? { kind: 'saved', id: activeId } : { kind: 'builtIn', key: filter });

  return (
    <div className="bd-prl-tabs" role="tablist" aria-label="Pull request views">
      {BUILT_IN_VIEWS.map((v) => {
        const on = chosen.kind === 'builtIn' && chosen.key === v.key;
        return (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={on}
            className={clsx('bd-prl-tab', on && 'bd-prl-tab--on')}
            data-view-key={v.key}
            onClick={() => {
              if (!on) onPick({ kind: 'builtIn', key: v.key });
            }}
          >
            {v.label}
            <span className="bd-prl-tab__count">{counts[v.key]}</span>
          </button>
        );
      })}
      {savedViews.map((v) => {
        const on = chosen.kind === 'saved' && chosen.id === v.id;
        return (
          <span key={v.id} className="bd-prl-tab__wrap">
            <button
              type="button"
              role="tab"
              aria-selected={on}
              className={clsx('bd-prl-tab', on && 'bd-prl-tab--on')}
              data-saved-view={v.id}
              onClick={() => {
                if (!on) onPick({ kind: 'saved', id: v.id });
              }}
            >
              {v.name}
              <span className="bd-prl-tab__count">{savedCounts[v.id] ?? 0}</span>
              {on && edited && (
                <span className="bd-prl-tab__edited" role="img" aria-label="Unsaved changes" />
              )}
            </button>
            {on && <SavedViewMenu id={v.id} name={v.name} edited={edited} />}
          </span>
        );
      })}
      <SaveViewButton />
    </div>
  );
}
