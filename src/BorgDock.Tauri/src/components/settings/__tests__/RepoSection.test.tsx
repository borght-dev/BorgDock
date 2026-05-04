import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RepoSection } from '../RepoSection';
import type { RepoSettings } from '@/types/settings';

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
});
