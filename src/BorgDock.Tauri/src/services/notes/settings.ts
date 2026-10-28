import type { AppSettings } from '@/types/settings';
import type { RefContext } from './vault-index';

/**
 * The sync folder the vault sits in: the one Workstreams use, so both
 * machines see the same notes. `null`: this machine only.
 */
export function notesFolderSetting(settings: AppSettings): string | null {
  return settings.workstreams?.folder?.trim() || null;
}

/** What turns `AB#123` and `repo#12` into identities. */
export function refContextOf(settings: AppSettings): RefContext {
  return {
    adoOrganization: settings.azureDevOps.organization?.trim() || null,
    adoProject: settings.azureDevOps.project?.trim() || null,
    repos: settings.repos.map((repo) => ({ owner: repo.owner, name: repo.name })),
  };
}
