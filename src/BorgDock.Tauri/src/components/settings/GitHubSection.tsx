import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Card, Button, LinearProgress } from '@/components/shared/primitives';
import { Field, SectionHeader, Seg2, Slider, TextInput } from '@/components/shared/primitives';
import { useGitHubRateLimit } from '@/services/github/rate-limit';
import type { GitHubSettings } from '@/types/settings';

interface Props { github: GitHubSettings; onChange: (g: GitHubSettings) => void }

export function GitHubSection({ github, onChange }: Props) {
  const rl = useGitHubRateLimit();
  const pct = rl ? (rl.used / rl.limit) * 100 : 0;
  const tone: 'success' | 'warning' | 'error' =
    pct >= 95 ? 'error' : pct >= 80 ? 'warning' : 'success';

  return (
    <>
      <SectionHeader
        title="GitHub"
        subtitle="How BorgDock authenticates with github.com and how often it polls for new pull requests."
      />
      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">Authentication</h3>

        <Field label="Auth method" anchorId="auth-method">
          <Seg2
            value={github.authMethod === 'pat' ? 'pat' : 'cli'}
            options={[
              { value: 'cli', label: 'GitHub CLI' },
              { value: 'pat', label: 'Personal Access Token' },
            ]}
            onChange={(v) => onChange({ ...github, authMethod: v === 'pat' ? 'pat' : 'ghCli' })}
          />
        </Field>

        {github.authMethod !== 'pat' ? (
          <div
            data-gh-auth="cli-banner"
            className="mb-[18px] flex items-center gap-2.5 rounded-md border border-[var(--color-success-badge-border)] bg-[var(--color-success-badge-bg)] px-3 py-2.5 text-[var(--color-success-badge-fg)]"
          >
            <span className="text-xs font-medium">
              Authenticated via <code className="font-mono">gh</code> as
            </span>
            <span className="text-xs font-semibold">{github.username || '—'}</span>
            <span className="flex-1" />
            <Button variant="secondary" size="sm" onClick={() => invoke('check_github_auth', { method: 'ghCli' }).catch(console.error)}>
              Re-authenticate
            </Button>
          </div>
        ) : (
          <Field label="Token" hint="Needs repo, read:org and workflow scopes." anchorId="pat">
            <TextInput
              ariaLabel="GitHub personal access token"
              value={github.personalAccessToken ?? ''}
              onChange={(personalAccessToken) => onChange({ ...github, personalAccessToken })}
              type="password"
              mono
              placeholder="ghp_…"
            />
          </Field>
        )}

        <Field label="Username" anchorId="username">
          <TextInput
            ariaLabel="GitHub username"
            value={github.username}
            onChange={(username) => onChange({ ...github, username })}
            placeholder="GitHub username"
          />
        </Field>

        <Field
          label="Poll interval"
          hint="How often BorgDock checks GitHub for PR changes. Adaptive polling doubles the interval near the rate-limit ceiling."
          anchorId="poll-interval"
        >
          <Slider
            ariaLabel="GitHub poll interval"
            value={github.pollIntervalSeconds}
            min={15}
            max={600}
            step={5}
            suffix="s"
            onChange={(pollIntervalSeconds) => onChange({ ...github, pollIntervalSeconds })}
          />
        </Field>

        <Field label="Rate limit" hint="REST API quota for the authenticated token." anchorId="rate-limit">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <LinearProgress value={pct} tone={tone} />
            </div>
            <span className="font-mono text-[11px] text-[var(--color-text-tertiary)] min-w-[110px] text-right">
              {rl ? `${rl.used.toLocaleString()} / ${rl.limit.toLocaleString()}` : '—'}
            </span>
          </div>
        </Field>

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={() => invoke('check_github_auth', { method: github.authMethod, pat: github.personalAccessToken }).catch(console.error)}>
            Test connection
          </Button>
          <Button variant="ghost" size="sm" onClick={() => openUrl('https://github.com').catch(console.error)}>
            Open on github.com
          </Button>
        </div>
      </Card>
    </>
  );
}
