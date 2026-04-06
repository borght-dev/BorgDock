import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RepoStep } from '../RepoStep';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('RepoStep', () => {
  const mockRepos = [
    { owner: 'org', name: 'repo1', localPath: '/home/user/repo1', isSelected: true },
    { owner: 'org', name: 'repo2', localPath: '/home/user/repo2', isSelected: false },
  ];

  const defaultProps = {
    repos: mockRepos,
    isScanning: false,
    onToggleRepo: vi.fn(),
    onSelectAll: vi.fn(),
    onDeselectAll: vi.fn(),
    onAddRepo: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading and description', () => {
    render(<RepoStep {...defaultProps} />);
    expect(screen.getByText('Select Repositories')).toBeTruthy();
    expect(screen.getByText('Add repos by path or owner/name, or select from discovered repos')).toBeTruthy();
  });

  it('renders the manual add input and button', () => {
    render(<RepoStep {...defaultProps} />);
    expect(screen.getByPlaceholderText('D:\\repos\\my-project or owner/name')).toBeTruthy();
    expect(screen.getByText('Add')).toBeTruthy();
  });

  it('renders Select All and Deselect All buttons', () => {
    render(<RepoStep {...defaultProps} />);
    expect(screen.getByText('Select All')).toBeTruthy();
    expect(screen.getByText('Deselect All')).toBeTruthy();
  });

  it('calls onSelectAll when clicking Select All', () => {
    const onSelectAll = vi.fn();
    render(<RepoStep {...defaultProps} onSelectAll={onSelectAll} />);
    fireEvent.click(screen.getByText('Select All'));
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it('calls onDeselectAll when clicking Deselect All', () => {
    const onDeselectAll = vi.fn();
    render(<RepoStep {...defaultProps} onDeselectAll={onDeselectAll} />);
    fireEvent.click(screen.getByText('Deselect All'));
    expect(onDeselectAll).toHaveBeenCalledTimes(1);
  });

  it('renders repo list with owner/name and localPath', () => {
    render(<RepoStep {...defaultProps} />);
    expect(screen.getByText('org/repo1')).toBeTruthy();
    expect(screen.getByText('org/repo2')).toBeTruthy();
    expect(screen.getByText('/home/user/repo1')).toBeTruthy();
    expect(screen.getByText('/home/user/repo2')).toBeTruthy();
  });

  it('calls onToggleRepo when clicking a repo item', () => {
    const onToggleRepo = vi.fn();
    render(<RepoStep {...defaultProps} onToggleRepo={onToggleRepo} />);
    fireEvent.click(screen.getByText('org/repo2'));
    expect(onToggleRepo).toHaveBeenCalledWith(1);
  });

  it('shows checkmark for selected repos', () => {
    render(<RepoStep {...defaultProps} />);
    const checkmarks = screen.getAllByText('\u2713');
    expect(checkmarks.length).toBe(1);
  });

  it('shows scanning indicator when isScanning is true', () => {
    render(<RepoStep {...defaultProps} isScanning={true} />);
    expect(screen.getByText('Scanning...')).toBeTruthy();
  });

  it('shows empty message when no repos and not scanning', () => {
    render(<RepoStep {...defaultProps} repos={[]} isScanning={false} />);
    expect(
      screen.getByText('No repositories discovered. Add repos manually in Settings.'),
    ).toBeTruthy();
  });

  it('does not show empty message when scanning', () => {
    render(<RepoStep {...defaultProps} repos={[]} isScanning={true} />);
    expect(
      screen.queryByText('No repositories discovered. Add repos manually in Settings.'),
    ).toBeNull();
  });

  it('adds owner/name repo via manual input', async () => {
    const onAddRepo = vi.fn();
    render(<RepoStep {...defaultProps} onAddRepo={onAddRepo} repos={[]} />);

    const input = screen.getByPlaceholderText('D:\\repos\\my-project or owner/name');
    fireEvent.change(input, { target: { value: 'myorg/myrepo' } });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() => {
      expect(onAddRepo).toHaveBeenCalledWith({
        owner: 'myorg',
        name: 'myrepo',
        localPath: '',
        isSelected: true,
      });
    });
  });

  it('adds repo via Enter key in manual input', async () => {
    const onAddRepo = vi.fn();
    render(<RepoStep {...defaultProps} onAddRepo={onAddRepo} repos={[]} />);

    const input = screen.getByPlaceholderText('D:\\repos\\my-project or owner/name');
    fireEvent.change(input, { target: { value: 'myorg/myrepo' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(onAddRepo).toHaveBeenCalled();
    });
  });

  it('shows error for invalid input', async () => {
    render(<RepoStep {...defaultProps} />);

    const input = screen.getByPlaceholderText('D:\\repos\\my-project or owner/name');
    fireEvent.change(input, { target: { value: 'invalid-input' } });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() => {
      expect(screen.getByText('Enter a local path or owner/name')).toBeTruthy();
    });
  });

  it('clears error when typing', () => {
    render(<RepoStep {...defaultProps} />);

    const input = screen.getByPlaceholderText('D:\\repos\\my-project or owner/name');
    fireEvent.change(input, { target: { value: 'bad' } });
    fireEvent.click(screen.getByText('Add'));

    expect(screen.queryByText('Enter a local path or owner/name')).toBeTruthy();

    fireEvent.change(input, { target: { value: 'owner/name' } });
    expect(screen.queryByText('Enter a local path or owner/name')).toBeNull();
  });

  it('does not add a repo that already exists', async () => {
    const onAddRepo = vi.fn();
    render(<RepoStep {...defaultProps} onAddRepo={onAddRepo} />);

    const input = screen.getByPlaceholderText('D:\\repos\\my-project or owner/name');
    fireEvent.change(input, { target: { value: 'org/repo1' } });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() => {
      expect(onAddRepo).not.toHaveBeenCalled();
    });
  });

  it('adds repo via local path using invoke', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      owner: 'resolved-org',
      name: 'resolved-repo',
      localPath: '/resolved/path',
    });

    const onAddRepo = vi.fn();
    render(<RepoStep {...defaultProps} onAddRepo={onAddRepo} repos={[]} />);

    const input = screen.getByPlaceholderText('D:\\repos\\my-project or owner/name');
    fireEvent.change(input, { target: { value: '/home/user/project' } });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('resolve_repo_path', {
        path: '/home/user/project',
      });
      expect(onAddRepo).toHaveBeenCalledWith({
        owner: 'resolved-org',
        name: 'resolved-repo',
        localPath: '/resolved/path',
        isSelected: true,
      });
    });
  });

  it('shows error when local path resolution fails', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('not a repo'));

    render(<RepoStep {...defaultProps} repos={[]} />);

    const input = screen.getByPlaceholderText('D:\\repos\\my-project or owner/name');
    fireEvent.change(input, { target: { value: '/invalid/path' } });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() => {
      expect(screen.getByText('Not a valid git repo with a remote')).toBeTruthy();
    });
  });

  it('does nothing when add button clicked with empty input', async () => {
    const onAddRepo = vi.fn();
    render(<RepoStep {...defaultProps} onAddRepo={onAddRepo} />);
    fireEvent.click(screen.getByText('Add'));
    expect(onAddRepo).not.toHaveBeenCalled();
  });
});
