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
import type { FocusLayout, PrDensity, ThemeMode, UiSettings } from '@/types/settings';
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
        subtitle="How BorgDock looks and moves, plus hotkeys and startup."
      />

      {/* One panel for everything visual: theme and motion first, then the
          layout choices. Hints stay to one short line. */}
      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Look and layout
        </h3>
        <Field label="Theme" hint="System follows your Windows setting." anchorId="theme">
          <Seg2
            ariaLabel="Theme"
            value={ui.theme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(v) => update({ theme: v as ThemeMode })}
          />
        </Field>
        <div id="field-reduce-motion" className="mb-[18px]">
          <ToggleRow
            label="Reduce motion"
            hint="Views, filters and lists switch instantly. Your system setting counts too."
            on={ui.reduceMotion ?? false}
            onChange={(reduceMotion) => update({ reduceMotion })}
            last
          />
        </div>
        <Field
          label="Focus layout"
          hint="A ranked list, or a board in four columns."
          anchorId="focus-layout"
        >
          <Seg2
            ariaLabel="Focus layout"
            value={ui.focusLayout ?? 'list'}
            options={[
              { value: 'list', label: 'List' },
              { value: 'board', label: 'Board' },
            ]}
            onChange={(v) => update({ focusLayout: v as FocusLayout })}
          />
        </Field>
        <Field
          label="Pull request density"
          hint="Compact fits twice as many pull requests on screen."
          anchorId="pr-density"
        >
          <Seg2
            ariaLabel="Pull request density"
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
          hint="Pull requests with no update for this long move to Stale."
          anchorId="stale-after-days"
          dense
        >
          <StaleDaysField
            value={staleAfterDaysOf(ui.staleAfterDays)}
            onChange={(staleAfterDays) => update({ staleAfterDays })}
          />
        </Field>
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
