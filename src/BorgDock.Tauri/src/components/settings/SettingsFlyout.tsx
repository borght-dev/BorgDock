import clsx from 'clsx';
import FocusTrap from 'focus-trap-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { WorktreePruneDialog } from '@/components/worktree/WorktreePruneDialog';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { AppSettings } from '@/types';
import { AdoSection } from './AdoSection';
import { AppearanceSection } from './AppearanceSection';
import { ClaudeApiSection } from './ClaudeApiSection';
import { ClaudeSection } from './ClaudeSection';
import { GitHubSection } from './GitHubSection';
import { NotificationSection } from './NotificationSection';
import { RepoSection } from './RepoSection';
import { SqlSection } from './SqlSection';
import { UpdateSection } from './UpdateSection';

export function SettingsFlyout() {
  // Use field selectors — destructuring the whole store (`useSettingsStore()`)
  // forces a re-render on every unrelated store mutation, and combined with
  // the old settings-dependent `update` callback it tripped the "Maximum
  // update depth exceeded" loop.
  const settings = useSettingsStore((s) => s.settings);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const isSettingsOpen = useUiStore((s) => s.isSettingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const close = useCallback(() => setSettingsOpen(false), [setSettingsOpen]);
  const [isPruneOpen, setIsPruneOpen] = useState(false);

  // Ref-mirror of settings so the debounced save / close-flush can read the
  // latest value without the outer callbacks/effects depending on `settings`.
  // This keeps `update` stable across renders so child sections don't receive
  // fresh onChange props on every keystroke.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const save = useCallback(
    (next: AppSettings) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => saveSettings(next), 300);
    },
    [saveSettings],
  );

  // Flush pending save on close — read `settings` from the ref so the effect
  // doesn't re-fire on every keystroke.
  useEffect(() => {
    if (!isSettingsOpen && timerRef.current) {
      clearTimeout(timerRef.current);
      saveSettings(settingsRef.current);
      timerRef.current = undefined;
    }
  }, [isSettingsOpen, saveSettings]);

  const update = useCallback(
    (partial: Partial<AppSettings>) => {
      const next = { ...settingsRef.current, ...partial };
      useSettingsStore.getState().updateSettings(partial);
      save(next);
    },
    [save],
  );

  // Close on Escape
  useEffect(() => {
    if (!isSettingsOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsOpen, close]);

  if (!isSettingsOpen) return null;

  return (
    <FocusTrap focusTrapOptions={{ allowOutsideClick: true, escapeDeactivates: false }}>
      <div>
        {/* Overlay */}
        <div className="fixed inset-0 z-40 bg-[var(--color-overlay-bg)]" onClick={close} />

        {/* Flyout panel */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
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
              onClick={close}
            >
              &#10005;
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            <SectionCard title="GitHub">
              <GitHubSection github={settings.gitHub} onChange={(gitHub) => update({ gitHub })} />
            </SectionCard>

            <SectionCard title="Repositories">
              <RepoSection repos={settings.repos} onChange={(repos) => update({ repos })} />
            </SectionCard>

            <SectionCard title="Appearance">
              <AppearanceSection ui={settings.ui} onChange={(ui) => update({ ui })} />
            </SectionCard>

            <SectionCard title="Notifications">
              <NotificationSection
                notifications={settings.notifications}
                onChange={(notifications) => update({ notifications })}
              />
            </SectionCard>

            <SectionCard title="Claude Code">
              <ClaudeSection
                claudeCode={settings.claudeCode}
                onChange={(claudeCode) => update({ claudeCode })}
              />
            </SectionCard>

            <SectionCard title="Claude API (PR Summary)">
              <ClaudeApiSection
                claudeApi={settings.claudeApi}
                onChange={(claudeApi) => update({ claudeApi })}
              />
            </SectionCard>

            <SectionCard title="Azure DevOps">
              <AdoSection
                azureDevOps={settings.azureDevOps}
                onChange={(azureDevOps) => update({ azureDevOps })}
              />
            </SectionCard>

            <SectionCard title="SQL Server">
              <SqlSection sql={settings.sql} onChange={(sql) => update({ sql })} />
            </SectionCard>

            <SectionCard title="Updates">
              <UpdateSection
                updates={settings.updates}
                onChange={(updates) => update({ updates })}
              />
            </SectionCard>

            {/* Maintenance */}
            <SectionCard title="Maintenance">
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setIsPruneOpen(true)}
                  className="w-full rounded-md border border-[var(--color-subtle-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  Prune Worktrees
                </button>
                <button
                  onClick={() => useOnboardingStore.getState().resetAll()}
                  className="w-full rounded-md border border-[var(--color-subtle-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  Reset Onboarding
                </button>
              </div>
            </SectionCard>
          </div>
        </div>

        {/* Worktree Prune Dialog */}
        <WorktreePruneDialog isOpen={isPruneOpen} onClose={() => setIsPruneOpen(false)} />
      </div>
    </FocusTrap>
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
