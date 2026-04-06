import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubSettings } from '@/types';
import { GitHubSection } from '../GitHubSection';

function makeGitHub(overrides?: Partial<GitHubSettings>): GitHubSettings {
  return {
    authMethod: 'ghCli',
    pollIntervalSeconds: 60,
    username: 'testuser',
    ...overrides,
  };
}

describe('GitHubSection', () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
  });

  afterEach(cleanup);

  it('renders auth method buttons', () => {
    render(<GitHubSection github={makeGitHub()} onChange={onChange} />);
    expect(screen.getByText('GitHub CLI')).toBeDefined();
    expect(screen.getByText('Personal Access Token')).toBeDefined();
  });

  it('switches auth method to pat', () => {
    render(<GitHubSection github={makeGitHub()} onChange={onChange} />);
    fireEvent.click(screen.getByText('Personal Access Token'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ authMethod: 'pat' }));
  });

  it('switches auth method to ghCli', () => {
    render(<GitHubSection github={makeGitHub({ authMethod: 'pat' })} onChange={onChange} />);
    fireEvent.click(screen.getByText('GitHub CLI'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ authMethod: 'ghCli' }));
  });

  it('shows PAT input when authMethod is pat', () => {
    render(
      <GitHubSection
        github={makeGitHub({ authMethod: 'pat', personalAccessToken: 'ghp_test123' })}
        onChange={onChange}
      />,
    );
    const input = screen.getByPlaceholderText('ghp_...') as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.type).toBe('password');
    expect(input.value).toBe('ghp_test123');
  });

  it('hides PAT input when authMethod is ghCli', () => {
    render(<GitHubSection github={makeGitHub()} onChange={onChange} />);
    expect(screen.queryByPlaceholderText('ghp_...')).toBeNull();
  });

  it('toggles PAT visibility', () => {
    render(
      <GitHubSection
        github={makeGitHub({ authMethod: 'pat', personalAccessToken: 'ghp_test123' })}
        onChange={onChange}
      />,
    );
    const input = screen.getByPlaceholderText('ghp_...') as HTMLInputElement;
    expect(input.type).toBe('password');

    fireEvent.click(screen.getByText('Show'));
    expect(input.type).toBe('text');

    fireEvent.click(screen.getByText('Hide'));
    expect(input.type).toBe('password');
  });

  it('updates personal access token', () => {
    render(
      <GitHubSection github={makeGitHub({ authMethod: 'pat' })} onChange={onChange} />,
    );
    const input = screen.getByPlaceholderText('ghp_...');
    fireEvent.change(input, { target: { value: 'ghp_newtoken' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ personalAccessToken: 'ghp_newtoken' }),
    );
  });

  it('renders username input and updates it', () => {
    render(<GitHubSection github={makeGitHub()} onChange={onChange} />);
    const input = screen.getByPlaceholderText('GitHub username') as HTMLInputElement;
    expect(input.value).toBe('testuser');

    fireEvent.change(input, { target: { value: 'newuser' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ username: 'newuser' }));
  });

  it('renders poll interval slider and updates it', () => {
    render(<GitHubSection github={makeGitHub({ pollIntervalSeconds: 60 })} onChange={onChange} />);
    expect(screen.getByText('Poll Interval: 60s')).toBeDefined();

    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider.value).toBe('60');

    fireEvent.change(slider, { target: { value: '120' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ pollIntervalSeconds: 120 }));
  });

  it('renders Test Connection button', () => {
    render(<GitHubSection github={makeGitHub()} onChange={onChange} />);
    expect(screen.getByText('Test Connection')).toBeDefined();
  });

  it('preserves existing settings when updating a single field', () => {
    const github = makeGitHub({ authMethod: 'pat', personalAccessToken: 'ghp_xxx' });
    render(<GitHubSection github={github} onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText('GitHub username'), {
      target: { value: 'updated' },
    });

    expect(onChange).toHaveBeenCalledWith({
      authMethod: 'pat',
      personalAccessToken: 'ghp_xxx',
      pollIntervalSeconds: 60,
      username: 'updated',
    });
  });
});
