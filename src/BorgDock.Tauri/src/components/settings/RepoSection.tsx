import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Field,
  IconButton,
  Pill,
  SectionHeader,
  Select,
  TextInput,
} from '@/components/shared/primitives';
import type { RemoteWorktreeRepoSettings, RepoSettings } from '@/types/settings';
import { RemoteWorktreeReposCard } from './RemoteWorktreeReposCard';
import { RepoScanDialog } from './RepoScanDialog';

interface Props {
  repos: RepoSettings[];
  onChange: (rs: RepoSettings[]) => void;
  remoteWorktreeRepos?: RemoteWorktreeRepoSettings[];
  onRemoteWorktreeReposChange?: (repos: RemoteWorktreeRepoSettings[]) => void;
}

const EMPTY_REMOTE_REPOS: RemoteWorktreeRepoSettings[] = [];
const IGNORE_REMOTE_REPO_CHANGES = () => {};

export function RepoSection({
  repos,
  onChange,
  remoteWorktreeRepos = EMPTY_REMOTE_REPOS,
  onRemoteWorktreeReposChange = IGNORE_REMOTE_REPO_CHANGES,
}: Props) {
  const [parent, setParent] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ login: string; active: boolean }>>([]);
  const [detecting, setDetecting] = useState<number | null>(null);

  useEffect(() => {
    invoke<Array<{ login: string; active: boolean }>>('gh_cli_accounts')
      .then((found) => setAccounts(found ?? []))
      .catch(() => setAccounts([]));
  }, []);

  const updateRepo = (index: number, patch: Partial<RepoSettings>) =>
    onChange(repos.map((repo, i) => (i === index ? { ...repo, ...patch } : repo)));

  const detectAccount = async (index: number) => {
    const repo = repos[index];
    if (!repo?.owner || !repo.name) return;
    setDetecting(index);
    try {
      for (const account of [...accounts].sort((a, b) => Number(b.active) - Number(a.active))) {
        try {
          const token = await invoke<string>('gh_cli_token', { user: account.login });
          const response = await fetch(
            `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`,
            { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'BorgDock' } },
          );
          if (response.ok) {
            updateRepo(index, { githubAccount: account.login });
            return;
          }
        } catch {
          // Try the next authenticated account.
        }
      }
    } finally {
      setDetecting(null);
    }
  };

  return (
    <>
      <SectionHeader
        title="Repositories"
        subtitle="The repositories BorgDock monitors. Worktrees, PR cards and notifications come from these."
      />
      <Card variant="default" padding="md">
        <div className="mb-3 flex items-start gap-2.5">
          <h3 className="flex-1 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
            Tracked repositories
          </h3>
          <Button
            variant="primary"
            size="sm"
            onClick={async () => {
              const folder = await open({ directory: true, multiple: false });
              if (typeof folder === 'string') {
                onChange([
                  ...repos,
                  {
                    owner: '',
                    name: folder.split(/[\\/]/).pop() ?? '',
                    enabled: true,
                    worktreeBasePath: folder,
                    worktreeSubfolder: '.worktrees',
                  },
                ]);
              }
            }}
          >
            + Add repository
          </Button>
        </div>
        <div id="field-tracked-repositories" className="flex flex-col gap-2">
          {repos.length === 0 && (
            <p className="text-[11.5px] text-[var(--color-text-muted)]">
              No repositories tracked yet. Add one above or scan a folder below.
            </p>
          )}
          {repos.map((r, i) => (
            <div
              key={`${r.owner}/${r.name}`}
              className="flex items-center gap-3 rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface)] px-3 py-2.5"
            >
              <span
                aria-hidden
                className="grid h-[18px] w-[18px] place-items-center rounded-md bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="6" cy="3" r="2" />
                  <circle cx="6" cy="18" r="2" />
                  <circle cx="18" cy="6" r="2" />
                  <path d="M6 5v8a5 5 0 0 0 5 5h1M6 16V9M18 8v1a4 4 0 0 1-4 4h-2" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-[var(--color-text-primary)]">
                  {r.owner ? `${r.owner}/${r.name}` : r.name || '(unnamed)'}
                </div>
                <div className="mt-0.5 truncate font-mono text-[10.5px] text-[var(--color-text-muted)]">
                  {r.worktreeBasePath || '—'} · {r.worktreeSubfolder}
                </div>
                {!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(r.owner) && r.owner && (
                  <div className="mt-1 text-[10.5px] text-[var(--color-status-amber)]">
                    Owner must be a GitHub login or organization, not an SSH remote.
                  </div>
                )}
              </div>
              <div className="w-[170px]">
                <Select
                  ariaLabel={`GitHub account for ${r.owner}/${r.name}`}
                  value={r.githubAccount ?? ''}
                  options={[
                    { value: '', label: 'Active account' },
                    ...accounts.map((account) => ({
                      value: account.login,
                      label: `${account.login}${account.active ? ' (active)' : ''}`,
                    })),
                  ]}
                  onChange={(githubAccount) =>
                    updateRepo(i, { githubAccount: githubAccount || undefined })
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={detecting === i || accounts.length === 0}
                onClick={() => void detectAccount(i)}
              >
                {detecting === i ? 'Detecting…' : 'Detect'}
              </Button>
              <Pill tone={r.enabled ? 'success' : 'neutral'}>{r.enabled ? 'on' : 'off'}</Pill>
              <IconButton
                aria-label={`Remove ${r.owner}/${r.name}`}
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
                onClick={() => onChange(repos.filter((_, j) => j !== i))}
              />
            </div>
          ))}
        </div>
      </Card>

      <RemoteWorktreeReposCard repos={remoteWorktreeRepos} onChange={onRemoteWorktreeReposChange} />

      <Card variant="default" padding="md">
        <h3 className="mb-1.5 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Add a repository
        </h3>
        <p className="mb-3.5 text-[11.5px] leading-relaxed text-[var(--color-text-tertiary)]">
          Point BorgDock at a local clone — it reads the git remote to figure out owner/name
          automatically.
        </p>
        <Field label="Local folder" anchorId="local-folder">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <TextInput
              ariaLabel="Local folder path"
              value={parent}
              onChange={setParent}
              placeholder="C:\\path\\to\\your\\clone"
              mono
            />
            <Button
              variant="primary"
              size="sm"
              onClick={async () => {
                const r = await open({ directory: true, multiple: false });
                if (typeof r === 'string') setParent(r);
              }}
            >
              Browse…
            </Button>
          </div>
        </Field>
        <div
          id="field-scan-folder"
          className="flex items-center gap-2.5 rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface-hover)] px-3 py-2.5"
        >
          <div className="flex-1 text-[11.5px] leading-relaxed text-[var(--color-text-tertiary)]">
            Or scan a parent folder for git repositories.
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={!parent}
            onClick={() => setScanOpen(true)}
          >
            Scan folder…
          </Button>
        </div>
      </Card>

      <RepoScanDialog
        isOpen={scanOpen}
        parentPath={parent}
        onClose={() => setScanOpen(false)}
        onAdd={(selected) => onChange([...repos, ...selected])}
      />
    </>
  );
}
