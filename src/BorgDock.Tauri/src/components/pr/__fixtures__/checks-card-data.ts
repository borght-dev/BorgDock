// The checks hover card's fixtures: the PRs of design/check-hover/mockups.html
// with the CI failure store's answer for them. Plain data, shared by the unit
// tests and the stories.

import { makeSignal } from '@/services/ci-failures/__fixtures__/evidence';
import { makeDetail, makeGroup } from '@/services/ci-failures/__fixtures__/store';
import type { CiGroupSummary, CiPrFailures } from '@/services/ci-failures/types';
import type { CiJob, PullRequestWithChecks } from '@/types';
import { listPr } from './pr-list-data';

const NOW = Date.parse('2026-10-29T10:00:00Z');
const MIN = 60_000;
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * MIN).toISOString();

function job(id: number, name: string, conclusion: string, workflowName = 'CI'): CiJob {
  return { id, kind: 'actions', name, workflowName, runId: 9100, conclusion, completedAt: at(18) };
}

const PASSED = [
  'lint',
  'typecheck',
  'test (windows)',
  'build-web',
  'storybook',
  'unit (api)',
  'unit (mobile)',
  'contract tests',
  'migrations',
  'bundle size',
  'a11y',
  'docs',
  'i18n',
  'sql lint',
];

/** #4812: two failing (a vitest assertion and a build error master shares), one running. */
export function failingPr(): PullRequestWithChecks {
  const base = listPr(
    {
      number: 4812,
      title: 'Planboard: keep drag preview inside the resource lane',
      repo: 'Gomocha-FLOW/FSP',
      checks: { total: 20, fail: 2, run: 1, skip: 3 },
    },
    NOW,
  );
  return {
    ...base,
    pullRequest: { ...base.pullRequest, headSha: 'a41f9c2d77e0', baseRef: 'master' },
    failedCheckNames: ['test (ubuntu-latest, node 22)', 'build-api'],
    pendingCheckNames: ['e2e (chromium)'],
    ciJobs: [
      job(501, 'test (ubuntu-latest, node 22)', 'failure'),
      job(502, 'build-api', 'failure', 'Backend'),
      ...PASSED.map((name, i) => job(600 + i, name, 'success')),
      job(701, 'deploy-preview', 'skipped'),
      job(702, 'visual-regression', 'skipped'),
      job(703, 'release', 'skipped'),
    ],
  };
}

/** The store's answer for #4812: parsed signals for both failed jobs. */
export function failingPrFailures(): CiPrFailures {
  return {
    occurrences: [
      makeDetail(
        {
          id: 'occ-501',
          jobId: 501,
          jobName: 'test (ubuntu-latest, node 22)',
          prNumber: 4812,
          testedSha: 'a41f9c2d77e0',
          failedStep: 'Run vitest',
          startedAt: at(22.2),
          completedAt: at(18),
          htmlUrl: 'https://github.com/Gomocha-FLOW/FSP/actions/runs/1/job/501',
        },
        [
          {
            signal: makeSignal({
              kind: 'summary',
              parser: 'vitest',
              message: '3 failed, 412 passed',
            }),
            groupId: null,
          },
          {
            signal: makeSignal({
              kind: 'test',
              parser: 'vitest',
              testId: 'PlanBoard › drag preview › clamps to the last lane',
              errorClass: 'AssertionError',
              message: 'expected 412 to be 380',
              expected: '380',
              actual: '412',
              path: 'src/planboard/drag-preview.test.ts',
              line: 88,
            }),
            groupId: null,
          },
          {
            signal: makeSignal({
              kind: 'test',
              parser: 'vitest',
              testId: 'Lane › scrolled › keeps offset',
              message: 'expected 0 to be 120',
            }),
            groupId: null,
          },
          {
            signal: makeSignal({
              kind: 'test',
              parser: 'vitest',
              testId: 'Lane › last › drop target',
              message: 'expected undefined to be defined',
            }),
            groupId: null,
          },
        ],
      ),
      makeDetail(
        {
          id: 'occ-502',
          jobId: 502,
          jobName: 'build-api',
          workflowName: 'Backend',
          prNumber: 4812,
          testedSha: 'a41f9c2d77e0',
          failedStep: 'dotnet build',
          startedAt: at(20.05),
          completedAt: at(18),
        },
        [
          {
            signal: makeSignal({
              kind: 'compile',
              parser: 'msbuild',
              code: 'CS0246',
              message: "The type or namespace name 'IClock' could not be found",
              path: 'Fsp.Api/Planning/SlotService.cs',
              line: 14,
            }),
            groupId: 'g-iclock',
          },
        ],
      ),
    ],
    groups: [sharedGroup()],
  };
}

/** The build error #4812 shares with master. */
export function sharedGroup(): CiGroupSummary {
  return makeGroup({
    id: 'g-iclock',
    scope: 'github.com||gomocha-flow/fsp',
    title: "CS0246 The type or namespace name 'IClock' could not be found",
    classification: 'base-branch',
    status: 'active',
    firstObservedAt: at(180),
    lastObservedAt: at(18),
    prNumbers: [4812, 4790],
    defaultBranchRuns: [881],
    prJobIds: [502],
    maxTier: 'high',
    claim: null,
  });
}

/** #4801: nothing failed, two still running. */
export function runningPr(): PullRequestWithChecks {
  const base = listPr(
    {
      number: 4801,
      title: 'Invoices: export credit notes to Exact',
      repo: 'Gomocha-FLOW/FSP',
      author: 'mjansen',
      checks: { total: 19, run: 2, skip: 1 },
    },
    NOW,
  );
  return {
    ...base,
    pullRequest: { ...base.pullRequest, headSha: '7c02be1aa903' },
    pendingCheckNames: ['e2e (chromium)', 'SonarCloud Code Analysis'],
    ciJobs: [
      ...[
        'lint',
        'typecheck',
        'test (ubuntu, node 22)',
        'test (windows)',
        'build-api',
        'build-web',
        ...PASSED.slice(4),
        'storybook',
        'unit (api)',
      ]
        .slice(0, 16)
        .map((name, i) => job(800 + i, name, 'success')),
      job(899, 'release', 'skipped'),
    ],
  };
}
