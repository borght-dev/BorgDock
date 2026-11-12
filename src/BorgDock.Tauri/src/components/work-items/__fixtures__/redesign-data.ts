// src/components/work-items/__fixtures__/redesign-data.ts
//
// The sample of design/work-item-detail/mockups.html: AB#4127, a Bug filed
// from a customer email, with its process layout, field definitions, pull
// request, agent thread and linked items. Made-up data only (the repository
// is public): Acme, Northwind Foods, Dana Reyes, Sam Peeters, Vera.

import type { AdoFieldMeta, AdoFieldType } from '@/services/ado/fields';
import { normalizeLayout, type ProcessLayout } from '@/services/ado/layout';
import type { WorkItemTypeMeta } from '@/services/ado/work-item-types';
import type { ItemOverview, Overview } from '@/services/dispatch/types';
import type { WorkItem } from '@/types';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** A small "screenshot" of a week schedule with one day missing, as an inline SVG. */
const SCREENSHOT = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240" viewBox="0 0 480 240">
  <rect width="480" height="240" fill="#f6f7f9"/>
  <rect x="16" y="14" width="120" height="12" rx="3" fill="#c9cdf6"/>
  <rect x="144" y="14" width="60" height="12" rx="3" fill="#dfe2e8"/>
  <rect x="212" y="14" width="60" height="12" rx="3" fill="#dfe2e8"/>
  ${[0, 1, 2, 3, 4, 5, 6]
    .map((d) =>
      [0, 1]
        .map((r) => {
          const x = 16 + d * 64;
          const y = 40 + r * 96;
          const missing = d === 2 && r === 0;
          const work = d < 5;
          return `<rect x="${x}" y="${y}" width="58" height="88" rx="4" fill="${missing ? '#fde9ed' : '#ffffff'}" stroke="${missing ? '#f2b8c2' : '#e3e6eb'}"/>${
            work && !missing
              ? `<rect x="${x + 6}" y="${y + 22}" width="46" height="30" rx="4" fill="#9db8f2"/>`
              : ''
          }`;
        })
        .join(''),
    )
    .join('')}
</svg>`,
)}`;

