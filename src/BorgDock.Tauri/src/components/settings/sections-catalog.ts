// src/components/settings/sections-catalog.ts
export type SettingsSectionId =
  | 'github' | 'repos' | 'ado' | 'sql'
  | 'appearance' | 'notif'
  | 'claude' | 'claude-api' | 'agent-overview'
  | 'updates' | 'maintenance';

export type SettingsGroupId = 'sources' | 'app' | 'ai' | 'system';

export interface SettingsSectionMeta {
  id: SettingsSectionId;
  label: string;
  group: SettingsGroupId;
}

export const SETTINGS_GROUPS: ReadonlyArray<{ id: SettingsGroupId; label: string }> = [
  { id: 'sources', label: 'Data sources' },
  { id: 'app',     label: 'Application' },
  { id: 'ai',      label: 'AI' },
  { id: 'system',  label: 'System' },
] as const;

export const SETTINGS_SECTIONS: ReadonlyArray<SettingsSectionMeta> = [
  { id: 'github',         label: 'GitHub',        group: 'sources' },
  { id: 'repos',          label: 'Repositories',  group: 'sources' },
  { id: 'ado',            label: 'Azure DevOps',  group: 'sources' },
  { id: 'sql',            label: 'SQL Server',    group: 'sources' },
  { id: 'appearance',     label: 'Appearance',    group: 'app' },
  { id: 'notif',          label: 'Notifications', group: 'app' },
  { id: 'claude',         label: 'Claude Code',   group: 'ai' },
  { id: 'claude-api',     label: 'Claude API',    group: 'ai' },
  { id: 'agent-overview', label: 'Agent Overview',group: 'ai' },
  { id: 'updates',        label: 'Updates',       group: 'system' },
  { id: 'maintenance',    label: 'Maintenance',   group: 'system' },
] as const;
