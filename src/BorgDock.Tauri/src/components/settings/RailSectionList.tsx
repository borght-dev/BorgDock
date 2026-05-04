import clsx from 'clsx';
import { Dot } from '@/components/shared/primitives';
import { SETTINGS_GROUPS, SETTINGS_SECTIONS, type SettingsSectionId } from './sections-catalog';

interface Props { active: SettingsSectionId; onSelect: (id: SettingsSectionId) => void }

export function RailSectionList({ active, onSelect }: Props) {
  return (
    <>
      {SETTINGS_GROUPS.map((g) => {
        const items = SETTINGS_SECTIONS.filter((s) => s.group === g.id);
        if (!items.length) return null;
        return (
          <div key={g.id} className="mb-2.5">
            <div className="px-2.5 pb-1.5 pt-2 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
              {g.label}
            </div>
            {items.map((s) => {
              const a = active === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className={clsx(
                    'mb-px flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs',
                    a ? 'bg-[var(--color-accent-subtle)] font-semibold text-[var(--color-accent)]'
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
    </>
  );
}
