import { open } from '@tauri-apps/plugin-dialog';
import { Button, Card, Field, IconButton, TextInput } from '@/components/shared/primitives';
import type { RemoteWorktreeRepoSettings } from '@/types/settings';

interface Props {
  repos: RemoteWorktreeRepoSettings[];
  onChange: (repos: RemoteWorktreeRepoSettings[]) => void;
}

function newRemoteRepo(): RemoteWorktreeRepoSettings {
  return {
    id: crypto.randomUUID(),
    label: '',
    owner: '',
    name: '',
    sshTarget: '',
    identityFile: '',
    basePath: '',
    enabled: true,
  };
}

export function RemoteWorktreeReposCard({ repos, onChange }: Props) {
  const update = (index: number, patch: Partial<RemoteWorktreeRepoSettings>) =>
    onChange(repos.map((repo, i) => (i === index ? { ...repo, ...patch } : repo)));

  return (
    <Card id="field-remote-worktrees" variant="default" padding="md">
      <div className="mb-3 flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
            Remote worktrees
          </h3>
          <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--color-text-tertiary)]">
            Read worktrees from one repository over non-interactive SSH. Remote rows are view-only
            in the worktree palette.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => onChange([...repos, newRemoteRepo()])}>
          + Add remote repository
        </Button>
      </div>

      {repos.length === 0 && (
        <p className="text-[11.5px] text-[var(--color-text-muted)]">
          No remote worktree repositories configured.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {repos.map((repo, index) => (
          <div
            key={repo.id}
            className="rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface)] p-3"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="min-w-0 flex-1 text-xs font-semibold text-[var(--color-text-primary)]">
                {repo.label || repo.name || 'Remote repository'}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => update(index, { enabled: !repo.enabled })}
              >
                {repo.enabled ? 'Disable' : 'Enable'}
              </Button>
              <IconButton
                aria-label={`Remove remote repository ${repo.label || repo.name || index + 1}`}
                size={22}
                icon={
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                }
                onClick={() => onChange(repos.filter((_, itemIndex) => itemIndex !== index))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Host label">
                <TextInput
                  ariaLabel={`Host label for remote repository ${index + 1}`}
                  value={repo.label}
                  onChange={(label) => update(index, { label })}
                  placeholder="Mac mini"
                />
              </Field>
              <Field label="SSH target">
                <TextInput
                  ariaLabel={`SSH target for remote repository ${index + 1}`}
                  value={repo.sshTarget}
                  onChange={(sshTarget) => update(index, { sshTarget })}
                  placeholder="user@100.64.0.1"
                  mono
                />
              </Field>
              <Field label="GitHub owner">
                <TextInput
                  ariaLabel={`GitHub owner for remote repository ${index + 1}`}
                  value={repo.owner}
                  onChange={(owner) => update(index, { owner })}
                  placeholder="organization"
                />
              </Field>
              <Field label="Repository name">
                <TextInput
                  ariaLabel={`Name for remote repository ${index + 1}`}
                  value={repo.name}
                  onChange={(name) => update(index, { name })}
                  placeholder="repository"
                />
              </Field>
              <div className="col-span-2">
                <Field label="Remote repository path">
                  <TextInput
                    ariaLabel={`Path for remote repository ${index + 1}`}
                    value={repo.basePath}
                    onChange={(basePath) => update(index, { basePath })}
                    placeholder="/Users/me/Dev/repository"
                    mono
                  />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Private key">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <TextInput
                      ariaLabel={`Private key for remote repository ${index + 1}`}
                      value={repo.identityFile}
                      onChange={(identityFile) => update(index, { identityFile })}
                      placeholder="C:\\Users\\me\\.ssh\\id_ed25519"
                      mono
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        const file = await open({ directory: false, multiple: false });
                        if (typeof file === 'string') update(index, { identityFile: file });
                      }}
                    >
                      Browse…
                    </Button>
                  </div>
                </Field>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
