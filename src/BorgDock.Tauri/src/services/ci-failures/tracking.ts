import type { GitHubClient } from '@/services/github/client';
import { createLogger } from '@/services/logger';
import { factsOf } from '@/stores/ci-failures-store';
import { claimGroup } from './actions';
import { hashText } from './fingerprint';
import { HYPOTHESIS_LABEL, hypothesesOf } from './hypothesis';
import { parseScope } from './identity';
import * as store from './store-api';
import type { CiGroupDetail, CiGroupSummary, CiScopeSnapshot } from './types';

const log = createLogger('ci-failures-tracking');

/** The label tracking issues carry; discovery lists open issues with it. */
export const TRACKING_LABEL = 'borgdock-ci-failure';

const MARKER = /<!--\s*borgdock:ci-group v1 fp=([0-9a-f,]+)\s*-->/;

/**
 * Hashes of a group's fingerprints, never the fingerprints themselves: the
 * marker is public in the issue body and must not leak evidence.
 */
export function fingerprintHashes(detail: CiGroupDetail): string[] {
  const values = new Set(
    detail.occurrences.flatMap((o) =>
      o.signals.filter((s) => s.groupId === detail.summary.id).map((s) => s.fingerprint),
    ),
  );
  return [...values].map((value) => hashText(value)).sort();
}

export function markerOf(hashes: readonly string[]): string {
  return `<!-- borgdock:ci-group v1 fp=${hashes.join(',')} -->`;
}

export function hashesInBody(body: string | null | undefined): string[] {
  const match = MARKER.exec(body ?? '');
  return match?.[1] ? match[1].split(',').filter(Boolean) : [];
}

export interface IssueDraft {
  title: string;
  body: string;
}

/** The tracking issue BorgDock proposes; shown in full before anything is posted. */
export function issueDraft(detail: CiGroupDetail, branch: string | null): IssueDraft {
  const parts = parseScope(detail.summary.scope);
  const summary = detail.summary;
  const prs = summary.prNumbers.map((n) => `- #${n}`).join('\n');
  const hypotheses = hypothesesOf(factsOf(summary, branch));
  const steps = [
    ...new Set(detail.occurrences.map((o) => o.occurrence.failedStep).filter(Boolean)),
  ];
  const jobs = [
    ...new Set(
      detail.occurrences.map((o) => `${o.occurrence.workflowName ?? ''} › ${o.occurrence.jobName}`),
    ),
  ];
  return {
    title: `CI failure: ${summary.title}`.slice(0, 200),
    body: [
      `The same CI failure shows up in ${summary.prNumbers.length} pull ${summary.prNumbers.length === 1 ? 'request' : 'requests'}${summary.defaultBranchRuns.length > 0 ? ` and on ${branch ? `\`${branch}\`` : 'the default branch'}` : ''} of ${parts ? `${parts.owner}/${parts.repo}` : 'this repository'}.`,
      prs ? `**Affected pull requests**\n\n${prs}` : null,
      `**Jobs**\n\n${jobs.map((j) => `- ${j}`).join('\n')}`,
      steps.length > 0 ? `**Failed step**: ${steps.join(', ')}` : null,
      hypotheses.length > 0
        ? `**Suggested cause (unproven)**: ${hypotheses.map((h) => `${HYPOTHESIS_LABEL[h.kind]}: ${h.reason}`).join('; ')}`
        : null,
      'The assignee owns the investigation. Required checks stay required; nobody reruns or skips them because of this issue.',
      markerOf(fingerprintHashes(detail)),
    ]
      .filter(Boolean)
      .join('\n\n'),
  };
}

interface IssueDto {
  number: number;
  html_url: string;
  state: string;
  body?: string | null;
  assignees?: Array<{ login: string }>;
  pull_request?: unknown;
}

