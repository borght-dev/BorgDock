/**
 * Known infrastructure failures. A hit replaces the volatile text in a
 * fingerprint with the entry's id, so the same runner or registry fault
 * groups across PRs. The failed step stays part of the fingerprint: a DNS
 * failure while installing and one during e2e are different groups.
 *
 * Bump `CATALOG_VERSION` (it is part of the fingerprint version) whenever an
 * entry changes what it matches.
 */

export const CATALOG_VERSION = 1;

export interface CatalogEntry {
  id: string;
  /** What the hypothesis line says: "Likely infrastructure: <Label>. Not proven." */
  label: string;
  patterns: RegExp[];
}

export const INFRA_CATALOG: readonly CatalogEntry[] = [
  {
    id: 'runner-lost',
    label: 'the runner stopped or lost contact',
    patterns: [
      /The runner has received a shutdown signal/i,
      /lost communication with the server/i,
      /The self-hosted runner .* lost/i,
    ],
  },
  {
    id: 'not-acquired',
    label: 'the job never got a runner',
    patterns: [/The job was not acquired by Runner/i, /waiting for a runner to pick up this job/i],
  },
  {
    id: 'disk-full',
    label: 'the runner ran out of disk space',
    patterns: [
      /No space left on device/i,
      /\bENOSPC\b/,
      /System\.IO\.IOException: There is not enough space/i,
    ],
  },
  {
    id: 'dns',
    label: 'a host name could not be resolved',
    patterns: [
      /Could not resolve host/i,
      /getaddrinfo (?:ENOTFOUND|EAI_AGAIN)/i,
      /\bEAI_AGAIN\b/,
      /Name or service not known/i,
      /No such host is known/i,
      /Temporary failure in name resolution/i,
    ],
  },
  {
    id: 'network-reset',
    label: 'a network connection broke off',
    patterns: [
      /\bECONNRESET\b/,
      /\bETIMEDOUT\b/,
      /TLS handshake timeout/i,
      /Connection reset by peer/i,
      /socket hang up/i,
      /The SSL connection could not be established/i,
    ],
  },
  {
    id: 'registry-limit',
    label: 'a package registry rate-limited the runner',
    patterns: [
      /toomanyrequests/i,
      /429 Too Many Requests/i,
      /You have reached your pull rate limit/i,
      /rate limit exceeded/i,
    ],
  },
  {
    id: 'registry-5xx',
    label: 'a package registry had a server error',
    patterns: [
      /npm (?:ERR!|error) code E5\d\d/i,
      /Response status code does not indicate success: 5\d\d/i,
      /\b50[234] (?:Bad Gateway|Service Unavailable|Gateway Time-?out)\b/i,
      /received unexpected HTTP status: 5\d\d/i,
    ],
  },
  {
    id: 'oom-kill',
    label: 'the runner killed a process for using too much memory',
    patterns: [/exit code 137\b/i, /\bOOMKilled\b/, /Killed\s+.*(?:out of memory|oom)/i],
  },
  {
    id: 'actions-service',
    label: 'GitHub Actions itself failed',
    patterns: [
      /Internal server error occurred while resolving "actions\//i,
      /Unable to download artifact/i,
      /Failed to download action/i,
      /An error occurred while provisioning resources/i,
      /Cache service responded with 5\d\d/i,
      /Failed to CreateArtifact/i,
    ],
  },
];

/** The catalog entry `text` matches, if any. */
export function matchCatalog(text: string): CatalogEntry | null {
  for (const entry of INFRA_CATALOG) {
    if (entry.patterns.some((pattern) => pattern.test(text))) return entry;
  }
  return null;
}

export function catalogEntry(id: string): CatalogEntry | undefined {
  return INFRA_CATALOG.find((entry) => entry.id === id);
}
