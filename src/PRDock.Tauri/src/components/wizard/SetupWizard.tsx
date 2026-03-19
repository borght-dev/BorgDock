import clsx from 'clsx';
import { useCallback, useMemo, useState } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import type { AppSettings, RepoSettings, SidebarEdge } from '@/types';
import { AuthStep } from './AuthStep';
import { DoneStep } from './DoneStep';
import { PositionStep } from './PositionStep';
import { RepoStep } from './RepoStep';

const STEPS = ['Auth', 'Repos', 'Position', 'Done'] as const;

interface DiscoveredRepo {
  owner: string;
  name: string;
  localPath: string;
  isSelected: boolean;
  worktreeSubfolder: string;
}

export function SetupWizard() {
  const { settings, saveSettings } = useSettingsStore();
  const [currentStep, setCurrentStep] = useState(0);

  // Auth state
  const [authMethod, setAuthMethod] = useState<'ghCli' | 'pat'>(settings.gitHub.authMethod);
  const [pat, setPat] = useState(settings.gitHub.personalAccessToken ?? '');
  const [isAuthValid, setIsAuthValid] = useState(false);
  const [authStatus, setAuthStatus] = useState('');
  const [username, setUsername] = useState(settings.gitHub.username);

  // Repo state
  const [repos, setRepos] = useState<DiscoveredRepo[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  // Position state
  const [sidebarEdge, setSidebarEdge] = useState<SidebarEdge>(settings.ui.sidebarEdge);
  const [theme, setTheme] = useState(settings.ui.theme);

  const canGoNext = useMemo(() => {
    switch (currentStep) {
      case 0:
        return isAuthValid || (authMethod === 'pat' && pat.trim().length > 0);
      case 1:
        return repos.some((r) => r.isSelected);
      case 2:
        return true;
      default:
        return false;
    }
  }, [currentStep, isAuthValid, authMethod, pat, repos]);

  const isOnFinalStep = currentStep === 2;

  const handleNext = useCallback(async () => {
    if (currentStep === 0) {
      setCurrentStep(1);
      // Trigger repo discovery
      setIsScanning(true);
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const discovered = await invoke<DiscoveredRepo[]>('discover_repos');
        setRepos(
          discovered.map((r) => ({ ...r, isSelected: true, worktreeSubfolder: '.worktrees' })),
        );
      } catch {
        setRepos([]);
      } finally {
        setIsScanning(false);
      }
    } else if (currentStep === 1) {
      setCurrentStep(2);
    } else if (isOnFinalStep) {
      // Finish
      const selectedRepos: RepoSettings[] = repos
        .filter((r) => r.isSelected)
        .map((r) => ({
          owner: r.owner,
          name: r.name,
          enabled: true,
          worktreeBasePath: r.localPath,
          worktreeSubfolder: r.worktreeSubfolder,
        }));

      const updated: AppSettings = {
        ...settings,
        setupComplete: true,
        gitHub: {
          ...settings.gitHub,
          authMethod,
          personalAccessToken: authMethod === 'pat' ? pat : undefined,
          username,
        },
        repos: selectedRepos,
        ui: {
          ...settings.ui,
          sidebarEdge,
          theme,
        },
      };
      await saveSettings(updated);
      setCurrentStep(3);
    }
  }, [
    currentStep,
    isOnFinalStep,
    repos,
    settings,
    authMethod,
    pat,
    username,
    sidebarEdge,
    theme,
    saveSettings,
  ]);

  const handleBack = useCallback(() => {
    if (currentStep > 0 && currentStep < 3) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--color-background)]">
      <div
        className="flex w-[580px] flex-col rounded-2xl bg-[var(--color-modal-bg)] border border-[var(--color-modal-border)] shadow-2xl overflow-hidden"
        style={{ maxHeight: '520px' }}
      >
        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 px-6 py-4">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={clsx(
                  'rounded-full transition-all',
                  i === currentStep && 'h-5 w-5 bg-[var(--color-wizard-step-active)]',
                  i < currentStep && 'h-2 w-2 bg-[var(--color-wizard-step-complete)]',
                  i > currentStep && 'h-2 w-2 bg-[var(--color-wizard-step-inactive)]',
                )}
              />
              {i < STEPS.length - 1 && (
                <div
                  className={clsx(
                    'h-px w-8',
                    i < currentStep
                      ? 'bg-[var(--color-wizard-step-complete)]'
                      : 'bg-[var(--color-wizard-step-track)]',
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-4">
          {currentStep === 0 && (
            <AuthStep
              authMethod={authMethod}
              pat={pat}
              isAuthValid={isAuthValid}
              authStatus={authStatus}
              username={username}
              onAuthMethodChange={setAuthMethod}
              onPatChange={setPat}
              onValidateAuth={async () => {
                setAuthStatus('Checking...');
                try {
                  const { invoke } = await import('@tauri-apps/api/core');
                  const detectedUser = await invoke<string>('check_github_auth', {
                    method: authMethod,
                    pat: authMethod === 'pat' ? pat : undefined,
                  });
                  setUsername(detectedUser);
                  setIsAuthValid(true);
                  setAuthStatus(`Authenticated as ${detectedUser}`);
                } catch {
                  setIsAuthValid(false);
                  setAuthStatus('Authentication failed');
                }
              }}
              onUsernameChange={setUsername}
            />
          )}
          {currentStep === 1 && (
            <RepoStep
              repos={repos}
              isScanning={isScanning}
              onToggleRepo={(index) =>
                setRepos((prev) =>
                  prev.map((r, i) => (i === index ? { ...r, isSelected: !r.isSelected } : r)),
                )
              }
              onSelectAll={() => setRepos((prev) => prev.map((r) => ({ ...r, isSelected: true })))}
              onDeselectAll={() =>
                setRepos((prev) => prev.map((r) => ({ ...r, isSelected: false })))
              }
              onAddRepo={(repo) =>
                setRepos((prev) => [{ ...repo, worktreeSubfolder: '.worktrees' }, ...prev])
              }
            />
          )}
          {currentStep === 2 && (
            <PositionStep
              sidebarEdge={sidebarEdge}
              theme={theme}
              onEdgeChange={setSidebarEdge}
              onThemeChange={setTheme}
            />
          )}
          {currentStep === 3 && <DoneStep />}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between border-t border-[var(--color-separator)] px-6 py-3">
          {currentStep > 0 && currentStep < 3 ? (
            <button
              className="rounded-lg px-4 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)] transition-colors"
              onClick={handleBack}
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {currentStep < 3 && (
            <button
              className="rounded-lg px-4 py-1.5 text-xs font-medium text-[var(--color-accent-foreground)] bg-[var(--color-accent)] hover:opacity-90 transition-opacity disabled:opacity-40"
              onClick={handleNext}
              disabled={!canGoNext}
            >
              {isOnFinalStep ? 'Finish' : 'Next'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
