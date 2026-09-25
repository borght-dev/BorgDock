import {
  disable as disableAutostart,
  enable as enableAutostart,
} from '@tauri-apps/plugin-autostart';
import { useState } from 'react';
import {
  Card,
  Field,
  SectionHeader,
  Seg2,
  TextInput,
  ToggleRow,
} from '@/components/shared/primitives';
import { STALE_AFTER_DAYS_MAX, staleAfterDaysOf } from '@/services/focus-bucket';
import type { PrDensity, ThemeMode, UiSettings } from '@/types/settings';
import { HotkeyRecorder } from './HotkeyRecorder';

interface Props {
  ui: UiSettings;
  onChange: (u: UiSettings) => void;
}

/**
 * Days without an update before an open PR counts as stale, 1 to
 * `STALE_AFTER_DAYS_MAX`. A whole number in range saves as it is typed; on
 * blur anything else is clamped into range (or put back when it is not a
 * number), so the field never keeps a value that was not saved.
 */
function StaleDaysField({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  // The saved value last seen: a new one (saved here or elsewhere) replaces the draft.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(String(value));
  }
  return (
    <TextInput
      type="number"
      ariaLabel="Stale after days"
      value={draft}
      min={1}
      max={STALE_AFTER_DAYS_MAX}
      suffix="days"
      onChange={(next) => {
        setDraft(next);
        const days = Number(next);
        if (Number.isInteger(days) && days >= 1 && days <= STALE_AFTER_DAYS_MAX) {
          onChange(days);
        }
      }}
      onBlur={() => {
        const typed = Number(draft);
        const days =
          draft.trim() === '' || !Number.isFinite(typed)
            ? value
            : Math.min(STALE_AFTER_DAYS_MAX, Math.max(1, Math.round(typed)));
        setDraft(String(days));
        if (days !== value) {
          onChange(days);
        }
      }}
    />
  );
}

export function AppearanceSection({ ui, onChange }: Props) {
  const update = (partial: Partial<UiSettings>) => onChange({ ...ui, ...partial });

  return (
    <>
      <SectionHeader
        title="Appearance"
        subtitle="Theme, hotkeys and the always-on-top tray flyout."
      />

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Theme & layout
        </h3>
        <Field label="Theme" anchorId="theme">
          <Seg2
            value={ui.theme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(v) => update({ theme: v as ThemeMode })}
          />
        </Field>
        <Field
          label="Pull request density"
          hint="Comfortable shows two-line rows. Compact fits a single-line table with twice the PRs on screen."
          anchorId="pr-density"
        >
          <Seg2
            value={ui.prDensity ?? 'comfortable'}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
            onChange={(v) => update({ prDensity: v as PrDensity })}
          />
        </Field>
        <Field
          label="Stale after"
          hint="An open pull request with no update for this many days moves to Stale in Focus and is marked stale in the list."
          anchorId="stale-after-days"
        >
          <StaleDaysField
            value={staleAfterDaysOf(ui.staleAfterDays)}
            onChange={(staleAfterDays) => update({ staleAfterDays })}
          />
        </Field>
        <div id="field-reduce-motion">
          <ToggleRow
            label="Reduce motion"
            hint="Switch views, filters and lists instantly instead of animating them. BorgDock also follows the reduced-motion setting of your operating system."
            on={ui.reduceMotion ?? false}
            onChange={(reduceMotion) => update({ reduceMotion })}
          />
        </div>
        <div id="field-layout-v3">
          <ToggleRow
            label="New layout (preview)"
            hint="Switches to the Workbench layout as it lands. Off keeps the current one."
            on={ui.layoutV3 ?? false}
            onChange={(layoutV3) => update({ layoutV3 })}
            last
          />
        </div>
      </Card>

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Hotkeys
        </h3>
        <Field
          label="Global hotkey"
          hint="Toggle the BorgDock window from anywhere on the desktop."
          anchorId="global-hotkey"
        >
          <HotkeyRecorder
            value={ui.globalHotkey}
            onChange={(globalHotkey) => update({ globalHotkey })}
          />
        </Field>
        <Field
          label="Flyout hotkey"
          hint="Toggles the tray flyout from anywhere. Default Ctrl+Win+Shift+F."
          anchorId="flyout-hotkey"
        >
          <HotkeyRecorder
            value={ui.flyoutHotkey}
            onChange={(flyoutHotkey) => update({ flyoutHotkey })}
          />
        </Field>
        <Field
          label="Quick review"
          hint="Open the focused PR in review mode."
          anchorId="quick-review-hotkey"
        >
          <HotkeyRecorder
            value={ui.quickReviewHotkey}
            onChange={(quickReviewHotkey) => update({ quickReviewHotkey })}
          />
        </Field>
      </Card>

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Terminal & startup
        </h3>
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
