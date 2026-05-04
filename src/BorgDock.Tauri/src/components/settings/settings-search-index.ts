// src/components/settings/settings-search-index.ts
import type { SettingsSectionId } from './sections-catalog';

export interface FieldEntry {
  sectionId: SettingsSectionId;
  anchorId: string;
  label: string;
  hint?: string;
  keywords?: ReadonlyArray<string>;
}

// Populated in Task 15.
export const SETTINGS_FIELDS: ReadonlyArray<FieldEntry> = [];
