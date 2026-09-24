import { useSettingsStore } from '@/stores/settings-store';
import { type ActiveSection, useUiStore } from '@/stores/ui-store';

/**
 * The section the main window shows for `section`. The tab layout
 * (`ui.layoutV3` off) has no Worktrees tab, so a Worktrees section (saved
 * from the rail layout, or restored from disk) shows Focus there.
 */
export function visibleSection(section: ActiveSection, layoutV3: boolean): ActiveSection {
  return !layoutV3 && section === 'worktrees' ? 'focus' : section;
}

/** `activeSection` as the current layout shows it; see `visibleSection`. */
export function useVisibleSection(): ActiveSection {
  const section = useUiStore((s) => s.activeSection);
  const layoutV3 = useSettingsStore((s) => s.settings.ui.layoutV3 ?? false);
  return visibleSection(section, layoutV3);
}
