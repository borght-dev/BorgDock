import { SETTINGS_FIELDS } from './settings-search-index';
import { SETTINGS_SECTIONS, type SettingsSectionId } from './sections-catalog';

interface Props { query: string; onSelect: (id: SettingsSectionId) => void }

function sectionLabel(id: SettingsSectionId) {
  return SETTINGS_SECTIONS.find((s) => s.id === id)?.label ?? id;
}

export function RailSearchResults({ query, onSelect }: Props) {
  const q = query.toLowerCase().trim();
  const matches = SETTINGS_FIELDS.filter((f) =>
    f.label.toLowerCase().includes(q)
    || (f.hint?.toLowerCase().includes(q) ?? false)
    || (f.keywords?.some((k) => k.toLowerCase().includes(q)) ?? false),
  );
  if (matches.length === 0) {
    return <div className="px-2.5 py-2 text-[11px] text-[var(--color-text-muted)]">No matches.</div>;
  }
  return (
    <ul className="space-y-px">
      {matches.map((f) => (
        <li key={`${f.sectionId}.${f.anchorId}`}>
          <button
            type="button"
            onClick={() => onSelect(f.sectionId)}
            className="w-full rounded-md px-2.5 py-1.5 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
          >
            <div className="font-medium">{f.label}</div>
            <div className="text-[10.5px] text-[var(--color-text-muted)]">{sectionLabel(f.sectionId)}</div>
          </button>
        </li>
      ))}
    </ul>
  );
}
