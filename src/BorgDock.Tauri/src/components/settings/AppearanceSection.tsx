import { Card } from '@/components/shared/primitives';
import { Field, SectionHeader, Seg2, Slider, TextInput, ToggleRow } from '@/components/shared/primitives';
import type { UiSettings, ThemeMode, SidebarEdge, SidebarMode } from '@/types/settings';
import { HotkeyRecorder } from './HotkeyRecorder';
import { enable as enableAutostart, disable as disableAutostart } from '@tauri-apps/plugin-autostart';

interface Props { ui: UiSettings; onChange: (u: UiSettings) => void }

export function AppearanceSection({ ui, onChange }: Props) {
  const update = (partial: Partial<UiSettings>) => onChange({ ...ui, ...partial });

  return (
    <>
      <SectionHeader
        title="Appearance"
        subtitle="Theme, sidebar layout, hotkeys and the always-on-top tray flyout."
      />

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">Theme</h3>
        <Field label="Theme" anchorId="theme">
          <Seg2
            value={ui.theme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light',  label: 'Light' },
              { value: 'dark',   label: 'Dark' },
            ]}
            onChange={(v) => update({ theme: v as ThemeMode })}
          />
        </Field>
      </Card>

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">Sidebar</h3>
        <Field label="Sidebar edge" hint="Which screen edge the sidebar docks to." anchorId="sidebar-edge">
          <Seg2
            value={ui.sidebarEdge}
            options={[
              { value: 'left',  label: 'Left' },
              { value: 'right', label: 'Right' },
            ]}
            onChange={(v) => update({ sidebarEdge: v as SidebarEdge })}
          />
        </Field>
        <Field
          label="Sidebar mode"
          hint="Pinned reserves desktop work area. Floating auto-hides and reveals on hover."
          anchorId="sidebar-mode"
        >
          <Seg2
            value={ui.sidebarMode}
            options={[
              { value: 'pinned',   label: 'Pinned' },
              { value: 'floating', label: 'Floating' },
            ]}
            onChange={(v) => update({ sidebarMode: v as SidebarMode })}
          />
        </Field>
        <Field label="Sidebar width" anchorId="sidebar-width">
          <Slider
            ariaLabel="Sidebar width"
            value={ui.sidebarWidthPx}
            min={200}
            max={1200}
            step={10}
            suffix=" px"
            onChange={(sidebarWidthPx) => update({ sidebarWidthPx })}
          />
        </Field>
      </Card>

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">Hotkeys</h3>
        <Field
          label="Global hotkey"
          hint="Toggle the BorgDock window from anywhere on the desktop."
          anchorId="global-hotkey"
        >
          <HotkeyRecorder value={ui.globalHotkey} onChange={(globalHotkey) => update({ globalHotkey })} />
        </Field>
        <Field
          label="Flyout hotkey"
          hint="Toggles the tray flyout from anywhere. Default Ctrl+Win+Shift+F."
          anchorId="flyout-hotkey"
        >
          <HotkeyRecorder value={ui.flyoutHotkey} onChange={(flyoutHotkey) => update({ flyoutHotkey })} />
        </Field>
        <Field label="Quick review" hint="Open the focused PR in review mode." anchorId="quick-review-hotkey">
          <HotkeyRecorder
            value={ui.quickReviewHotkey}
            onChange={(quickReviewHotkey) => update({ quickReviewHotkey })}
          />
        </Field>
      </Card>

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">Terminal & startup</h3>
        <Field
          label="Windows Terminal profile"
          hint='Used by the "Claude" button in the checkout flow. Leave empty to auto-detect the default profile.'
          anchorId="wt-profile"
        >
          <TextInput
            ariaLabel="Windows Terminal profile"
            value={ui.windowsTerminalProfile ?? ''}
            onChange={(v) => update({ windowsTerminalProfile: v.trim() || undefined })}
            placeholder="Auto-detect"
          />
        </Field>
        <div id="field-run-at-startup">
          <ToggleRow
            label="Run at startup"
            hint="Launch BorgDock when you log in."
            on={ui.runAtStartup}
            onChange={async (runAtStartup) => {
              try {
                if (runAtStartup) await enableAutostart();
                else await disableAutostart();
              } catch (e) {
                console.error('autostart toggle failed', e);
              }
              update({ runAtStartup });
            }}
          />
        </div>
        <div id="field-start-minimized">
          <ToggleRow
            label="Start minimized to tray"
            hint="Skip the main window on launch."
            on={ui.startMinimizedToTray}
            onChange={(startMinimizedToTray) => update({ startMinimizedToTray })}
          />
        </div>
        <div id="field-restore-last-selection">
          <ToggleRow
            label="Restore last selection"
            hint="Re-open the PR you were viewing when BorgDock last closed."
            on={ui.restoreLastSelection}
            onChange={(restoreLastSelection) => update({ restoreLastSelection })}
            last
          />
        </div>
      </Card>
    </>
  );
}
