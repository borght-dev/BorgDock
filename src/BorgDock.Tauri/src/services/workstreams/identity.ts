import {
  type AdoItemRef,
  DECISION_PREFIX,
  type GitHubPrRef,
  type NodeKey,
  OUTCOME_PREFIX,
  type RefKey,
  type SourceRef,
  type T3ThreadRef,
} from './types';

/** The identity of a reference. Names are kept for display, never matched on. */
export function refKey(ref: SourceRef): RefKey {
  switch (ref.kind) {
    case 'github-pr':
      return `gh:github.com/${ref.owner}/${ref.repo}#${ref.number}`.toLowerCase();
    case 'ado-item':
      return `ado:${ref.organization.toLowerCase()}#${ref.id}`;
    case 't3-thread':
      return `t3:${ref.environmentId}/${ref.threadId}`;
    case 'link':
      return `url:${normalizeUrl(ref.url)}`;
  }
}

export function outcomeKey(id: string): NodeKey {
  return `${OUTCOME_PREFIX}${id}`;
}

export function decisionKey(id: string): NodeKey {
  return `${DECISION_PREFIX}${id}`;
}

export function isOutcomeKey(key: NodeKey): boolean {
  return key.startsWith(OUTCOME_PREFIX);
}

export function isDecisionKey(key: NodeKey): boolean {
  return key.startsWith(DECISION_PREFIX);
}

/** The id inside an `outcome:` or `decision:` key. */
export function idOfKey(key: NodeKey): string {
  return key.slice(key.indexOf(':') + 1);
}

/** Scheme and host in lower case, no trailing slash: two spellings of one page are one link. */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}${parsed.hash}`;
  } catch {
    return url.trim();
  }
}

const GITHUB_PR_URL =
  /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:[/?#].*)?$/i;
const GITHUB_PR_SHORT = /^([\w.-]+)\/([\w.-]+)#(\d+)$/;
const ADO_URL =
  /^https?:\/\/dev\.azure\.com\/([^/?#]+)\/([^/?#]+)\/_workitems\/edit\/(\d+)(?:[/?#].*)?$/i;
const VISUALSTUDIO_URL =
  /^https?:\/\/([\w-]+)\.visualstudio\.com\/([^/?#]+)\/_workitems\/edit\/(\d+)(?:[/?#].*)?$/i;
const ADO_BOARD_URL = /^https?:\/\/dev\.azure\.com\/([^/?#]+)\/([^/?#]+)\/.*[?&]workitem=(\d+)/i;
const AB_ID = /^(?:AB)?#(\d{1,9})$/i;
const T3_LINK = /^t3code:\/\/threads\/([^/\s]+)\/([^/\s?#]+)/i;

/** A pull request URL as a reference, or `null` for anything else. */
export function prRefFromUrl(url: string): GitHubPrRef | null {
  const match = GITHUB_PR_URL.exec(url.trim());
  if (!match) return null;
  return { kind: 'github-pr', owner: match[1]!, repo: match[2]!, number: Number(match[3]) };
}

export interface ParseContext {
  /** The configured Azure DevOps organization and project, for `AB#123`. */
  adoOrganization: string | null;
  adoProject: string | null;
  /** The T3 hosts whose environment is known. */
  environments: readonly { environmentId: string; hostId: string }[];
}

export type Parsed = { ref: SourceRef } | { error: string };

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

function adoRef(organization: string, project: string, id: string): AdoItemRef {
  return {
    kind: 'ado-item',
    organization: decode(organization),
    project: decode(project),
    id: Number(id),
  };
}

/**
 * What a pasted text points at: a pull request, a work item, a T3 thread or
 * any other page. `null` when it is no reference at all, only something to
 * search for.
 */
export function parseReference(input: string, context: ParseContext): Parsed | null {
  const text = input.trim();
  if (!text) return null;

  const pr = prRefFromUrl(text);
  if (pr) return { ref: pr };
  const short = GITHUB_PR_SHORT.exec(text);
  if (short) {
    return {
      ref: { kind: 'github-pr', owner: short[1]!, repo: short[2]!, number: Number(short[3]) },
    };
  }

  const ado = ADO_URL.exec(text) ?? ADO_BOARD_URL.exec(text);
  if (ado) return { ref: adoRef(ado[1]!, ado[2]!, ado[3]!) };
  const legacy = VISUALSTUDIO_URL.exec(text);
  if (legacy) return { ref: adoRef(legacy[1]!, legacy[2]!, legacy[3]!) };
  const ab = AB_ID.exec(text);
  if (ab) {
    if (!context.adoOrganization || !context.adoProject) {
      return { error: `Set up Azure DevOps to link ${text}.` };
    }
    return { ref: adoRef(context.adoOrganization, context.adoProject, ab[1]!) };
  }

  const t3 = T3_LINK.exec(text);
  if (t3) {
    const environmentId = decode(t3[1]!);
    const host = context.environments.find((e) => e.environmentId === environmentId);
    const ref: T3ThreadRef = {
      kind: 't3-thread',
      environmentId,
      threadId: decode(t3[2]!),
      hostId: host?.hostId ?? '',
    };
    return { ref };
  }

  if (/^https?:\/\//i.test(text)) {
    try {
      new URL(text);
      return { ref: { kind: 'link', url: text, title: text } };
    } catch {
      return { error: 'That is not a valid address.' };
    }
  }
  return null;
}

/** How a reference is named in one line: `owner/repo#12`, `AB#123`. */
export function shortIdentity(ref: SourceRef): string {
  switch (ref.kind) {
    case 'github-pr':
      return `${ref.owner}/${ref.repo}#${ref.number}`;
    case 'ado-item':
      return `AB#${ref.id}`;
    case 't3-thread':
      return `T3 thread ${ref.threadId.slice(0, 8)}`;
    case 'link':
      return hostOf(ref.url);
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Where the original record lives on the web, or in T3. */
export function sourceUrl(ref: SourceRef): string {
  switch (ref.kind) {
    case 'github-pr':
      return `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`;
    case 'ado-item':
      return `https://dev.azure.com/${encodeURIComponent(ref.organization)}/${encodeURIComponent(ref.project)}/_workitems/edit/${ref.id}`;
    case 't3-thread':
      return `t3code://threads/${ref.environmentId}/${ref.threadId}`;
    case 'link':
      return ref.url;
  }
}

export const KIND_LABEL: Record<SourceRef['kind'], string> = {
  'github-pr': 'Pull request',
  'ado-item': 'Work item',
  't3-thread': 'Thread',
  link: 'Link',
};
