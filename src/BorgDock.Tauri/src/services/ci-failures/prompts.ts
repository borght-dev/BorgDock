import { excerptFromSignals } from '@/services/first-failure';
import { factsOf, scopeOfRepo } from '@/stores/ci-failures-store';
import { useSettingsStore } from '@/stores/settings-store';
import { HYPOTHESIS_LABEL, hypothesesOf, relatednessOf } from './hypothesis';
import { ciFailureSettings } from './settings';
import * as store from './store-api';
import type { CiGroupDetail, CiGroupSummary, CiOccurrenceDetail } from './types';

/** Sanitized evidence a fix prompt carries: what failed, and what it shares with other PRs. */
export interface FixEvidence {
  failures: { checkName: string; lines: string[]; jobUrl: string | null }[];
  shared: { title: string; prNumbers: number[]; onDefaultBranch: boolean; owner: string | null }[];
}

/** First-message limit T3 enforces for a new thread. */
export const PROMPT_LIMIT = 20_000;

/** When the job failed; when BorgDock saw it if GitHub gave no time. A backfill reads old jobs late. */
function failedAt(detail: CiOccurrenceDetail): string {
  return detail.occurrence.completedAt ?? detail.occurrence.observedAt;
}

/** The newest failure per check name. */
export function latestPerCheck(
  occurrences: readonly CiOccurrenceDetail[],
): Map<string, CiOccurrenceDetail> {
  const latest = new Map<string, CiOccurrenceDetail>();
  for (const detail of occurrences) {
    const previous = latest.get(detail.occurrence.jobName);
    if (!previous || failedAt(detail) > failedAt(previous)) {
      latest.set(detail.occurrence.jobName, detail);
    }
  }
  return latest;
}

/**
 * The evidence for a Fix prompt from the CI failure store, or null when
 * collection is off or nothing was recorded for these checks.
 */
export async function fixEvidence(
  owner: string,
  repo: string,
  prNumber: number,
  checkNames: readonly string[],
): Promise<FixEvidence | null> {
  const settings = useSettingsStore.getState().settings;
  if (!ciFailureSettings(settings).enabled) return null;
  const account = settings.repos.find(
    (r) =>
      r.owner.toLowerCase() === owner.toLowerCase() && r.name.toLowerCase() === repo.toLowerCase(),
  )?.githubAccount;
  const failures = await store
    .loadPr(scopeOfRepo({ owner, name: repo, githubAccount: account }), prNumber)
    .catch(() => null);
  if (!failures) return null;
  const wanted = new Set(checkNames);
  const latest = [...latestPerCheck(failures.occurrences).values()].filter(
    (detail) => wanted.size === 0 || wanted.has(detail.occurrence.jobName),
  );
  const groupIds = new Set(
    latest.flatMap((d) => d.signals.map((s) => s.groupId).filter((id): id is string => !!id)),
  );
  const shared = failures.groups
    .filter(
      (group) =>
        groupIds.has(group.id) &&
        group.maxTier === 'high' &&
        relatednessOf(factsOf(group)) === 'shared',
    )
    .map((group) => ({
      title: group.title,
      prNumbers: group.prNumbers.filter((n) => n !== prNumber),
      onDefaultBranch: group.defaultBranchRuns.length > 0,
      owner: group.claim?.ownerLabel ?? null,
    }));
  const evidence: FixEvidence = {
    failures: latest
      .map((detail) => ({
        checkName: detail.occurrence.jobName,
        lines: excerptFromSignals(detail.signals.map((s) => s.signal)),
        jobUrl: detail.occurrence.htmlUrl,
      }))
      .filter((failure) => failure.lines.length > 0),
    shared,
  };
  return evidence.failures.length > 0 || evidence.shared.length > 0 ? evidence : null;
}

