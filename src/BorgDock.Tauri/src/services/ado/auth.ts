/**
 * Returns the Basic auth header value for Azure DevOps PAT authentication.
 */
export function getAdoAuthHeader(pat: string): string {
  return `Basic ${btoa(`:${pat}`)}`;
}
