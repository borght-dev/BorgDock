import clsx from 'clsx';
import { useCallback, useMemo, useState } from 'react';
import { Button, Card, Seg2 } from '@/components/shared/primitives';
import { useSettingsStore } from '@/stores/settings-store';
import type { AppSettings, RepoSettings, ThemeMode } from '@/types';
import { AuthStep } from './AuthStep';
import { RepoStep } from './RepoStep';

/** Step labels under the progress track. */
const STEPS = ['Connect', 'Repositories', 'Look'] as const;

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

  // Appearance state
  const [theme, setTheme] = useState<ThemeMode>(settings.ui.theme);

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
      // Finish — save settings and let App.tsx transition to main UI
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
          theme,
        },
      };
      await saveSettings(updated);
    }
  }, [currentStep, isOnFinalStep, repos, settings, authMethod, pat, username, theme, saveSettings]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  return (
    // style: fixed fullscreen overlay — positioning; no Tailwind utility covers this combination
    <div
      className="fixed inset-0 flex items-center justify-center bg-[var(--color-background)]"
      data-wizard-overlay
    >
      <Card
        padding="lg"
        className="flex w-[580px] flex-col rounded-2xl overflow-hidden"
        style={{ maxHeight: '520px' }} // style: dynamic max-height constraint
      >
        {/* Progress: the fill slides to the current step (--motion-move). */}
        <div className="px-8 pt-2 pb-3" data-wizard-progress>
          <div
            className="bd-wizard-progress"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-valuenow={currentStep + 1}
          >
            <span
              className="bd-wizard-progress__fill"
              style={{ transform: `scaleX(${(currentStep + 1) / STEPS.length})` }}
            />
          </div>
          <ol className="bd-wizard-steps">
            {STEPS.map((label, i) => (
              <li
                key={label}
                className={clsx(
                  'bd-wizard-steps__item',
                  i === currentStep && 'bd-wizard-steps__item--active',
                  i < currentStep && 'bd-wizard-steps__item--done',
                )}
                aria-current={i === currentStep ? 'step' : undefined}
              >
                <span className="bd-dot bd-wizard-steps__dot" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ol>
        </div>

        {/* Content */}
        {/* Keyed by step so each step fades in as the last one goes (--motion-base). */}
        <div
          key={currentStep}
          className="bd-fade-in flex-1 overflow-y-auto px-8 py-4"
          data-wizard-step={currentStep}
        >
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
                  setAuthStatus(`Connected as ${detectedUser}`);
                } catch {
                  setIsAuthValid(false);
                  setAuthStatus(
                    "Couldn't connect. Check the token, or sign in with gh auth login.",
                  );
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
            <div className="flex flex-col gap-6" data-wizard-step="appearance">
              <div>
                <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                  Pick your look
                </h2>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                  You can change it any time in Settings.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Theme
                </span>
                <Seg2
                  ariaLabel="Theme"
                  value={theme}
                  options={[
                    { value: 'system', label: 'System' },
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                  onChange={(v) => setTheme(v as ThemeMode)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between border-t border-[var(--color-separator)] px-6 py-3">
          {currentStep > 0 ? (
            <Button variant="ghost" size="md" onClick={handleBack} data-wizard-action="back">
              Back
            </Button>
          ) : (
            <div />
          )}

          <Button
            variant="primary"
            size="md"
            onClick={handleNext}
            disabled={!canGoNext}
            data-wizard-action={isOnFinalStep ? 'finish' : 'next'}
          >
            {isOnFinalStep ? 'Finish' : 'Next'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
