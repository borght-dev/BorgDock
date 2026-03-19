import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';
import { WorktreePruneDialog } from '@/components/worktree/WorktreePruneDialog';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { AppSettings } from '@/types';
import { AdoSection } from './AdoSection';
import { AppearanceSection } from './AppearanceSection';
import { ClaudeSection } from './ClaudeSection';
import { GitHubSection } from './GitHubSection';
import { NotificationSection } from './NotificationSection';
import { RepoSection } from './RepoSection';
import { UpdateSection } from './UpdateSection';

export function SettingsFlyout() {
  const { settings, saveSettings } = useSettingsStore();
  const isSettingsOpen = useUiStore((s) => s.isSettingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const closeSettings = useCallback(() => setSettingsOpen(false), [setSettingsOpen]);
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isPruneOpen, setIsPruneOpen] = useState(false);

  useEffect(() => {
    if (isSettingsOpen) setDraft(settings);
  }, [isSettingsOpen, settings]);

  const updateDraft = useCallback(
    (partial: Partial<AppSettings>) => setDraft((prev) => ({ ...prev, ...partial })),
    [],
  );

  const validate = useCallback((d: AppSettings): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (d.gitHub.authMethod === 'pat' && !d.gitHub.personalAccessToken) {
      errors.pat = 'PAT is required when using Personal Access Token auth.';
    }
    if (
      d.gitHub.personalAccessToken &&
      !d.gitHub.personalAccessToken.startsWith('ghp_') &&
      !d.gitHub.personalAccessToken.startsWith('github_pat_')
    ) {
      errors.patFormat = 'PAT should start with ghp_ or github_pat_';
    }
    if (d.gitHub.pollIntervalSeconds < 15 || d.gitHub.pollIntervalSeconds > 300) {
      errors.pollInterval = 'Poll interval must be between 15 and 300 seconds.';
    }
    if (d.ui.sidebarWidthPx < 200 || d.ui.sidebarWidthPx > 1200) {
      errors.sidebarWidth = 'Sidebar width must be between 200 and 1200 pixels.';
    }
    return errors;
  }, []);

  const handleSave = useCallback(async () => {
    const errors = validate(draft);
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) return;
    await saveSettings(draft);
    closeSettings();
  }, [draft, saveSettings, closeSettings, validate]);

  const handleCancel = useCallback(() => {
    setDraft(settings);
    setValidationErrors({});
    closeSettings();
  }, [settings, closeSettings]);

  if (!isSettingsOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-[var(--color-overlay-bg)]" onClick={handleCancel} />

      {/* Flyout panel */}
      <div
        className={clsx(
          'fixed right-0 top-0 z-50 flex h-full w-[360px] flex-col',
          'bg-[var(--color-modal-bg)] border-l border-[var(--color-modal-border)]',
          'shadow-xl',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-separator)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">Settings</span>
          <button
            className="rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-icon-btn-hover)] transition-colors"
            onClick={handleCancel}
          >
            &#10005;
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          <SectionCard title="GitHub">
            <GitHubSection github={draft.gitHub} onChange={(gitHub) => updateDraft({ gitHub })} />
            {validationErrors.pat && (
              <p className="mt-1 text-[10px] text-[var(--color-status-red)]">
                {validationErrors.pat}
              </p>
            )}
            {validationErrors.patFormat && (
              <p className="mt-1 text-[10px] text-[var(--color-status-yellow)]">
                {validationErrors.patFormat}
              </p>
            )}
            {validationErrors.pollInterval && (
              <p className="mt-1 text-[10px] text-[var(--color-status-red)]">
                {validationErrors.pollInterval}
              </p>
            )}
          </SectionCard>

          <SectionCard title="Repositories">
            <RepoSection repos={draft.repos} onChange={(repos) => updateDraft({ repos })} />
          </SectionCard>

          <SectionCard title="Appearance">
            <AppearanceSection ui={draft.ui} onChange={(ui) => updateDraft({ ui })} />
            {validationErrors.sidebarWidth && (
              <p className="mt-1 text-[10px] text-[var(--color-status-red)]">
                {validationErrors.sidebarWidth}
              </p>
            )}
          </SectionCard>

          <SectionCard title="Notifications">
            <NotificationSection
              notifications={draft.notifications}
              onChange={(notifications) => updateDraft({ notifications })}
            />
          </SectionCard>

          <SectionCard title="Claude Code">
            <ClaudeSection
              claudeCode={draft.claudeCode}
              onChange={(claudeCode) => updateDraft({ claudeCode })}
            />
          </SectionCard>

          <SectionCard title="Azure DevOps">
            <AdoSection
              azureDevOps={draft.azureDevOps}
              onChange={(azureDevOps) => updateDraft({ azureDevOps })}
            />
          </SectionCard>

          <SectionCard title="Updates">
            <UpdateSection
              updates={draft.updates}
              onChange={(updates) => updateDraft({ updates })}
            />
          </SectionCard>

          {/* Maintenance */}
          <SectionCard title="Maintenance">
            <button
              onClick={() => setIsPruneOpen(true)}
              className="w-full rounded-md border border-[var(--color-subtle-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
            >
              Prune Worktrees
            </button>
          </SectionCard>
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--color-separator)] px-4 py-3">
          <div className="flex justify-end gap-2">
            <button
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)] transition-colors"
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--color-accent-foreground)] bg-[var(--color-accent)] hover:opacity-90 transition-opacity"
              onClick={handleSave}
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Worktree Prune Dialog */}
      <WorktreePruneDialog isOpen={isPruneOpen} onClose={() => setIsPruneOpen(false)} />
    </>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] bg-[var(--color-surface-raised)] border border-[var(--color-subtle-border)] px-3.5 py-3">
      <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
        {title}
      </h3>
      {children}
    </div>
  );
}