/** Creates the tracking issue, assigned to `assignee`, and makes it the group's owner. */
export async function createTrackingIssue(
  client: GitHubClient,
  group: CiGroupSummary,
  draft: IssueDraft,
  assignee: string,
): Promise<string> {
  const parts = parseScope(group.scope);
  if (!parts) throw new Error('Unknown repository');
  const issue = await client.post<IssueDto>(`repos/${parts.owner}/${parts.repo}/issues`, {
    title: draft.title,
    body: draft.body,
    labels: [TRACKING_LABEL],
    ...(assignee ? { assignees: [assignee] } : {}),
  });
  await store.setGroup(group.id, { trackingIssue: issue.html_url }, group.revision);
  if (!group.claim) {
    await claimGroup(group, {
      kind: 'github_issue',
      ownerRef: issue.html_url,
      label: assignee ? `#${issue.number} · @${assignee}` : `#${issue.number}`,
      hostId: null,
    });
  }
  return issue.html_url;
}

/** Comments the PRs the issue doesn't list yet. Explicit only. */
export async function updateTrackingIssue(
  client: GitHubClient,
  group: CiGroupSummary,
): Promise<void> {
  const parts = parseScope(group.scope);
  const number = group.trackingIssue?.match(/\/issues\/(\d+)/)?.[1];
  if (!parts || !number) throw new Error('This group has no tracking issue');
  await client.post(`repos/${parts.owner}/${parts.repo}/issues/${number}/comments`, {
    body: `Now failing in ${group.prNumbers.map((n) => `#${n}`).join(', ')}${group.defaultBranchRuns.length > 0 ? ' and on the default branch' : ''}.`,
  });
}

export async function closeTrackingIssue(
  client: GitHubClient,
  group: CiGroupSummary,
): Promise<void> {
  const parts = parseScope(group.scope);
  const number = group.trackingIssue?.match(/\/issues\/(\d+)/)?.[1];
  if (!parts || !number) throw new Error('This group has no tracking issue');
  await client.patch(`repos/${parts.owner}/${parts.repo}/issues/${number}`, {
    state: 'closed',
    state_reason: 'completed',
  });
}

/**
 * Finds tracking issues other installs or teammates opened: open issues with
 * the label whose marker names one of a group's fingerprint hashes. A match
 * links the issue and, for an unowned group, makes its assignee the owner.
 * Closed or unassigned issues turn their claim stale.
 */
export async function discoverTrackingIssues(
  client: GitHubClient,
  scope: string,
  snapshot: CiScopeSnapshot,
): Promise<void> {
  const parts = parseScope(scope);
  if (!parts) return;
  const issues = await client.get<IssueDto[]>(
    `repos/${parts.owner}/${parts.repo}/issues?labels=${TRACKING_LABEL}&state=all&per_page=50`,
  );
  const hashToGroup = new Map<string, string>();
  for (const row of snapshot.index) hashToGroup.set(hashText(row.fingerprint), row.groupId);
  const groups = new Map(snapshot.groups.map((g) => [g.id, g]));
  for (const issue of issues ?? []) {
    if (issue.pull_request) continue;
    const groupId = hashesInBody(issue.body)
      .map((hash) => hashToGroup.get(hash))
      .find(Boolean);
    const group = groupId ? groups.get(groupId) : undefined;
    if (!group) continue;
    try {
      if (!group.trackingIssue && issue.state === 'open') {
        await store.setGroup(group.id, { trackingIssue: issue.html_url }, group.revision);
      }
      const assignee = issue.assignees?.[0]?.login;
      const claim = group.claim;
      if (!claim && issue.state === 'open' && assignee) {
        await claimGroup(group, {
          kind: 'github_issue',
          ownerRef: issue.html_url,
          label: `#${issue.number} · @${assignee}`,
          hostId: null,
        });
      } else if (claim?.ownerKind === 'github_issue' && claim.ownerRef === issue.html_url) {
        const stale = issue.state !== 'open' || !assignee;
        if (stale !== (claim.state === 'stale')) {
          await store.updateClaim(
            claim.id,
            claim.revision,
            { state: stale ? 'stale' : 'active' },
            stale ? 'stale' : 'renewed',
            issue.state,
          );
        }
      }
    } catch (error) {
      log.debug('tracking issue sync failed', { issue: issue.number, error: String(error) });
    }
  }
}