/** `YYYY-MM-DD` of `daysAgo` days before `now`, in local time. */
function dateOf(now: number, daysAgo: number): string {
  const d = new Date(now - daysAgo * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function redesignBug(now: number = Date.now()): WorkItem {
  const at = (ms: number) => new Date(now - ms).toISOString();
  return {
    id: 4127,
    rev: 41,
    url: 'https://dev.azure.com/acme/portal/_apis/wit/workItems/4127',
    htmlUrl: 'https://dev.azure.com/acme/portal/_workitems/edit/4127',
    relations: [
      {
        rel: 'ArtifactLink',
        url: 'vstfs:///GitHub/PullRequest/0f3c1e5a-1111-2222-3333-444455556666%2f812',
        attributes: { name: 'GitHub Pull Request' },
      },
      {
        rel: 'ArtifactLink',
        url: 'vstfs:///Git/Ref/acme%2Ffield-portal%2FGBfix%2F4127-schedules-show-holidays',
        attributes: { name: 'Branch' },
      },
      ...[
        'a1b2c3d',
        'b2c3d4e',
        'c3d4e5f',
        'd4e5f60',
        'e5f6071',
        'f607182',
        '0718293',
        '18293a4',
        '293a4b5',
        '3a4b5c6',
      ].map((sha) => ({
        rel: 'ArtifactLink',
        url: `vstfs:///Git/Commit/acme%2Ffield-portal%2F${sha}`,
        attributes: { name: 'Fixed in Commit' },
      })),
      {
        rel: 'System.LinkTypes.Hierarchy-Reverse',
        url: 'https://dev.azure.com/acme/_apis/wit/workItems/3980',
        attributes: { name: 'Parent' },
      },
      {
        rel: 'System.LinkTypes.Related',
        url: 'https://dev.azure.com/acme/_apis/wit/workItems/4125',
        attributes: { name: 'Related' },
      },
      {
        rel: 'AttachedFile',
        url: 'https://dev.azure.com/acme/_apis/wit/attachments/aa11',
        attributes: { id: 'aa11', name: 'image.png', resourceSize: 184_220 },
      },
    ],
    fields: {
      'System.Id': 4127,
      'System.WorkItemType': 'Bug',
      'System.Title': 'Portal | Holiday timeplan not visible in technician schedule',
      'System.State': 'Code Review',
      'System.AreaPath': 'Acme\\Acme Portal\\Schedules',
      'System.IterationPath': 'Acme\\Release 5.2.10',
      'System.Tags': 'autoship; portal; northwind',
      'System.CreatedBy': { displayName: 'Dana Reyes', uniqueName: 'dana@example.com' },
      'System.CreatedDate': at(5 * DAY),
      'System.ChangedBy': { displayName: 'Vera', uniqueName: 'vera@example.com' },
      'System.ChangedDate': at(4 * HOUR),
      'System.CommentCount': 35,
      'Microsoft.VSTS.Common.Priority': 2,
      'Microsoft.VSTS.Common.Severity': '2 - Not Critical',
      'Microsoft.VSTS.Scheduling.Effort': 3,
      'Microsoft.VSTS.Common.BacklogPriority': 1999915,
      'Microsoft.VSTS.Build.FoundIn': '5.2.9',
      'Custom.Customer': 'Northwind Foods',
      'Custom.Contact': 'Sam Peeters',
      'Custom.Ticket': 'SUP-20418',
      'Custom.ReportedVia': 'Email',
      'Custom.AutoshipRun': 'run-2026-11-07-4127',
      'Custom.GateStatus': 'Passed',
      'System.Description':
        '<div>' +
        '<p><b>CAUTION:</b> This email originated from outside of the organization. Do not click links or open attachments unless you recognize the sender and know the content is safe.</p>' +
        '<p>Hi Support Team,</p>' +
        '<p>I noticed that the Holiday Timeplan is not visible in the schedule settings in the new portal. The schedule was added after the technician was created in the new portal.</p>' +
        `<p><img src="${SCREENSHOT}" alt="image.png" width="480" height="240"></p>` +
        '<p><img src="cid:image002.png@01DB2A"></p>' +
        '<p>&nbsp;</p><p>&nbsp;</p>' +
        '<p>Kind regards,</p>' +
        '<p>Sam Peeters</p><p>IT Support Coordinator</p><p>+32 00 000 00 00</p>' +
        '<p><img src="cid:image003.png@01DB2A" width="120" height="32"><img src="cid:image004.png@01DB2A" width="24" height="24"><img src="cid:image005.png@01DB2A" width="24" height="24"><img src="cid:image006.png@01DB2A" width="24" height="24"></p>' +
        '</div>',
      'Microsoft.VSTS.TCM.ReproSteps':
        '<p>In the legacy portal, the technician’s schedule shows the configured Holiday Timeplan next to the regular schedule. In the new portal, Resource Management → Schedules doesn’t show it.</p>' +
        '<ol>' +
        '<li>Open the legacy portal → <b>Rosters</b>.</li>' +
        '<li>Select the affected technician. The Holiday Timeplan is visible.</li>' +
        '<li>Open the new portal → <b>Resource Management → Schedules</b>.</li>' +
        '<li>Select the same technician.</li>' +
        '<li>Only the regular working schedule shows. The Holiday Timeplan is missing. [FAILED]</li>' +
        '</ol>',
      'Custom.DeveloperNotes':
        `<p>Update (${dateOf(now, 0)}) — Holidays now show in the Schedules weekly overview</p>` +
        '<p>What was wrong: A holiday linked to a technician in Master Data never reached the weekly overview. That day read "No schedule".</p>' +
        '<p>What changed: The overview now returns each day’s active holidays. Each one renders as a coloured block, and Current assignments lists them read-only.</p>' +
        '<p>How to test: Link a holiday under Master Data → Holidays, open Schedules for that technician, then step to the holiday’s week.</p>' +
        `<p>Update (${dateOf(now, 3)}) — Plan approved: one response, no new endpoint, active holidays only</p>` +
        '<p>The handler adds the week’s holidays to the existing overview response.</p>' +
        `<p>Update (${dateOf(now, 4)}) — Investigation: the recalculation never writes holidays to the calendar table</p>` +
        '<p>It only removes that day’s working slots, so a linked holiday shows as an unexplained "No schedule".</p>',
      'Custom.AutoshipPlanSummary':
        '<p><b>Root cause:</b> the weekly overview only renders <code>av_calendar</code>, and the recalculation procedure never writes holidays there. It only removes that day’s working slots, so a linked holiday shows as an unexplained "No schedule".</p>' +
        '<p><b>Fix:</b> <code>GetWeeklyOverviewHandler</code> adds the technician’s active, linked holidays for the week to a new <code>DayOverviewDto.SpecialDays</code>. <code>SchedulesPage</code> renders each holiday as a coloured block in its day column and adds a read-only Holidays card to Current assignments. Decisions resolved: one response with no new endpoint; active holidays only; 0/0 and 0/24 count as a whole day; existing translation keys are reused; availability and the recalculation are unchanged.</p>' +
        '<p><b>Tests:</b> an API integration test, page unit tests and stories, and an @AB4127 Playwright reproducer that creates and links a holiday through Master Data.</p>' +
        '<p>View the plan in your browser: https://plans.example.com/AB4127-schedules-show-holidays</p>' +
        '<p>Approved pair SHA-256 html=d30fe005e55cc452e35996576e6923b5426d16bd2714b883147adcf2ab78d44 md=8009f13fc105ddc7647e4f69572d4b64afbf42c6a3993bc8e00a8de0dabf6c4</p>',
    },
  };
}

type Control = {
  id?: string;
  label?: string;
  controlType: string;
};

const html = (id: string, label: string) => ({
  label,
  inherited: !id.startsWith('Custom.'),
  controls: [{ id, controlType: 'HtmlFieldControl' }] as Control[],
});
const field = (id: string, label?: string): Control => ({ id, label, controlType: 'FieldControl' });

/** The Bug layout of the made-up "Acme Scrum" process. */
export const REDESIGN_BUG_LAYOUT: ProcessLayout = normalizeLayout({
  pages: [
    {
      id: 'bug-details',
      label: 'Details',
      pageType: 'custom',
      sections: [
        {
          id: 'Section1',
          groups: [
            html('System.Description', 'Description'),
            html('Microsoft.VSTS.TCM.ReproSteps', 'Repro Steps'),
            html('Microsoft.VSTS.TCM.SystemInfo', 'System Info'),
            html('Custom.DeveloperNotes', 'Developer Notes'),
            html('Custom.AutoshipPlanSummary', 'Autoship Plan Summary'),
            html('Custom.Resolution', 'Resolution'),
            html('Custom.AcceptanceTest', 'Acceptance Test'),
          ],
        },
        {
          id: 'Section2',
          groups: [
            {
              id: 'planning',
              label: 'Planning',
              inherited: true,
              controls: [
                field('Microsoft.VSTS.Common.Priority'),
                field('Microsoft.VSTS.Common.Severity'),
                field('Microsoft.VSTS.Scheduling.Effort'),
                field('Microsoft.VSTS.Scheduling.RemainingWork'),
                field('Microsoft.VSTS.Common.BacklogPriority', 'Backlog priority'),
                field('Microsoft.VSTS.Common.ValueArea'),
                field('System.IterationPath'),
              ],
            },
            {
              id: 'classification',
              label: 'Classification',
              inherited: true,
              controls: [
                field('System.AreaPath', 'Area'),
                field('Microsoft.VSTS.Build.FoundIn', 'Found in'),
                field('Microsoft.VSTS.Build.IntegrationBuild', 'Integrated in'),
              ],
            },
          ],
        },
        {
          id: 'Section3',
          groups: [
            {
              id: 'customer',
              label: 'Customer',
              controls: [
                field('Custom.Customer'),
                field('Custom.Contact'),
                field('Custom.Ticket'),
                field('Custom.ReportedVia', 'Reported via'),
              ],
            },
            {
              id: 'development',
              label: 'Development',
              inherited: true,
              controls: [{ controlType: 'LinksControl' }],
            },
            {
              id: 'related',
              label: 'Related Work',
              inherited: true,
              controls: [{ controlType: 'LinksControl' }],
            },
            {
              id: 'deployment',
              label: 'Deployment',
              isContribution: true,
              contribution: { contributionId: 'ms.vss-work-web.work-item-deployments-group' },
            },
          ],
        },
      ],
    },
    {
      id: 'bug-autoship',
      label: 'Autoship',
      pageType: 'custom',
      sections: [
        {
          id: 'Section1',
          groups: [
            {
              id: 'autoship',
              label: 'Autoship',
              controls: [field('Custom.AutoshipRun', 'Run'), field('Custom.GateStatus', 'Gate')],
            },
          ],
        },
      ],
    },
    { id: 'history', label: 'History', pageType: 'history' },
    { id: 'links', label: 'Links', pageType: 'links' },
    { id: 'attachments', label: 'Attachments', pageType: 'attachments' },
  ],
});

const defs: Array<[string, string, AdoFieldType]> = [
  ['System.Description', 'Description', 'html'],
  ['Microsoft.VSTS.TCM.ReproSteps', 'Repro Steps', 'html'],
  ['Microsoft.VSTS.TCM.SystemInfo', 'System Info', 'html'],
  ['Custom.DeveloperNotes', 'Developer Notes', 'html'],
  ['Custom.AutoshipPlanSummary', 'Autoship Plan Summary', 'html'],
  ['Custom.Resolution', 'Resolution', 'html'],
  ['Custom.AcceptanceTest', 'Acceptance Test', 'html'],
  ['Microsoft.VSTS.Common.Priority', 'Priority', 'integer'],
  ['Microsoft.VSTS.Common.Severity', 'Severity', 'string'],
  ['Microsoft.VSTS.Scheduling.Effort', 'Effort', 'double'],
  ['Microsoft.VSTS.Scheduling.RemainingWork', 'Remaining Work', 'double'],
  ['Microsoft.VSTS.Common.BacklogPriority', 'Backlog Priority', 'double'],
  ['Microsoft.VSTS.Common.ValueArea', 'Value Area', 'string'],
  ['System.AreaPath', 'Area Path', 'treePath'],
  ['System.IterationPath', 'Iteration Path', 'treePath'],
  ['Microsoft.VSTS.Build.FoundIn', 'Found In', 'string'],
  ['Microsoft.VSTS.Build.IntegrationBuild', 'Integration Build', 'string'],
  ['Custom.Customer', 'Customer', 'string'],
  ['Custom.Contact', 'Contact', 'string'],
  ['Custom.Ticket', 'Ticket', 'string'],
  ['Custom.ReportedVia', 'Reported Via', 'string'],
  ['Custom.AutoshipRun', 'Autoship Run', 'string'],
  ['Custom.GateStatus', 'Gate Status', 'string'],
  ['System.CreatedBy', 'Created By', 'identity'],
];

export const REDESIGN_FIELD_DEFS: Map<string, AdoFieldMeta> = new Map(
  defs.map(([referenceName, name, type]) => [
    referenceName,
    { referenceName, name, type, readOnly: false },
  ]),
);

export const REDESIGN_TYPES: Map<string, WorkItemTypeMeta> = new Map([
  [
    'Bug',
    {
      name: 'Bug',
      color: '#cc293d',
      icon: 'icon_insect',
      states: [
        { name: 'New', color: '#b2b2b2', category: 'Proposed' },
        { name: 'Code Review', color: '#007acc', category: 'InProgress' },
        { name: 'Done', color: '#339933', category: 'Completed' },
      ],
    },
  ],
  [
    'Customer Request',
    {
      name: 'Customer Request',
      color: '#0e8f8a',
      icon: 'icon_gift',
      states: [{ name: 'Waiting on customer', color: '#d9731a', category: 'InProgress' }],
    },
  ],
]);

/** The parent and the related item of AB#4127, as the related-items read returns them. */
export function redesignRelated(): WorkItem[] {
  const base = (id: number, fields: Record<string, unknown>): WorkItem => ({
    id,
    rev: 1,
    url: '',
    htmlUrl: '',
    relations: [],
    fields,
  });
  return [
    base(3980, {
      'System.WorkItemType': 'Epic',
      'System.Title': 'Schedules in the new portal',
      'System.State': 'Active',
    }),
    base(4125, {
      'System.WorkItemType': 'Bug',
      'System.Title': 'Holiday timeplan not visible (copied)',
      'System.State': 'Closed',
    }),
  ];
}

/** Dispatch's overview with AB#4127: its pull request and the T3 thread waiting on you. */
export function redesignOverview(now: number = Date.now()): Overview {
  const unit = {
    item: { id: 4127, title: 'Portal | Holiday timeplan not visible in technician schedule' },
    bay: 'waiting',
    waitingFor: null,
    suggestion: null,
    pullRequest: null,
    pullRequests: [
      {
        number: 812,
        url: 'https://github.com/acme/field-portal/pull/812',
        state: 'open',
        title: "fix(schedules): show the technician's holidays in the weekly overview",
        isDraft: false,
        branch: 'fix/4127-schedules-show-holidays',
        checks: { passed: 59, failed: 0, pending: 0, total: 59 },
        approved: false,
        mergedAt: null,
        shared: false,
      },
    ],
    threads: [
      {
        id: 'thread-4127',
        hostId: 'local',
        hostLabel: 'This PC',
        available: true,
        projectId: 'p1',
        place: 'fix/4127-schedules-show-holidays',
        title: 'holidays in weekly overview',
        branch: 'fix/4127-schedules-show-holidays',
        createdAt: new Date(now - 5 * DAY).toISOString(),
        lastActivityAt: new Date(now - 26 * HOUR).toISOString(),
        open: true,
        status: 'your-turn',
        interactionMode: 'default',
        model: 'model',
        modelInstance: null,
        effort: null,
        pullRequests: [],
      },
    ],
    queued: false,
    verdict: { label: 'Your turn', tone: 'bad' },
    evidence: [],
    latest: null,
  } as unknown as ItemOverview;
  return {
    generatedAt: new Date(now).toISOString(),
    items: [unit],
    unlinkedThreads: [],
  };
}
