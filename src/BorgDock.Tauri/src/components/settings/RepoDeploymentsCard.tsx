import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { Button, Card, Chip, TextInput, ToggleRow } from '@/components/shared/primitives';
import { suggestEnvironments } from '@/services/delivery/environments';
import type { RepoSettings } from '@/types/settings';

interface Props {
  repos: RepoSettings[];
  onChange: (index: number, patch: Partial<RepoSettings>) => void;
}

function patternsOf(text: string): string[] {
  return text
    .split(',')
    .map((pattern) => pattern.trim())
    .filter(Boolean);
}

/** The environments of a repository's last 100 deployments, read with its account. */
async function readRecentEnvironments(repo: RepoSettings): Promise<string[]> {
  const token = await invoke<string>('gh_cli_token', { user: repo.githubAccount || null });
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/deployments?per_page=100`,
    { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'BorgDock' } },
  );
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const deployments = (await response.json()) as { environment: string }[];
  return suggestEnvironments(deployments.map((deployment) => deployment.environment));
}

/**
 * Which deployments Activity follows, per repository: "#412 reached acc"
 * and failed deploys that carried one of my merged PRs.
 */
export function RepoDeploymentsCard({ repos, onChange }: Props) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [suggested, setSuggested] = useState<Record<number, string[]>>({});
  const [reading, setReading] = useState<number | null>(null);
  const [error, setError] = useState<Record<number, string>>({});

  const suggest = async (index: number) => {
    const repo = repos[index];
    if (!repo) return;
    setReading(index);
    setError((current) => ({ ...current, [index]: '' }));
    try {
      const environments = await readRecentEnvironments(repo);
      setSuggested((current) => ({ ...current, [index]: environments }));
    } catch (reason) {
      setError((current) => ({ ...current, [index]: String(reason) }));
    } finally {
      setReading(null);
    }
  };

  const addPattern = (index: number, pattern: string) => {
    const repo = repos[index];
    if (!repo) return;
    const environments = [...new Set([...(repo.deployments?.environments ?? []), pattern])];
    setDrafts((current) => ({ ...current, [index]: environments.join(', ') }));
    onChange(index, { deployments: { enabled: true, environments } });
  };

  if (repos.length === 0) return null;
  return (
    <Card variant="default" padding="md">
      <h3 className="mb-1 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
        Deployments
      </h3>
      <p className="mb-2 text-[11.5px] leading-relaxed text-[var(--color-text-tertiary)]">
        Activity tells you when your merged PRs reach these environments, or when a deploy that
        carried one failed. Patterns such as <code>dev</code>, <code>*-a</code> or{' '}
        <code>prod*</code>; separate them with commas.
      </p>
      {repos.map((repo, index) => {
        const label = `${repo.owner}/${repo.name}`;
        const followed = repo.deployments?.enabled ?? false;
        const text = drafts[index] ?? (repo.deployments?.environments ?? []).join(', ');
        const options = (suggested[index] ?? []).filter(
          (environment) => !(repo.deployments?.environments ?? []).includes(environment),
        );
        return (
          <div key={label} data-testid={`deployments-${label}`}>
            <ToggleRow
              label={label}
              hint={followed ? 'Following deployments' : 'Deployments not followed'}
              on={followed}
              last={!followed && index === repos.length - 1}
              onChange={(enabled) =>
                onChange(index, {
                  deployments: { enabled, environments: repo.deployments?.environments ?? [] },
                })
              }
            />
            {followed && (
              <div className="flex flex-col gap-2 border-b border-[var(--color-subtle-border)] pb-3">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <TextInput
                    ariaLabel={`Environments for ${label}`}
                    value={text}
                    placeholder="dev, acc*, prod*"
                    mono
                    onChange={(next) => setDrafts((current) => ({ ...current, [index]: next }))}
                    onBlur={() =>
                      onChange(index, {
                        deployments: { enabled: true, environments: patternsOf(text) },
                      })
                    }
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={reading === index}
                    onClick={() => void suggest(index)}
                  >
                    {reading === index ? 'Reading…' : 'Suggest'}
                  </Button>
                </div>
                {options.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {options.slice(0, 16).map((environment) => (
                      <Chip key={environment} onClick={() => addPattern(index, environment)}>
                        + {environment}
                      </Chip>
                    ))}
                  </div>
                )}
                {error[index] && (
                  <div className="text-[11px] text-[var(--color-status-red)]">
                    Could not read deployments: {error[index]}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
