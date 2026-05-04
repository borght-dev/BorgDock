// src/components/settings/settings-search-index.ts
import type { SettingsSectionId } from './sections-catalog';

export interface FieldEntry {
  sectionId: SettingsSectionId;
  anchorId: string;
  label: string;
  hint?: string;
  keywords?: ReadonlyArray<string>;
}

export const SETTINGS_FIELDS: ReadonlyArray<FieldEntry> = [
  // GitHub
  { sectionId: 'github', anchorId: 'auth-method',  label: 'Auth method', keywords: ['gh', 'cli', 'pat', 'token'] },
  { sectionId: 'github', anchorId: 'username',     label: 'Username' },
  { sectionId: 'github', anchorId: 'poll-interval',label: 'Poll interval', keywords: ['frequency', 'refresh'] },
  { sectionId: 'github', anchorId: 'rate-limit',   label: 'Rate limit',   keywords: ['quota'] },

  // Repositories
  { sectionId: 'repos', anchorId: 'tracked-repositories', label: 'Tracked repositories' },
  { sectionId: 'repos', anchorId: 'local-folder',         label: 'Local folder' },
  { sectionId: 'repos', anchorId: 'scan-folder',          label: 'Scan parent folder', keywords: ['discover'] },

  // Azure DevOps
  { sectionId: 'ado', anchorId: 'organization', label: 'Organization' },
  { sectionId: 'ado', anchorId: 'project',      label: 'Project' },
  { sectionId: 'ado', anchorId: 'auth-method',  label: 'Auth method', keywords: ['az', 'cli', 'pat'] },
  { sectionId: 'ado', anchorId: 'poll-interval',label: 'Poll interval' },
  { sectionId: 'ado', anchorId: 'match-by',     label: 'Match by',    keywords: ['link', 'work item', 'wi'] },

  // SQL
  { sectionId: 'sql', anchorId: 'connections',         label: 'Connections' },
  { sectionId: 'sql', anchorId: 'default-connection',  label: 'Default connection' },
  { sectionId: 'sql', anchorId: 'read-only-default',   label: 'Read-only by default' },
  { sectionId: 'sql', anchorId: 'confirm-destructive', label: 'Confirm DELETE / UPDATE without WHERE' },

  // Appearance
  { sectionId: 'appearance', anchorId: 'theme',         label: 'Theme' },
  { sectionId: 'appearance', anchorId: 'sidebar-edge',  label: 'Sidebar edge' },
  { sectionId: 'appearance', anchorId: 'sidebar-mode',  label: 'Sidebar mode' },
  { sectionId: 'appearance', anchorId: 'sidebar-width', label: 'Sidebar width' },
  { sectionId: 'appearance', anchorId: 'global-hotkey', label: 'Global hotkey', keywords: ['shortcut'] },
  { sectionId: 'appearance', anchorId: 'flyout-hotkey', label: 'Flyout hotkey' },
  { sectionId: 'appearance', anchorId: 'quick-review-hotkey', label: 'Quick review hotkey' },
  { sectionId: 'appearance', anchorId: 'wt-profile',    label: 'Windows Terminal profile' },
  { sectionId: 'appearance', anchorId: 'run-at-startup',label: 'Run at startup' },
  { sectionId: 'appearance', anchorId: 'start-minimized',label: 'Start minimized to tray' },
  { sectionId: 'appearance', anchorId: 'restore-last-selection', label: 'Restore last selection' },

  // Notifications
  { sectionId: 'notif', anchorId: 'check-status',         label: 'Check status changes' },
  { sectionId: 'notif', anchorId: 'new-pull-requests',    label: 'New pull requests' },
  { sectionId: 'notif', anchorId: 'review-updates',       label: 'Review updates' },
  { sectionId: 'notif', anchorId: 'pr-mergeable',         label: 'PR becomes mergeable' },
  { sectionId: 'notif', anchorId: 'sound-on-merge',       label: 'Play sound on merge' },
  { sectionId: 'notif', anchorId: 'only-my-prs',          label: 'Only notify for my PRs' },
  { sectionId: 'notif', anchorId: 'nudge-pending',        label: 'Nudge for pending reviews' },
  { sectionId: 'notif', anchorId: 'remind-every',         label: 'Remind every' },
  { sectionId: 'notif', anchorId: 'escalate',             label: 'Escalate urgency over time' },
  { sectionId: 'notif', anchorId: 'channels',             label: 'Channels' },

  // Claude Code
  { sectionId: 'claude', anchorId: 'post-fix-action', label: 'Post-fix action' },
  { sectionId: 'claude', anchorId: 'claude-code-path',label: 'Claude Code path' },
  { sectionId: 'claude', anchorId: 'default-model',   label: 'Default model' },

  // Claude API
  { sectionId: 'claude-api', anchorId: 'api-key',     label: 'API key' },
  { sectionId: 'claude-api', anchorId: 'model',       label: 'Model' },
  { sectionId: 'claude-api', anchorId: 'max-tokens',  label: 'Max tokens' },
  { sectionId: 'claude-api', anchorId: 'pr-summary',  label: 'PR summary card' },
  { sectionId: 'claude-api', anchorId: 'diff-explain',label: 'Diff explanations' },
  { sectionId: 'claude-api', anchorId: 'review-nudge-phrasing', label: 'Review nudge phrasing' },
  { sectionId: 'claude-api', anchorId: 'commit-msg',  label: 'Commit message suggestions' },

  // Agent Overview
  { sectionId: 'agent-overview', anchorId: 'enable-telemetry', label: 'Enable telemetry collection' },
  { sectionId: 'agent-overview', anchorId: 'open-on-startup',  label: 'Open on BorgDock startup' },
  { sectionId: 'agent-overview', anchorId: 'auto-archive',     label: 'Auto-archive completed sessions after 24h' },

  // Updates
  { sectionId: 'updates', anchorId: 'auto-check',     label: 'Auto-check for updates' },
  { sectionId: 'updates', anchorId: 'auto-download',  label: 'Auto-download updates' },
  { sectionId: 'updates', anchorId: 'check-now',      label: 'Check now' },
  { sectionId: 'updates', anchorId: 'recent-releases',label: 'Recent releases' },

  // Maintenance
  { sectionId: 'maintenance', anchorId: 'prune-worktrees', label: 'Prune worktrees' },
  { sectionId: 'maintenance', anchorId: 'reset-onboarding',label: 'Reset onboarding' },
  { sectionId: 'maintenance', anchorId: 'clear-cache',     label: 'Clear cache' },
  { sectionId: 'maintenance', anchorId: 'reset-everything',label: 'Reset all settings' },
  { sectionId: 'maintenance', anchorId: 'diagnostics',     label: 'Diagnostics' },
];
