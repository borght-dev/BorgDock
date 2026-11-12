import type { WorkItemRelation } from '@/types';

/**
 * The links ADO's two links controls show: Development (pull requests,
 * branches, commits, from GitHub or Azure Repos) and Related Work (parent,
 * children, related items).
 */

export interface DevelopmentLinks {
  pullRequests: number[];
  branches: string[];
  commits: string[];
}

const GITHUB = /^vstfs:\/\/\/GitHub\/(PullRequest|Branch|Commit)\/[^/]+\/(.+)$/i;
const AZURE_PR = /^vstfs:\/\/\/Git\/PullRequestId\/[^/]+\/[^/]+\/(\d+)$/i;
const AZURE_REF = /^vstfs:\/\/\/Git\/Ref\/[^/]+\/[^/]+\/GB(.+)$/i;
const AZURE_COMMIT = /^vstfs:\/\/\/Git\/Commit\/[^/]+\/[^/]+\/([0-9a-f]{7,40})$/i;

function decode(url: string): string {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

export function developmentLinks(relations: WorkItemRelation[] | undefined): DevelopmentLinks {
  const links: DevelopmentLinks = { pullRequests: [], branches: [], commits: [] };
  for (const relation of relations ?? []) {
    if (relation.rel !== 'ArtifactLink') continue;
    const url = decode(relation.url);
    const github = GITHUB.exec(url);
    if (github) {
      const [, kind, rest] = github;
      if (/pullrequest/i.test(kind!) && /^\d+$/.test(rest!)) links.pullRequests.push(Number(rest));
      else if (/branch/i.test(kind!)) links.branches.push(rest!);
      else if (/commit/i.test(kind!)) links.commits.push(rest!);
      continue;
    }
    const pr = AZURE_PR.exec(url);
    if (pr) {
      links.pullRequests.push(Number(pr[1]));
      continue;
    }
    const ref = AZURE_REF.exec(url);
    if (ref) {
      links.branches.push(ref[1]!);
      continue;
    }
    const commit = AZURE_COMMIT.exec(url);
    if (commit) links.commits.push(commit[1]!);
  }
  links.pullRequests = [...new Set(links.pullRequests)];
  links.branches = [...new Set(links.branches)];
  links.commits = [...new Set(links.commits)];
  return links;
}

export type RelatedKind =
  | 'parent'
  | 'child'
  | 'related'
  | 'duplicate'
  | 'predecessor'
  | 'successor'
  | 'tested'
  | 'other';

export interface RelatedLink {
  kind: RelatedKind;
  id: number;
}

const RELATED_KIND: Record<string, RelatedKind> = {
  'System.LinkTypes.Hierarchy-Reverse': 'parent',
  'System.LinkTypes.Hierarchy-Forward': 'child',
  'System.LinkTypes.Related': 'related',
  'System.LinkTypes.Duplicate-Forward': 'duplicate',
  'System.LinkTypes.Duplicate-Reverse': 'duplicate',
  'System.LinkTypes.Dependency-Reverse': 'predecessor',
  'System.LinkTypes.Dependency-Forward': 'successor',
  'Microsoft.VSTS.Common.TestedBy-Forward': 'tested',
  'Microsoft.VSTS.Common.TestedBy-Reverse': 'tested',
};

const ORDER: RelatedKind[] = [
  'parent',
  'child',
  'related',
  'duplicate',
  'predecessor',
  'successor',
  'tested',
  'other',
];

/** Linked work items, parent first, then children, then the rest. */
export function relatedLinks(relations: WorkItemRelation[] | undefined): RelatedLink[] {
  const links: RelatedLink[] = [];
  for (const relation of relations ?? []) {
    if (
      !relation.rel.startsWith('System.LinkTypes.') &&
      !relation.rel.startsWith('Microsoft.VSTS.')
    ) {
      continue;
    }
    const match = /\/workItems\/(\d+)$/i.exec(relation.url);
    if (!match) continue;
    links.push({ kind: RELATED_KIND[relation.rel] ?? 'other', id: Number(match[1]) });
  }
  return links.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

export const RELATED_LABEL: Record<RelatedKind, string> = {
  parent: 'Parent',
  child: 'Child',
  related: 'Related',
  duplicate: 'Duplicate',
  predecessor: 'Before',
  successor: 'After',
  tested: 'Tested by',
  other: 'Linked',
};