/** The prompt section for `evidence`: excerpts, then the shared-failure warning. */
export function evidenceSection(evidence: FixEvidence | null, branch: string): string {
  if (!evidence) return '';
  let section = '';
  if (evidence.failures.length > 0) {
    section += '## Failure Evidence (sanitized)\n\n';
    for (const failure of evidence.failures) {
      section += `### ${failure.checkName}${failure.jobUrl ? ` (${failure.jobUrl})` : ''}\n\n\`\`\`\n${failure.lines.join('\n')}\n\`\`\`\n\n`;
    }
  }
  for (const group of evidence.shared) {
    const where = [
      group.prNumbers.length > 0 ? group.prNumbers.map((n) => `#${n}`).join(', ') : null,
      group.onDefaultBranch ? `on ${branch}` : null,
    ]
      .filter(Boolean)
      .join(' and ');
    section += `## Shared Failure\n\n"${group.title}" also appears in ${where}. It is probably not caused by this branch. Confirm that before changing code here, and don't rerun or skip checks.${group.owner ? ` ${group.owner} already investigates it.` : ''}\n\n`;
  }
  return section;
}

/** The occurrences an investigation can include, newest first, one per PR or default-branch run. */
export function investigationCandidates(detail: CiGroupDetail): CiOccurrenceDetail[] {
  const seen = new Set<string>();
  return [...detail.occurrences]
    .sort((a, b) => failedAt(b).localeCompare(failedAt(a)))
    .filter((o) => {
      const key =
        o.occurrence.prNumber !== null
          ? `pr:${o.occurrence.prNumber}`
          : `run:${o.occurrence.runId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function occurrenceLine(detail: CiOccurrenceDetail, owner: string, repo: string): string {
  const o = detail.occurrence;
  const where =
    o.prNumber !== null
      ? `PR #${o.prNumber} (https://github.com/${owner}/${repo}/pull/${o.prNumber})`
      : `default branch run #${o.runNumber ?? o.runId}`;
  const attempt = o.runAttempt && o.runAttempt > 1 ? `, attempt ${o.runAttempt}` : '';
  return `- ${where}: ${o.workflowName ?? 'workflow'} › ${o.jobName}${attempt}, tested ${o.testedSha.slice(0, 7)}${o.htmlUrl ? `, job ${o.htmlUrl}` : ''}`;
}

/** The first message of a group investigation: the evidence picked in the sheet and the rules. */
export function investigationPrompt(
  summary: CiGroupSummary,
  picked: readonly CiOccurrenceDetail[],
  context: { owner: string; repo: string; branch: string; shortId: string },
): string {
  const hypotheses = hypothesesOf(factsOf(summary, context.branch));
  const excerpt = picked
    .map((detail) => {
      const lines = excerptFromSignals(
        detail.signals.filter((s) => s.groupId === summary.id).map((s) => s.signal),
      );
      return lines.length > 0
        ? `From ${detail.occurrence.jobName}:\n\`\`\`\n${lines.join('\n')}\n\`\`\``
        : null;
    })
    .filter(Boolean)
    .slice(0, 3)
    .join('\n\n');
  return [
    `# Investigate a shared CI failure: ${summary.title}`,
    `Repository: ${context.owner}/${context.repo}. BorgDock grouped these failures because their evidence matches; that is not proof of one cause.`,
    `## Where it fails\n\n${picked.map((d) => occurrenceLine(d, context.owner, context.repo)).join('\n')}`,
    hypotheses.length > 0
      ? `## Suggested causes (unproven)\n\n${hypotheses.map((h) => `- ${HYPOTHESIS_LABEL[h.kind]}: ${h.reason}`).join('\n')}`
      : null,
    excerpt ? `## Evidence (sanitized)\n\n${excerpt}` : null,
    [
      '## How to work',
      '',
      '1. Find the cause. Say whether it is infrastructure, a defect on the base branch, a flaky test, or specific to one branch, and show the evidence.',
      '2. Fix it where the cause lives. A fix for the base branch or shared code goes in its own branch and pull request, not in one of the affected PRs.',
      `3. Put \`BorgDock-CI-Group: ${context.shortId}\` on its own line in the pull request body so BorgDock links the fix to this group.`,
      '4. Never rerun, skip or override required checks, and never push to the affected PRs. Report which PRs need a rerun or a branch update instead.',
    ].join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, PROMPT_LIMIT);
}

/** `BorgDock-CI-Group: <short id>` in a PR body links that PR as a group's fix. */
export const FIX_MARKER = /^BorgDock-CI-Group:\s*([0-9a-f]{8})\s*$/im;

export function shortGroupId(groupId: string): string {
  return groupId.replace(/-/g, '').slice(0, 8);
}
