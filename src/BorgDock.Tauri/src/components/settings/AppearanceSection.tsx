import clsx from 'clsx';
import type {
  BadgeStyle,
  IndicatorStyle,
  SidebarEdge,
  SidebarMode,
  ThemeMode,
  UiSettings,
} from '@/types';
import { HotkeyRecorder } from './HotkeyRecorder';

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

const MODE_OPTIONS: { value: SidebarMode; label: string }[] = [
  { value: 'pinned', label: 'Pinned' },
  { value: 'floating', label: 'Floating' },
];

const BADGE_STYLES: BadgeStyle[] = [
  'GlassCapsule',
  'MinimalNotch',
  'FloatingIsland',
  'LiquidMorph',
  'SpectralBar',
];
const INDICATOR_STYLES: IndicatorStyle[] = ['SegmentRing', 'SignalDots'];

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
                  : 'bg-[var(--color-filter-chip-bg)] text-[var(--color-filter-chip-fg)] hover:bg-[var(--color-surface-hover)]',
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
                  : 'bg-[var(--color-filter-chip-bg)] text-[var(--color-filter-chip-fg)] hover:bg-[var(--color-surface-hover)]',
              )}
              onClick={() => update({ sidebarEdge: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </FieldLabel>

      {/* Sidebar Mode */}
      <FieldLabel label="Sidebar Mode">
        <div className="flex gap-1">
          {MODE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              className={clsx(
                'flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
                ui.sidebarMode === value
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
                  : 'bg-[var(--color-filter-chip-bg)] text-[var(--color-filter-chip-fg)] hover:bg-[var(--color-surface-hover)]',
              )}
              onClick={() => update({ sidebarMode: value })}
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
        <div className="flex justify-between text-[9px] text-[var(--color-text-ghost)]">
          <span>200</span>
          <span>1200</span>
        </div>
      </FieldLabel>

      {/* Show Badge */}
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium text-[var(--color-text-tertiary)]">
          Show floating badge
        </label>
        <button
          onClick={() => update({ badgeEnabled: !ui.badgeEnabled })}
          className={clsx(
            'relative h-5 w-9 rounded-full transition-colors',
            ui.badgeEnabled ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-filter-chip-bg)]',
          )}
        >
          <div
            className={clsx(
              'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
              ui.badgeEnabled ? 'translate-x-4' : 'translate-x-0.5',
            )}
          />
        </button>
      </div>

      {/* Badge Style */}
      <FieldLabel label="Badge Style">
        <select
          className="field-input w-full"
          value={ui.badgeStyle}
          disabled={!ui.badgeEnabled}
          onChange={(e) => update({ badgeStyle: e.target.value as BadgeStyle })}
        >
          {BADGE_STYLES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
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
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </FieldLabel>

      {/* Global Hotkey */}
      <FieldLabel label="Global Hotkey">
        <HotkeyRecorder
          value={ui.globalHotkey}
          onChange={(shortcut) => update({ globalHotkey: shortcut })}
        />
      </FieldLabel>

      {/* Windows Terminal profile override (only meaningful on Windows, but the
          field is harmless on other platforms and will simply be ignored). */}
      <FieldLabel label="Windows Terminal profile">
        <input
          type="text"
          value={ui.windowsTerminalProfile ?? ''}
          onChange={(e) =>
            update({
              windowsTerminalProfile: e.target.value.trim() || undefined,
            })
          }
          placeholder="Auto-detect"
          className="field-input w-full"
          spellCheck={false}
        />
        <div className="mt-1 text-[10px] text-[var(--color-text-ghost)]">
          Used by the "Claude" button in the checkout flow. Leave empty to auto-detect your default profile.
        </div>
      </FieldLabel>

      {/* Run at Startup */}
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium text-[var(--color-text-tertiary)]">
          Run at startup
        </label>
        <button
          onClick={() => update({ runAtStartup: !ui.runAtStartup })}
          className={clsx(
            'relative h-5 w-9 rounded-full transition-colors',
            ui.runAtStartup ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-filter-chip-bg)]',
          )}
        >
          <div
            className={clsx(
              'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
              ui.runAtStartup ? 'translate-x-4' : 'translate-x-0.5',
            )}
          />
        </button>
      </div>
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
