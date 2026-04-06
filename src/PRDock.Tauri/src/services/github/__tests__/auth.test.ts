import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { getGitHubToken } from '../auth';

const mockedInvoke = vi.mocked(invoke);

describe('getGitHubToken', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns gh CLI token when available', async () => {
    mockedInvoke.mockResolvedValueOnce('ghp_clitoken123');

    const token = await getGitHubToken('ghp_pat456');

    expect(token).toBe('ghp_clitoken123');
    expect(mockedInvoke).toHaveBeenCalledWith('gh_cli_token');
  });

  it('trims whitespace from gh CLI token', async () => {
    mockedInvoke.mockResolvedValueOnce('  ghp_clitoken123  \n');

    const token = await getGitHubToken();

    expect(token).toBe('ghp_clitoken123');
  });

  it('falls back to PAT when gh CLI returns empty string', async () => {
    mockedInvoke.mockResolvedValueOnce('');

    const token = await getGitHubToken('ghp_pat456');

    expect(token).toBe('ghp_pat456');
  });

  it('falls back to PAT when gh CLI returns whitespace-only string', async () => {
    mockedInvoke.mockResolvedValueOnce('   ');

    const token = await getGitHubToken('ghp_pat456');

    expect(token).toBe('ghp_pat456');
  });

  it('falls back to PAT when gh CLI throws', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('gh not installed'));

    const token = await getGitHubToken('ghp_pat456');

    expect(token).toBe('ghp_pat456');
  });

  it('trims whitespace from PAT', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('gh not found'));

    const token = await getGitHubToken('  ghp_pat456  ');

    expect(token).toBe('ghp_pat456');
  });

  it('throws when no gh CLI token and no PAT provided', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('gh not found'));

    await expect(getGitHubToken()).rejects.toThrow(
      'No GitHub token available. Configure a Personal Access Token or install the GitHub CLI.',
    );
  });

  it('throws when no gh CLI token and PAT is empty string', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('gh not found'));

    await expect(getGitHubToken('')).rejects.toThrow('No GitHub token available');
  });

  it('throws when no gh CLI token and PAT is whitespace-only', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('gh not found'));

    await expect(getGitHubToken('   ')).rejects.toThrow('No GitHub token available');
  });

});
