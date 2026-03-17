import clsx from 'clsx';
import type { UiSettings, ThemeMode, SidebarEdge, BadgeStyle, IndicatorStyle } from '@/types';

interface AppearanceSectionProps {
  ui: UiSettings;
  onChange: (ui: UiSettings) => void;
}

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const EDGE_OPTIONS: { value: SidebarEdge; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

const BADGE_STYLES: BadgeStyle[] = ['GlassCapsule', 'MinimalDot'];
const INDICATOR_STYLES: IndicatorStyle[] = ['SegmentRing', 'ProgressArc'];

export function AppearanceSection({ ui, onChange }: AppearanceSectionProps) {
  const update = (partial: Partial<UiSettings>) => onChange({ ...ui, ...partial });

  return (
    <div className="space-y-2.5">
      {/* Theme */}
      <FieldLabel label="Theme">
        <div className="flex gap-1">
          {THEME_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              className={clsx(
                'flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
                ui.theme === value
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
                  : 'bg-[var(--color-filter-chip-bg)] text-[var(--color-filter-chip-fg)] hover:bg-[var(--color-surface-hover)]'
              )}
              onClick={() => update({ theme: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </FieldLabel>

      {/* Sidebar Edge */}
      <FieldLabel label="Sidebar Edge">
        <div className="flex gap-1">
          {EDGE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              className={clsx(
                'flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
                ui.sidebarEdge === value
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
                  : 'bg-[var(--color-filter-chip-bg)] text-[var(--color-filter-chip-fg)] hover:bg-[var(--color-surface-hover)]'
              )}
              onClick={() => update({ sidebarEdge: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </FieldLabel>

      {/* Sidebar Width */}
      <FieldLabel label={`Sidebar Width: ${ui.sidebarWidthPx}px`}>
        <input
          type="range"
          className="w-full accent-[var(--color-accent)]"
          min={200}
          max={1200}
          step={10}
          value={ui.sidebarWidthPx}
          onChange={(e) => update({ sidebarWidthPx: Number(e.target.value) })}
        />
      </FieldLabel>

      {/* Badge Style */}
      <FieldLabel label="Badge Style">
        <select
          className="field-input w-full"
          value={ui.badgeStyle}
          onChange={(e) => update({ badgeStyle: e.target.value as BadgeStyle })}
        >
          {BADGE_STYLES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </FieldLabel>

      {/* Indicator Style */}
      <FieldLabel label="Indicator Style">
        <select
          className="field-input w-full"
          value={ui.indicatorStyle}
          onChange={(e) => update({ indicatorStyle: e.target.value as IndicatorStyle })}
        >
          {INDICATOR_STYLES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </FieldLabel>

      {/* Global Hotkey */}
      <FieldLabel label="Global Hotkey">
        <input
          className="field-input w-full"
          value={ui.globalHotkey}
          onChange={(e) => update({ globalHotkey: e.target.value })}
          placeholder="Ctrl+Shift+P"
        />
      </FieldLabel>
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-[var(--color-text-tertiary)]">{label}</label>
      {children}
    </div>
  );
}
