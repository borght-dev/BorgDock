import type { AppSettings } from '@/types/settings';
import type { RefContext } from './vault-index';

/**
 * The folder a sync client shares between machines; the vault is `BorgDock
 * Notes` inside it. `null`: this machine only.
 */
export function notesFolderSetting(settings: AppSettings): string | null {
  return settings.notesSyncFolder?.trim() || null;
}

/** What turns `AB#123` and `repo#12` into identities. */
export function refContextOf(settings: AppSettings): RefContext {
  return {
    adoOrganization: settings.azureDevOps.organization?.trim() || null,
    adoProject: settings.azureDevOps.project?.trim() || null,
    repos: settings.repos.map((repo) => ({ owner: repo.owner, name: repo.name })),
  };
}
