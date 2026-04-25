import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepoSettings } from '@/types';
import { RepoSection } from '../RepoSection';

function makeRepo(overrides?: Partial<RepoSettings>): RepoSettings {
  return {
    owner: 'acme',
    name: 'backend',
    enabled: true,
    worktreeBasePath: '',
    worktreeSubfolder: '.worktrees',
    ...overrides,
  };
}

describe('RepoSection', () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
  });

  afterEach(cleanup);

  it('renders empty state with add form', () => {
    render(<RepoSection repos={[]} onChange={onChange} />);
    expect(screen.getByPlaceholderText('owner')).toBeDefined();
    expect(screen.getByPlaceholderText('repo')).toBeDefined();
    expect(screen.getByText('Add')).toBeDefined();
  });

  it('renders existing repos', () => {
    const repos = [makeRepo(), makeRepo({ owner: 'acme', name: 'frontend' })];
    render(<RepoSection repos={repos} onChange={onChange} />);
    expect(screen.getByText('acme/backend')).toBeDefined();
    expect(screen.getByText('acme/frontend')).toBeDefined();
  });

  it('adds a new repo', () => {
    render(<RepoSection repos={[]} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('owner'), { target: { value: 'myorg' } });
    fireEvent.change(screen.getByPlaceholderText('repo'), { target: { value: 'myrepo' } });
    fireEvent.click(screen.getByText('Add'));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ owner: 'myorg', name: 'myrepo', enabled: true }),
    ]);
  });

  it('trims whitespace from owner and name when adding', () => {
    render(<RepoSection repos={[]} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('owner'), { target: { value: '  myorg  ' } });
    fireEvent.change(screen.getByPlaceholderText('repo'), { target: { value: '  myrepo  ' } });
    fireEvent.click(screen.getByText('Add'));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ owner: 'myorg', name: 'myrepo' }),
    ]);
  });

  it('does not add repo with empty owner', () => {
    render(<RepoSection repos={[]} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('repo'), { target: { value: 'myrepo' } });
    fireEvent.click(screen.getByText('Add'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not add repo with empty name', () => {
    render(<RepoSection repos={[]} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('owner'), { target: { value: 'myorg' } });
    fireEvent.click(screen.getByText('Add'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disables Add button when fields are empty', () => {
    render(<RepoSection repos={[]} onChange={onChange} />);
    const addButton = screen.getByText('Add') as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);
  });

  it('enables Add button when both fields have values', () => {
    render(<RepoSection repos={[]} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('owner'), { target: { value: 'org' } });
    fireEvent.change(screen.getByPlaceholderText('repo'), { target: { value: 'repo' } });
    const addButton = screen.getByText('Add') as HTMLButtonElement;
    expect(addButton.disabled).toBe(false);
  });

  it('adds repo on Enter key in name field', () => {
    render(<RepoSection repos={[]} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('owner'), { target: { value: 'myorg' } });
    const nameInput = screen.getByPlaceholderText('repo');
    fireEvent.change(nameInput, { target: { value: 'myrepo' } });
    fireEvent.keyDown(nameInput, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ owner: 'myorg', name: 'myrepo' }),
    ]);
  });

  it('clears input after adding repo', () => {
    const { rerender } = render(<RepoSection repos={[]} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('owner'), { target: { value: 'myorg' } });
    fireEvent.change(screen.getByPlaceholderText('repo'), { target: { value: 'myrepo' } });
    fireEvent.click(screen.getByText('Add'));

    // After adding, rerender with the new repos to simulate parent state update
    const newRepos = [makeRepo({ owner: 'myorg', name: 'myrepo' })];
    rerender(<RepoSection repos={newRepos} onChange={onChange} />);

    // Inputs should be cleared after add (component internal state reset)
    const ownerInput = screen.getByPlaceholderText('owner') as HTMLInputElement;
    const nameInput = screen.getByPlaceholderText('repo') as HTMLInputElement;
    expect(ownerInput.value).toBe('');
    expect(nameInput.value).toBe('');
  });

  it('removes a repo', () => {
    const repos = [makeRepo(), makeRepo({ owner: 'acme', name: 'frontend' })];
    render(<RepoSection repos={repos} onChange={onChange} />);

    // Find the remove buttons by aria-label
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    fireEvent.click(removeButtons[0]!);

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ owner: 'acme', name: 'frontend' }),
    ]);
  });

  it('toggles repo enabled state', () => {
    const repos = [makeRepo({ enabled: true })];
    render(<RepoSection repos={repos} onChange={onChange} />);

    // ToggleSwitch renders with role="switch"
    const toggle = screen.getByRole('switch', { name: 'Enable backend' });
    fireEvent.click(toggle);

    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ enabled: false })]);
  });

  it('expands repo settings on name click', () => {
    const repos = [makeRepo({ worktreeBasePath: '/path/to/repo' })];
    render(<RepoSection repos={repos} onChange={onChange} />);

    fireEvent.click(screen.getByText('acme/backend'));

    expect(screen.getByText('Worktree base path')).toBeDefined();
    expect(screen.getByText('Claude instructions (for Fix & Monitor)')).toBeDefined();
  });

  it('collapses repo settings on second click', () => {
    const repos = [makeRepo()];
    render(<RepoSection repos={repos} onChange={onChange} />);

    fireEvent.click(screen.getByText('acme/backend'));
    expect(screen.getByText('Worktree base path')).toBeDefined();

    fireEvent.click(screen.getByText('acme/backend'));
    expect(screen.queryByText('Worktree base path')).toBeNull();
  });

  it('updates worktree base path', () => {
    const repos = [makeRepo()];
    render(<RepoSection repos={repos} onChange={onChange} />);

    fireEvent.click(screen.getByText('acme/backend'));
    fireEvent.change(screen.getByPlaceholderText('e.g. D:\\repos\\my-project'), {
      target: { value: '/new/path' },
    });

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ worktreeBasePath: '/new/path' }),
    ]);
  });

  it('updates fix prompt template', () => {
    const repos = [makeRepo()];
    render(<RepoSection repos={repos} onChange={onChange} />);

    fireEvent.click(screen.getByText('acme/backend'));
    fireEvent.change(
      screen.getByPlaceholderText('e.g. When E2E tests fail, use /fix-e2e to fix them.'),
      { target: { value: 'Custom instructions' } },
    );

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ fixPromptTemplate: 'Custom instructions' }),
    ]);
  });

  it('clears fix prompt template to undefined when emptied', () => {
    const repos = [makeRepo({ fixPromptTemplate: 'some prompt' })];
    render(<RepoSection repos={repos} onChange={onChange} />);

    fireEvent.click(screen.getByText('acme/backend'));
    fireEvent.change(
      screen.getByPlaceholderText('e.g. When E2E tests fail, use /fix-e2e to fix them.'),
      { target: { value: '' } },
    );

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ fixPromptTemplate: undefined }),
    ]);
  });
});
