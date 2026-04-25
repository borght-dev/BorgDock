import { useState } from 'react';
import { Button, Card, Dot, Pill } from '../shared/primitives';
import { Input } from '../shared/primitives';

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

  const authStatusTone = isAuthValid
    ? 'success'
    : authStatus === 'Checking...'
      ? 'warning'
      : 'error';

  const dotTone = isAuthValid ? 'green' : authStatus === 'Checking...' ? 'yellow' : 'red';

  return (
    <div className="flex flex-col items-center gap-6" data-wizard-step="auth">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-text-primary">Connect to GitHub</h2>
        <p className="mt-1 text-xs text-text-tertiary">
          Choose how BorgDock authenticates with GitHub
        </p>
      </div>

      {/* Auth status indicator */}
      {authStatus && (
        <Pill
          tone={authStatusTone}
          icon={
            <Dot
              tone={dotTone}
              pulse={authStatus === 'Checking...'}
              className="shrink-0"
            />
          }
          className="w-full max-w-sm"
          data-auth-status={
            isAuthValid ? 'valid' : authStatus === 'Checking...' ? 'pending' : 'invalid'
          }
        >
          {authStatus}
        </Pill>
      )}

      {/* Auth method selection */}
      <div className="flex w-full max-w-sm gap-2">
        {(['ghCli', 'pat'] as const).map((method) => (
          <button
            key={method}
            className="flex-1 rounded-none border-0 bg-transparent p-0 text-left"
            onClick={() => onAuthMethodChange(method)}
            type="button"
            data-auth-method={method}
          >
            <Card
              variant={authMethod === method ? 'own' : 'default'}
              padding="md"
              interactive
              className="pointer-events-none w-full text-center"
            >
              <div className="text-sm font-medium text-text-primary">
                {method === 'ghCli' ? 'GitHub CLI' : 'Access Token'}
              </div>
              <div className="mt-0.5 text-[10px] text-text-muted">
                {method === 'ghCli' ? 'Use existing gh login' : 'Enter a personal access token'}
              </div>
            </Card>
          </button>
        ))}
      </div>

      {/* PAT input */}
      {authMethod === 'pat' && (
        <div className="w-full max-w-sm">
          <label className="text-[11px] font-medium text-text-tertiary">
            Personal Access Token
          </label>
          <Input
            className="mt-1"
            type={showToken ? 'text' : 'password'}
            value={pat}
            onChange={(e) => onPatChange(e.target.value)}
            placeholder="ghp_..."
            trailing={
              <button
                className="text-[10px] text-text-muted hover:text-text-primary"
                onClick={() => setShowToken((prev) => !prev)}
                type="button"
              >
                {showToken ? 'Hide' : 'Show'}
              </button>
            }
          />
        </div>
      )}

      {/* Verify Connection button */}
      <Button variant="primary" size="md" onClick={onValidateAuth}>
        Verify Connection
      </Button>
    </div>
  );
}
