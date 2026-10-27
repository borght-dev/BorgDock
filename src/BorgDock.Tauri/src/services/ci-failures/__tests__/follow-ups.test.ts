import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/ci-failures/store-api', () => ({}));
vi.mock('@/generated/commands', () => ({ commands: {} }));

import type { AgentThread } from '@/services/dispatch/types';
import type { PullRequestWithChecks } from '@/types';
import { makeClaim, makeDetail, makeGroup } from '../__fixtures__/store';
import { comparePrompt, parseVerdict } from '../compare';
import { CiEventTracker, eventsBetween } from '../events';
import { suggestedFixes } from '../fixes';
import {
  evidenceSection,
  FIX_MARKER,
  investigationPrompt,
  PROMPT_LIMIT,
  shortGroupId,
} from '../prompts';
import { rerunTargets } from '../rerun';
import { hashesInBody, markerOf } from '../tracking';

function pr(
  number: number,
  overrides: Partial<PullRequestWithChecks> = {},
  body = '',
): PullRequestWithChecks {
  return {
    pullRequest: {
      number,
      title: `PR ${number}`,
      headRef: `b${number}`,
      baseRef: 'master',
      authorLogin: 'me',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '',
      updatedAt: '',
      isDraft: false,
      htmlUrl: `https://github.com/acme/app/pull/${number}`,
      body,
      repoOwner: 'acme',
      repoName: 'app',
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      commitCount: 1,
      requestedReviewers: [],
    },
    overallStatus: 'red',
    failedCheckNames: [],
    failedCheckSuiteIds: [],
    pendingCheckNames: [],
    passedCount: 0,
    skippedCount: 0,
    totalCheckCount: 0,
    ...overrides,
  } as PullRequestWithChecks;
}

describe('events', () => {
  const context = { threshold: 3, ownerStale: () => false, now: new Date('2026-10-26T12:00:00Z') };

  it('says once that a shared unowned failure reached the threshold', () => {
    const two = makeGroup({ prNumbers: [1, 2] });
    const three = makeGroup({ prNumbers: [1, 2, 3], revision: 2 });
    expect(eventsBetween([two], [three], context).map((e) => e.kind)).toEqual(['group-grew']);
    expect(eventsBetween([three], [{ ...three, prNumbers: [1, 2, 3, 4] }], context)).toEqual([]);
    expect(eventsBetween([two], [{ ...three, claim: makeClaim() }], context)).toEqual([]);
  });

  it('notices a merged fix and a failure that came back', () => {
    const fixed = makeGroup({ prNumbers: [1, 2], fixPr: 'u', fixMergedAt: '2026-10-26T10:30:00Z' });
    expect(
      eventsBetween([makeGroup({ prNumbers: [1, 2] })], [fixed], context).map((e) => e.kind),
    ).toEqual(['fix-merged']);
    const back = { ...fixed, lastObservedAt: '2026-10-26T11:00:00Z' };
    expect(eventsBetween([fixed], [back], context).map((e) => e.kind)).toEqual(['seen-after-fix']);
  });

  it('treats the first snapshot as the baseline and never repeats an event', () => {
    const tracker = new CiEventTracker();
    const two = makeGroup({ prNumbers: [1, 2] });
    const three = makeGroup({ prNumbers: [1, 2, 3] });
    expect(tracker.update([three], context)).toEqual([]);
    expect(tracker.update([three], context)).toEqual([]);
    const later = new CiEventTracker();
    later.update([two], context);
    expect(later.update([three], context).map((e) => e.id)).toEqual(['g1:group-grew:3']);
    later.update([two], context);
    expect(later.update([three], context)).toEqual([]);
  });
});

describe('prompts', () => {
  it('warns the fix agent about a shared failure and carries sanitized excerpts', () => {
    const section = evidenceSection(
      {
        failures: [
          {
            checkName: 'e2e',
            lines: ['checkout › pays', 'Expected 200'],
            jobUrl: 'https://x/job/1',
          },
        ],
        shared: [
          {
            title: 'checkout › pays',
            prNumbers: [12, 15],
            onDefaultBranch: true,
            owner: 'T3 · CI: x',
          },
        ],
      },
      'master',
    );
    expect(section).toContain('### e2e (https://x/job/1)');
    expect(section).toContain('also appears in #12, #15 and on master');
    expect(section).toContain("don't rerun or skip checks");
    expect(evidenceSection(null, 'master')).toBe('');
  });

  it('writes an investigation prompt with the rules and the fix marker, within the limit', () => {
    const detail = makeDetail({ prNumber: 4 });
    const summary = makeGroup({ id: '0f3c2a9e-1111-2222-3333-444455556666', prNumbers: [4, 5] });
    const text = investigationPrompt(summary, [detail], {
      owner: 'acme',
      repo: 'app',
      branch: 'master',
      shortId: shortGroupId(summary.id),
    });
    expect(text).toContain('PR #4 (https://github.com/acme/app/pull/4)');
    expect(text).toContain('BorgDock-CI-Group: 0f3c2a9e');
    expect(text).toContain('Never rerun, skip or override required checks');
    expect(text.length).toBeLessThanOrEqual(PROMPT_LIMIT);
    expect(FIX_MARKER.exec('Fixes it.\n\nBorgDock-CI-Group: 0f3c2a9e\n')?.[1]).toBe('0f3c2a9e');
  });
});

