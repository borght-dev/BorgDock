import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useMemo, useRef, useState } from 'react';
import { WindowTitleBar } from '@/components/shared/WindowTitleBar';
import { useSettingsStore } from '@/stores/settings-store';
import type { AppSettings } from '@/types/settings';
import { AdoSection } from './AdoSection';
import { AgentSection } from './AgentSection';
import { AppearanceSection } from './AppearanceSection';
// Existing section components — bodies are rewritten in later tasks.
import { GitHubSection } from './GitHubSection';
import { MaintenanceSection } from './MaintenanceSection';
import { NotificationSection } from './NotificationSection';
import { RailSearchInput } from './RailSearchInput';
import { RailSearchResults } from './RailSearchResults';
import { RailSectionList } from './RailSectionList';
import { RepoSection } from './RepoSection';
import { SqlSection } from './SqlSection';
import { SETTINGS_SECTIONS, type SettingsSectionId } from './sections-catalog';
import { UpdateSection } from './UpdateSection';
import { PulseProvider } from './useFieldPulse';

const STORAGE_KEY = 'settings.lastSection';

function readInitialSection(): SettingsSectionId {
  const fromHash = location.hash.match(/section=([\w-]+)/)?.[1];
  if (fromHash && SETTINGS_SECTIONS.some((s) => s.id === fromHash)) {
    return fromHash as SettingsSectionId;
  }
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && SETTINGS_SECTIONS.some((s) => s.id === saved)) {
    return saved as SettingsSectionId;
  }
  return 'github';
}

