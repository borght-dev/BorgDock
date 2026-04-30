import { describe, expect, it } from 'vitest';
import type { RepoSettings } from '@/types/settings';
import { findRepoConfig } from '../repo-lookup';

function repo(owner: string, name: string): RepoSettings {
  return {
    owner,
    name,
    enabled: true,
    worktreeBasePath: '',
    worktreeSubfolder: '.worktrees',
  };
}

describe('findRepoConfig', () => {
  it('matches exact case', () => {
    const repos = [repo('Acme', 'WebApp'), repo('Other', 'Lib')];
    expect(findRepoConfig(repos, 'Acme', 'WebApp')).toBe(repos[0]);
  });

  it('matches case-insensitively on owner', () => {
    const repos = [repo('Acme', 'WebApp')];
    expect(findRepoConfig(repos, 'acme', 'WebApp')).toBe(repos[0]);
  });

  it('matches case-insensitively on name', () => {
    const repos = [repo('Acme', 'WebApp')];
    expect(findRepoConfig(repos, 'Acme', 'webapp')).toBe(repos[0]);
  });

  it('matches with both fields differing in case', () => {
    const repos = [repo('Acme', 'WebApp')];
    expect(findRepoConfig(repos, 'ACME', 'WEBAPP')).toBe(repos[0]);
  });

  it('returns undefined when no match exists', () => {
    const repos = [repo('Acme', 'WebApp')];
    expect(findRepoConfig(repos, 'Other', 'WebApp')).toBeUndefined();
  });

  it('returns undefined for empty repo list', () => {
    expect(findRepoConfig([], 'Acme', 'WebApp')).toBeUndefined();
  });
});
