import { invoke } from '@tauri-apps/api/core';

/**
 * Gets a GitHub token. Tries the `gh` CLI first via Tauri command,
 * falls back to PAT from settings.
 */
export async function getGitHubToken(
  patFromSettings?: string
): Promise<string> {
  // Try gh CLI token first
  try {
    const token = await invoke<string>('gh_cli_token');
    if (token && token.trim().length > 0) {
      return token.trim();
    }
  } catch {
    // gh CLI not available or failed, fall back to PAT
  }

  // Fall back to PAT from settings
  if (patFromSettings && patFromSettings.trim().length > 0) {
    return patFromSettings.trim();
  }

  throw new Error(
    'No GitHub token available. Configure a Personal Access Token or install the GitHub CLI.'
  );
}
