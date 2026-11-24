/**
 * What a note can name outside the vault, and the key its mentions are
 * indexed under. Names are kept for display, never matched on.
 */

/** A GitHub pull request. Numbers collide across repositories, so the repository is part of it. */
export interface GitHubPrRef {
  kind: 'github-pr';
  owner: string;
  repo: string;
  number: number;
}

/** An Azure DevOps work item. Ids are unique per organization. */
export interface AdoItemRef {
  kind: 'ado-item';
  organization: string;
  project: string;
  id: number;
}

/** A T3 thread: the environment id names the T3 install, the thread id is the one T3 itself knows. */
export interface T3ThreadRef {
  kind: 't3-thread';
  environmentId: string;
  threadId: string;
}

export type SourceRef = GitHubPrRef | AdoItemRef | T3ThreadRef;

/** The identity of a reference: `gh:github.com/owner/repo#12`, `ado:org#123`, `t3:env/thread`. */
export type RefKey = string;

export function refKey(ref: SourceRef): RefKey {
  switch (ref.kind) {
    case 'github-pr':
      return `gh:github.com/${ref.owner}/${ref.repo}#${ref.number}`.toLowerCase();
    case 'ado-item':
      return `ado:${ref.organization.toLowerCase()}#${ref.id}`;
    case 't3-thread':
      return `t3:${ref.environmentId}/${ref.threadId}`;
  }
}
