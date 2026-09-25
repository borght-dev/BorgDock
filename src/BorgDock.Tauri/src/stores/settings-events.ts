/**
 * Tauri event names around the settings. Kept apart from the settings store
 * so modules that only listen (src/utils/theme.ts) don't pull in zustand.
 */

/** Emitted with the saved `ui` slice whenever any window saves settings. */
export const SETTINGS_UI_CHANGED_EVENT = 'settings:ui-changed';
