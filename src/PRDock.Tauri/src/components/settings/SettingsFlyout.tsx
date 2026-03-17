import { useState, useCallback, useEffect } from 'react';
import clsx from 'clsx';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { GitHubSection } from './GitHubSection';
import { RepoSection } from './RepoSection';
import { AppearanceSection } from './AppearanceSection';
import { NotificationSection } from './NotificationSection';
import { ClaudeSection } from './ClaudeSection';
import { AdoSection } from './AdoSection';
import { UpdateSection } from './UpdateSection';
import type { AppSettings } from '@/types';

export function SettingsFlyout() {
  const { settings, saveSettings } = useSettingsStore();
  const isSettingsOpen = useUiStore((s) => s.isSettingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const closeSettings = () => setSettingsOpen(false);
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (isSettingsOpen) setDraft(settings);
  }, [isSettingsOpen, settings]);

  const updateDraft = useCallback(
    (partial: Partial<AppSettings>) => setDraft((prev) => ({ ...prev, ...partial })),
    []
  );

  const handleSave = useCallback(async () => {
    setValidationError('');
    if (draft.gitHub.authMethod === 'pat' && !draft.gitHub.personalAccessToken) {
      setValidationError('PAT is required when using Personal Access Token auth.');
      return;
    }
    await saveSettings(draft);
    closeSettings();
  }, [draft, saveSettings, closeSettings]);

  const handleCancel = useCallback(() => {
    setDraft(settings);
    closeSettings();
  }, [settings, closeSettings]);

  if (!isSettingsOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-[var(--color-overlay-bg)]"
        onClick={handleCancel}
      />

      {/* Flyout panel */}
      <div
        className={clsx(
          'fixed right-0 top-0 z-50 flex h-full w-[360px] flex-col',
          'bg-[var(--color-modal-bg)] border-l border-[var(--color-modal-border)]',
          'shadow-xl'
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
            <GitHubSection
              github={draft.gitHub}
              onChange={(gitHub) => updateDraft({ gitHub })}
            />
          </SectionCard>

          <SectionCard title="Repositories">
            <RepoSection
              repos={draft.repos}
              onChange={(repos) => updateDraft({ repos })}
            />
          </SectionCard>

          <SectionCard title="Appearance">
            <AppearanceSection
              ui={draft.ui}
              onChange={(ui) => updateDraft({ ui })}
            />
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
            <UpdateSection updates={draft.updates} onChange={(updates) => updateDraft({ updates })} />
          </SectionCard>
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--color-separator)] px-4 py-3">
          {validationError && (
            <p className="mb-2 text-[11px] text-[var(--color-status-red)]">{validationError}</p>
          )}
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
