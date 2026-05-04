import { SETTINGS_FIELDS, type FieldEntry } from './settings-search-index';
import { SETTINGS_SECTIONS, type SettingsSectionId } from './sections-catalog';

interface Props {
  query: string;
  onSelect: (entry: { sectionId: SettingsSectionId; anchorId: string }) => void;
}

function sectionLabel(id: SettingsSectionId) {
  return SETTINGS_SECTIONS.find((s) => s.id === id)?.label ?? id;
}

function score(field: FieldEntry, q: string): number {
  if (field.label.toLowerCase().includes(q)) return 3;
  if (field.hint?.toLowerCase().includes(q)) return 2;
  if (field.keywords?.some((k) => k.toLowerCase().includes(q))) return 1;
  return 0;
}

export function RailSearchResults({ query, onSelect }: Props) {
  const q = query.toLowerCase().trim();
  const matches = SETTINGS_FIELDS
    .map((f) => ({ f, s: score(f, q) }))
    .filter((m) => m.s > 0)
    .sort((a, b) => b.s - a.s);

  if (matches.length === 0) {
    return <div className="px-2.5 py-2 text-[11px] text-[var(--color-text-muted)]">No matches.</div>;
  }
  return (
    <ul className="space-y-px">
      {matches.map(({ f }) => (
        <li key={`${f.sectionId}.${f.anchorId}`}>
          <button
            type="button"
            onClick={() => onSelect({ sectionId: f.sectionId, anchorId: f.anchorId })}
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
