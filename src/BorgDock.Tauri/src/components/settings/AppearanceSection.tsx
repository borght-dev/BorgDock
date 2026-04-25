import type {
  SidebarEdge,
  SidebarMode,
  ThemeMode,
  UiSettings,
} from '@/types';
import { Chip, Input } from '@/components/shared/primitives';
import { HotkeyRecorder } from './HotkeyRecorder';
import { ToggleSwitch } from './_ToggleSwitch';

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


export function AppearanceSection({ ui, onChange }: AppearanceSectionProps) {
  const update = (partial: Partial<UiSettings>) => onChange({ ...ui, ...partial });

  return (
    <div className="space-y-2.5" data-settings-section="appearance">
      {/* Theme */}
      <FieldLabel label="Theme">
        <div className="flex gap-1">
          {THEME_OPTIONS.map(({ value, label }) => (
            <Chip
              key={value}
              active={ui.theme === value}
              onClick={() => update({ theme: value })}
              data-segmented-option
              data-active={ui.theme === value}
              className="flex-1 justify-center"
            >
              {label}
            </Chip>
          ))}
        </div>
      </FieldLabel>

      {/* Sidebar Edge */}
      <FieldLabel label="Sidebar Edge">
        <div className="flex gap-1">
          {EDGE_OPTIONS.map(({ value, label }) => (
            <Chip
              key={value}
              active={ui.sidebarEdge === value}
              onClick={() => update({ sidebarEdge: value })}
              data-segmented-option
              data-active={ui.sidebarEdge === value}
              className="flex-1 justify-center"
            >
              {label}
            </Chip>
          ))}
        </div>
      </FieldLabel>

      {/* Sidebar Mode */}
      <FieldLabel label="Sidebar Mode">
        <div className="flex gap-1">
          {MODE_OPTIONS.map(({ value, label }) => (
            <Chip
              key={value}
              active={ui.sidebarMode === value}
              onClick={() => update({ sidebarMode: value })}
              data-segmented-option
              data-active={ui.sidebarMode === value}
              className="flex-1 justify-center"
            >
              {label}
            </Chip>
          ))}
        </div>
      </FieldLabel>

      {/* Sidebar Width */}
      <FieldLabel label={`Sidebar Width: ${ui.sidebarWidthPx}px`}>
        <input
          type="range"
          className="w-full accent-[var(--color-accent)]"
          data-settings-control="sidebar-width"
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

      {/* Global Hotkey */}
      <FieldLabel label="Global Hotkey">
        <HotkeyRecorder
          value={ui.globalHotkey}
          onChange={(shortcut) => update({ globalHotkey: shortcut })}
        />
      </FieldLabel>

      {/* Flyout Hotkey */}
      <FieldLabel label="Flyout hotkey">
        <HotkeyRecorder
          value={ui.flyoutHotkey}
          onChange={(shortcut) => update({ flyoutHotkey: shortcut })}
        />
        <div className="mt-1 text-[10px] text-[var(--color-text-ghost)]">
          Toggles the tray flyout from anywhere. Default: Ctrl+Win+Shift+F.
        </div>
      </FieldLabel>

      {/* Windows Terminal profile override (only meaningful on Windows, but the
          field is harmless on other platforms and will simply be ignored). */}
      <FieldLabel label="Windows Terminal profile">
        <Input
          type="text"
          value={ui.windowsTerminalProfile ?? ''}
          onChange={(e) =>
            update({
              windowsTerminalProfile: e.target.value.trim() || undefined,
            })
          }
          placeholder="Auto-detect"
          spellCheck={false}
          className="w-full"
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
        <ToggleSwitch
          checked={ui.runAtStartup}
          onChange={(next) => update({ runAtStartup: next })}
          aria-label="Run at startup"
        />
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
