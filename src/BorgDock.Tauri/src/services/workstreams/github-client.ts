import { getGitHubToken } from '@/services/github/auth';
import { getClient, initClient } from '@/services/github/singleton';
import { useSettingsStore } from '@/stores/settings-store';
import { accountFor } from './sources';

/**
 * The GitHub client for a workstream's pull request: its repository's
 * account, else the one on the reference, else the default. Reads and
 * actions use the same one, so what BorgDock could read it can also close.
 */
export function clientForPullRequest(owner: string, repo: string, account: string | null) {
  const settings = useSettingsStore.getState().settings;
  const chosen = accountFor({ owner, repo, account }, settings.repos);
  if (!chosen) return getClient();
  const existing = getClient(chosen);
  if (existing) return existing;
  if (!getClient()) return null;
  const pat = settings.gitHub.personalAccessToken;
  return initClient(() => getGitHubToken(pat, chosen), chosen);
}
