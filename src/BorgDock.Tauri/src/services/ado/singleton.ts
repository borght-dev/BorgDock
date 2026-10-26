import type { AppSettings } from '@/types';
import { AdoClient } from './client';

let cachedClient: { key: string; client: AdoClient } | null = null;

export function adoClient(ado: AppSettings['azureDevOps']): AdoClient | null {
  const hasCredentials = ado.authMethod === 'azCli' || !!ado.personalAccessToken;
  if (!ado.organization || !ado.project || !hasCredentials) return null;
  const key = [ado.organization, ado.project, ado.authMethod, ado.personalAccessToken].join('|');
  if (cachedClient?.key !== key) {
    cachedClient = {
      key,
      client: new AdoClient(
        ado.organization,
        ado.project,
        ado.personalAccessToken ?? '',
        ado.authMethod,
      ),
    };
  }
  return cachedClient.client;
}
