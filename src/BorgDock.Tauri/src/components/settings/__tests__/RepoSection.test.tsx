import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RepoSettings } from '@/types/settings';
import { RepoSection } from '../RepoSection';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn().mockResolvedValue(null),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

const mkRepo = (overrides: Partial<RepoSettings> = {}): RepoSettings => ({
  owner: 'acme',
  name: 'widget',
  enabled: true,
  worktreeBasePath: 'D:/code/widget',
  worktreeSubfolder: '.worktrees',
  ...overrides,
});

describe('RepoSection', () => {
  it('renders empty state when no repos', () => {
    render(<RepoSection repos={[]} onChange={() => {}} />);
    expect(screen.getByText(/No repositories tracked yet/i)).toBeInTheDocument();
  });

  it('renders one row per tracked repo', () => {
    const repos = [mkRepo(), mkRepo({ name: 'gizmo' })];
    render(<RepoSection repos={repos} onChange={() => {}} />);
    expect(screen.getByText('acme/widget')).toBeInTheDocument();
    expect(screen.getByText('acme/gizmo')).toBeInTheDocument();
  });

  it('remove button removes the repo', () => {
    const onChange = vi.fn();
    render(<RepoSection repos={[mkRepo()]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Remove acme\/widget/ }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('scan button disabled when no parent path entered', () => {
    render(<RepoSection repos={[]} onChange={() => {}} />);
    const scanBtn = screen.getByRole('button', { name: /Scan folder/ });
    expect(scanBtn).toBeDisabled();
  });

  it('edits and removes a remote worktree repository', () => {
    const onRemoteChange = vi.fn();
    const remote = {
      id: 'mac-fsp',
      label: 'Mac mini',
      owner: 'Gomocha-FSP',
      name: 'fsp-horizon',
      sshTarget: 'koenvdb@100.88.82.41',
      identityFile: 'C:/Users/koen/.ssh/id_ed25519',
      basePath: '/Users/koenvdb/Dev/fsp-horizon',
      enabled: true,
    };

    render(
      <RepoSection
        repos={[]}
        onChange={() => {}}
        remoteWorktreeRepos={[remote]}
        onRemoteWorktreeReposChange={onRemoteChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Host label for remote repository 1'), {
      target: { value: 'Studio Mac' },
    });
    expect(onRemoteChange).toHaveBeenCalledWith([{ ...remote, label: 'Studio Mac' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove remote repository Mac mini' }));
    expect(onRemoteChange).toHaveBeenCalledWith([]);
  });
});
