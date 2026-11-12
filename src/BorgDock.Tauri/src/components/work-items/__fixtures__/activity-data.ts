// The Activity tab's sample history: AB#4127 from the design mockup
// (design/work-item-detail/mockups.html, frame B). Made-up people and
// places: the repository is public.

import type { WorkItemComment, WorkItemUpdate } from '@/types';

const DANA = { displayName: 'Dana Reyes', uniqueName: 'dana@acme.example' };
const VERA = { displayName: 'Vera', uniqueName: 'vera@acme.example' };

/** A local time `daysAgo` days before `now`, at `hh:mm`, as ISO. */
export function localAt(now: number, daysAgo: number, hh: number, mm: number): string {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysAgo, hh, mm).toISOString();
}

export const SAMPLE_PROOF = '481c5a2a30ba629b2b3df2a0c06b75e7a9c1d2e3f40516273849506172bbbb';

export function activityUpdates(now: number): WorkItemUpdate[] {
  return [
    {
      id: 1,
      rev: 1,
      revisedBy: DANA,
      revisedDate: localAt(now, 7, 10, 2),
      fields: {
        'System.WorkItemType': { newValue: 'Bug' },
        'System.State': { newValue: 'New' },
        'System.Title': {
          newValue: 'Portal | Holiday timeplan not visible in technician schedule',
        },
        'System.Tags': { newValue: 'portal' },
        'System.ChangedDate': { newValue: localAt(now, 7, 10, 2) },
      },
    },
    {
      id: 2,
      rev: 2,
      revisedBy: DANA,
      revisedDate: localAt(now, 7, 10, 20),
      fields: {
        'Microsoft.VSTS.Common.Severity': { oldValue: '3 - Low', newValue: '2 - Not Critical' },
        'System.Tags': { oldValue: 'portal', newValue: 'portal; northwind' },
        'System.ChangedDate': { newValue: localAt(now, 7, 10, 20) },
        'System.Rev': { oldValue: 1, newValue: 2 },
      },
    },
    {
      id: 3,
      rev: 3,
      revisedBy: DANA,
      revisedDate: localAt(now, 7, 10, 25),
      relations: {
        added: [
          {
            rel: 'System.LinkTypes.Hierarchy-Reverse',
            url: 'https://dev.azure.com/acme/_apis/wit/workItems/3980',
            attributes: { isLocked: false, name: 'Parent' },
          },
        ],
      },
    },
    {
      id: 4,
      rev: 4,
      revisedBy: VERA,
      revisedDate: localAt(now, 5, 9, 0),
      fields: {
        'System.State': { oldValue: 'New', newValue: 'Development In Progress' },
        'System.AssignedTo': { newValue: { displayName: 'Vera' } },
        'System.Reason': { oldValue: 'New', newValue: 'Work started' },
        'System.ChangedDate': { newValue: localAt(now, 5, 9, 0) },
      },
    },
    {
      id: 5,
      rev: 5,
      revisedBy: VERA,
      revisedDate: localAt(now, 0, 9, 10),
      relations: {
        added: [
          {
            rel: 'ArtifactLink',
            url: 'vstfs:///GitHub/PullRequest/0c3a1f2e-7b4d-4c55-9a1e-acme00000001%2F812',
            attributes: { name: 'GitHub Pull Request' },
          },
        ],
      },
    },
    {
      id: 6,
      rev: 6,
      revisedBy: VERA,
      revisedDate: localAt(now, 0, 9, 12),
      fields: {
        'System.State': { oldValue: 'Development In Progress', newValue: 'Code Review' },
        'System.ChangedDate': { newValue: localAt(now, 0, 9, 12) },
        'Microsoft.VSTS.Common.StateChangeDate': { newValue: localAt(now, 0, 9, 12) },
      },
    },
  ];
}

function comment(
  id: number,
  by: { displayName: string; uniqueName?: string },
  at: string,
  text: string,
): WorkItemComment {
  return { id, text, createdBy: by, createdDate: at, modifiedDate: at };
}

export function activityComments(now: number): WorkItemComment[] {
  return [
    comment(
      101,
      DANA,
      localAt(now, 7, 10, 30),
      '<p>Copied with all attachments and links from AB#4125. Customer confirmed it also happens for technicians created before the migration.</p>',
    ),
    comment(
      102,
      VERA,
      localAt(now, 6, 8, 0),
      'Vera · plan — claimed; fetching the item and investigating the codebase to draft a plan.',
    ),
    comment(
      103,
      VERA,
      localAt(now, 6, 14, 0),
      'Vera · plan — plan published to plans.example.com/AB4127, decisions resolved with rationale.',
    ),
    comment(
      104,
      VERA,
      localAt(now, 5, 8, 30),
      `<p>Vera · plan-verify — GATE-REPAIR proof=${SAMPLE_PROOF} — Mechanical citation repair only; no semantic gaps found.</p><p>The "What exists today" row cites GetWeeklyOverview.cs:304, but that file has 171 lines at 8ac5076b. The cited reads are at :64–81 (calendar entries) and :114–119 (debug log). Change the citation to GetWeeklyOverview.cs:64-81, republish the pair and route it back to plan verification.</p>`,
    ),
    comment(
      105,
      VERA,
      localAt(now, 5, 11, 0),
      'Vera · plan-verify — plan verified: every decision has a test and every citation resolves.',
    ),
    comment(
      106,
      VERA,
      localAt(now, 4, 9, 0),
      'Vera · dev — implementation started on fix/4127-schedules-show-holidays.',
    ),
    comment(
      107,
      VERA,
      localAt(now, 2, 16, 0),
      'Vera · tests — API integration test, page unit tests and an @AB4127 Playwright reproducer pass.',
    ),
    comment(
      108,
      VERA,
      localAt(now, 0, 9, 8),
      'Vera · pr — opened #812 and moved the item to Code Review.',
    ),
  ];
}
