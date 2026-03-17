import { useState } from 'react';
import clsx from 'clsx';

interface AuthStepProps {
  authMethod: 'ghCli' | 'pat';
  pat: string;
  isAuthValid: boolean;
  authStatus: string;
  username: string;
  onAuthMethodChange: (method: 'ghCli' | 'pat') => void;
  onPatChange: (pat: string) => void;
  onValidateAuth: () => void;
  onUsernameChange: (username: string) => void;
}

export function AuthStep({
  authMethod,
  pat,
  isAuthValid,
  authStatus,
  onAuthMethodChange,
  onPatChange,
  onValidateAuth,
}: AuthStepProps) {
  const [showToken, setShowToken] = useState(false);

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Connect to GitHub
        </h2>
        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
          Choose how PRDock authenticates with GitHub
        </p>
      </div>

      {/* Auth status indicator */}
      {authStatus && (
        <div
          className={clsx(
            'flex items-center gap-2 rounded-lg border px-4 py-2 text-xs w-full max-w-sm',
            isAuthValid
              ? 'border-[var(--color-success-badge-border)] bg-[var(--color-success-badge-bg)] text-[var(--color-status-green)]'
              : authStatus === 'Checking...'
                ? 'border-[var(--color-warning-badge-border)] bg-[var(--color-warning-badge-bg)] text-[var(--color-status-yellow)]'
                : 'border-[var(--color-error-badge-border)] bg-[var(--color-error-badge-bg)] text-[var(--color-status-red)]'
          )}
        >
          <span
            className={clsx(
              'h-2 w-2 rounded-full shrink-0',
              isAuthValid && 'bg-[var(--color-status-green)]',
              !isAuthValid && authStatus === 'Checking...' && 'bg-[var(--color-status-yellow)] animate-pulse',
              !isAuthValid && authStatus !== 'Checking...' && authStatus && 'bg-[var(--color-status-red)]'
            )}
          />
          {authStatus}
        </div>
      )}

      {/* Auth method selection */}
      <div className="flex w-full max-w-sm gap-2">
        {(['ghCli', 'pat'] as const).map((method) => (
          <button
            key={method}
            className={clsx(
              'flex-1 rounded-lg border-2 px-4 py-3 text-center transition-all',
              authMethod === method
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
                : 'border-[var(--color-subtle-border)] hover:border-[var(--color-strong-border)]'
            )}
            onClick={() => onAuthMethodChange(method)}
          >
            <div className="text-sm font-medium text-[var(--color-text-primary)]">
              {method === 'ghCli' ? 'GitHub CLI' : 'Access Token'}
            </div>
            <div className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
              {method === 'ghCli' ? 'Use existing gh login' : 'Enter a personal access token'}
            </div>
          </button>
        ))}
      </div>

      {/* PAT input */}
      {authMethod === 'pat' && (
        <div className="w-full max-w-sm">
          <label className="text-[11px] font-medium text-[var(--color-text-tertiary)]">
            Personal Access Token
          </label>
          <div className="relative mt-1">
            <input
              type={showToken ? 'text' : 'password'}
              className="field-input w-full pr-12"
              value={pat}
              onChange={(e) => onPatChange(e.target.value)}
              placeholder="ghp_..."
            />
            <button
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              onClick={() => setShowToken((prev) => !prev)}
              type="button"
            >
              {showToken ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
      )}

      {/* Validate button */}
      <button
        className="rounded-lg px-6 py-2 text-xs font-medium text-[var(--color-accent-foreground)] bg-[var(--color-accent)] hover:opacity-90 transition-opacity"
        onClick={onValidateAuth}
      >
        Verify Connection
      </button>
    </div>
  );
}
