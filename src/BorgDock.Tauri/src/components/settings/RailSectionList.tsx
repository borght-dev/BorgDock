import clsx from 'clsx';
import { Dot, SlidingHighlight } from '@/components/shared/primitives';
import { SETTINGS_GROUPS, SETTINGS_SECTIONS, type SettingsSectionId } from './sections-catalog';

interface Props {
  active: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
}

/**
 * The Settings window's section list. The selection wash slides to the chosen
 * section (`SlidingHighlight`, `--motion-move`), like the main window's rail.
 */
export function RailSectionList({ active, onSelect }: Props) {
  return (
    <SlidingHighlight activeKey={active} highlightClassName="bd-settings-rail__hl">
      {SETTINGS_GROUPS.map((g) => {
        const items = SETTINGS_SECTIONS.filter((s) => s.group === g.id);
        if (!items.length) return null;
        return (
          <div key={g.id} className="mb-2.5">
            <div className="px-2.5 pb-1.5 pt-2 text-[11px] font-medium text-[var(--color-text-muted)]">
              {g.label}
            </div>
            {items.map((s) => {
              const a = active === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  data-highlight-key={s.id}
                  aria-current={a ? 'page' : undefined}
                  onClick={() => onSelect(s.id)}
                  className={clsx(
                    'bd-settings-rail__item mb-px flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs',
                    a
                      ? 'font-semibold text-[var(--color-purple)]'
                      : 'font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]',
                  )}
                >
                  <span className="flex-1">{s.label}</span>
                  {(s.id === 'github' || s.id === 'ado') && <Dot tone="green" size={6} />}
                </button>
              );
            })}
          </div>
        );
      })}
    </SlidingHighlight>
  );
}