describe('compare', () => {
  it('reads the verdict out of the reply', () => {
    expect(parseVerdict('Sure! {"same": true, "reason": "Both hit the DNS outage"}')).toEqual({
      same: true,
      reason: 'Both hit the DNS outage',
    });
    expect(parseVerdict('no idea')).toBeNull();
    expect(parseVerdict('{"same": "yes"}')).toBeNull();
  });

  it('sends only the sanitized excerpts of each group', () => {
    const a = {
      summary: makeGroup({ id: 'g1', title: 'A' }),
      occurrences: [makeDetail({}, [{ groupId: 'g1' }])],
      candidates: [],
      decisions: [],
      claimEvents: [],
    };
    const b = {
      summary: makeGroup({ id: 'g2', title: 'B' }),
      occurrences: [makeDetail({ id: 'x#job:2' }, [{ groupId: 'g2' }])],
      candidates: [],
      decisions: [],
      claimEvents: [],
    };
    const prompt = comparePrompt(a, b);
    expect(prompt).toContain('Group A: A');
    expect(prompt).toContain('Expected 200');
    expect(prompt).toContain('Answer with only a JSON object');
  });
});

describe('rerunTargets', () => {
  it('names the open PRs still red with the group’s jobs and their workflow runs', () => {
    const detail = {
      summary: makeGroup({ prNumbers: [1, 2, 3] }),
      occurrences: [makeDetail({ jobName: 'e2e (chromium)' })],
      candidates: [],
      decisions: [],
      claimEvents: [],
    };
    const red = pr(1, {
      ciJobs: [{ id: 7, kind: 'actions', name: 'e2e (firefox)', runId: 70, conclusion: 'failure' }],
    });
    const green = pr(2, {
      ciJobs: [
        { id: 8, kind: 'actions', name: 'e2e (chromium)', runId: 80, conclusion: 'success' },
      ],
    });
    const other = pr(9, {
      ciJobs: [{ id: 9, kind: 'actions', name: 'e2e', runId: 90, conclusion: 'failure' }],
    });
    const targets = rerunTargets(detail, [red, green, other]);
    expect(targets.map((t) => [t.pr.pullRequest.number, t.workflowRunIds])).toEqual([[1, [70]]]);
    expect(targets[0]?.checks[0]?.htmlUrl).toBe(
      'https://github.com/acme/app/actions/runs/70/job/7',
    );
  });
});

describe('suggestedFixes', () => {
  it('links a PR that names the group, or the owner thread’s PR that isn’t affected', () => {
    const group = makeGroup({ id: '0f3c2a9e-aaaa', prNumbers: [1, 2] });
    const marked = pr(30, {}, 'Fix\n\nBorgDock-CI-Group: 0f3c2a9e');
    expect(suggestedFixes([group], [marked], [])).toEqual([
      { group, url: 'https://github.com/acme/app/pull/30' },
    ]);
    const owned = makeGroup({
      id: 'g9',
      prNumbers: [1, 2],
      claim: makeClaim({ ownerKind: 't3', ownerRef: 'local:t1' }),
    });
    const threads = [
      {
        id: 'local:t1',
        pullRequests: [
          { number: 1, url: 'affected' },
          { number: 40, url: 'https://github.com/acme/app/pull/40' },
        ],
      },
    ] as unknown as AgentThread[];
    expect(suggestedFixes([owned], [], threads)).toEqual([
      { group: owned, url: 'https://github.com/acme/app/pull/40' },
    ]);
  });
});

describe('tracking marker', () => {
  it('round-trips hashes and never carries evidence', () => {
    const body = `Some text\n\n${markerOf(['abc123', 'def456'])}`;
    expect(hashesInBody(body)).toEqual(['abc123', 'def456']);
    expect(markerOf(['abc'])).not.toMatch(/checkout|Expected/);
    expect(hashesInBody('no marker')).toEqual([]);
  });
});