export function SettingsApp() {
  const settings = useSettingsStore((s) => s.settings);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const hasLoaded = useSettingsStore((s) => s.hasLoaded);
  const [active, setActive] = useState<SettingsSectionId>(readInitialSection);
  const [search, setSearch] = useState('');
  const [pulseAnchor, setPulseAnchor] = useState<string | null>(null);

  // Each Tauri window has its own JS context + Zustand store. Hydrate from
  // disk on first mount so we don't render defaults over the user's actual
  // configuration. Idempotent — bails if already loaded.
  useEffect(() => {
    if (!hasLoaded) {
      void useSettingsStore.getState().loadSettings();
    }
  }, [hasLoaded]);

  // The Rust side builds the window invisible to avoid a flash of the
  // unstyled default chrome at the wrong size. Reveal it after settings
  // hydrate and the first frame paints, so the user only ever sees the
  // fully-rendered UI.
  const revealedRef = useRef(false);
  useEffect(() => {
    if (revealedRef.current || !hasLoaded) return;
    revealedRef.current = true;
    requestAnimationFrame(() => {
      void invoke('window_ready').catch(() => {});
    });
  }, [hasLoaded]);

  // Ref-mirror of settings so the debounced save can read latest without
  // re-creating the `update` callback on every keystroke.
  const settingsRef = useRef<AppSettings>(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Persist active section + update hash
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, active);
    history.replaceState(null, '', `#section=${active}`);
  }, [active]);

  // Deep-link from Rust (open_settings_window emits this when a window
  // already exists and a `section` argument was passed)
  useEffect(() => {
    const unlistenP = listen<string>('settings:deep-link', (e) => {
      if (SETTINGS_SECTIONS.some((s) => s.id === e.payload)) {
        setActive(e.payload as SettingsSectionId);
      }
    });
    return () => {
      unlistenP.then((un) => un());
    };
  }, []);

  // Debounced save + flush on window close
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    function flush() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        saveSettings(settingsRef.current);
        timerRef.current = undefined;
      }
    }
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [saveSettings]);

  const update = (partial: Partial<AppSettings>) => {
    const next = { ...settingsRef.current, ...partial };
    useSettingsStore.getState().updateSettings(partial);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => saveSettings(next), 300);
  };

  // `update` is intentionally excluded from deps below — it's recreated
  // every render but reads from `settingsRef.current`, so depending on it
  // would re-fire the memo on every keystroke. Memo only needs to refresh
  // when the active section or its slice of `settings` changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  const sectionContent = useMemo(() => {
    switch (active) {
      case 'github':
        return <GitHubSection github={settings.gitHub} onChange={(gitHub) => update({ gitHub })} />;
      case 'repos':
        return (
          <RepoSection
            repos={settings.repos}
            onChange={(repos) => update({ repos })}
            remoteWorktreeRepos={settings.remoteWorktreeRepos ?? []}
            onRemoteWorktreeReposChange={(remoteWorktreeRepos) => update({ remoteWorktreeRepos })}
          />
        );
      case 'ado':
        return (
          <AdoSection
            azureDevOps={settings.azureDevOps}
            onChange={(azureDevOps) => update({ azureDevOps })}
          />
        );
      case 'sql':
        return <SqlSection sql={settings.sql} onChange={(sql) => update({ sql })} />;
      case 'appearance':
        return <AppearanceSection ui={settings.ui} onChange={(ui) => update({ ui })} />;
      case 'notif':
        return (
          <NotificationSection
            notifications={settings.notifications}
            onChange={(notifications) => update({ notifications })}
          />
        );
      case 'agents':
        return (
          <AgentSection
            agents={
              settings.agents ?? {
                defaultProvider: 'claude',
                defaultPostFixAction: 'commitAndNotify',
                t3Model: 'claude-fable-5',
                t3ModelInstance: 'claudeAgent',
              }
            }
            summaries={settings.summaries ?? { enabled: true, provider: 'claude', model: 'sonnet' }}
            onAgentsChange={(agents) => update({ agents })}
            onSummariesChange={(summaries) => update({ summaries })}
          />
        );
      case 'updates':
        return (
          <UpdateSection updates={settings.updates} onChange={(updates) => update({ updates })} />
        );
      case 'maintenance':
        return <MaintenanceSection />;
    }
  }, [active, settings]);

  const breadcrumb = SETTINGS_SECTIONS.find((s) => s.id === active)?.label ?? '';

  return (
    <PulseProvider value={{ pulseAnchor, setPulseAnchor }}>
      {/* `data-app-ready` flips on once the settings store finishes its first
        load. Playwright waits on this before driving the window. */}
      <div
        className="flex h-screen flex-col bg-[var(--color-background)] text-[var(--color-text-primary)]"
        data-app-ready={hasLoaded ? 'true' : undefined}
      >
        <WindowTitleBar
          title="BorgDock"
          meta={
            <span className="ml-2 flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
              <span className="text-[var(--color-text-faint)]">›</span>
              <span className="font-medium text-[var(--color-text-secondary)]">Settings</span>
              <span className="text-[var(--color-text-faint)]">›</span>
              <span>{breadcrumb}</span>
            </span>
          }
        />
        <div className="grid flex-1 min-h-0" style={{ gridTemplateColumns: '232px 1fr' }}>
          <aside
            className="flex flex-col border-r border-[var(--color-subtle-border)]"
            style={{
              background:
                'linear-gradient(180deg, var(--color-sidebar-gradient-top), var(--color-sidebar-gradient-bottom))',
            }}
          >
            <div className="px-3.5 pb-2.5 pt-3.5">
              <RailSearchInput value={search} onChange={setSearch} />
            </div>
            <div className="flex-1 overflow-auto px-2 pb-3.5 pt-1">
              {search.trim() ? (
                <RailSearchResults
                  query={search}
                  onSelect={({ sectionId, anchorId }) => {
                    setActive(sectionId);
                    setSearch('');
                    // Wait one paint so the new section mounts before we try to scroll.
                    requestAnimationFrame(() => setPulseAnchor(anchorId));
                  }}
                />
              ) : (
                <RailSectionList active={active} onSelect={setActive} />
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-[var(--color-subtle-border)] px-3.5 py-2.5 text-[10.5px] text-[var(--color-text-muted)]">
              <span className="ml-auto font-mono">v{__BORGDOCK_VERSION__}</span>
            </div>
          </aside>
          <main className="overflow-auto bg-[var(--color-background)]">
            <div className="mx-auto max-w-[720px] px-9 pb-16 pt-7">{sectionContent}</div>
          </main>
        </div>
      </div>
    </PulseProvider>
  );
}
