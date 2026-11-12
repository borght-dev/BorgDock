import { describe, expect, it } from 'vitest';
import type { WorkItem } from '@/types';
import type { AdoFieldMeta } from '../fields';
import { buildFormModel, typeFactKey } from '../form-model';
import { normalizeLayout } from '../layout';

function item(fields: Record<string, unknown>, relations: WorkItem['relations'] = []): WorkItem {
  return { id: 4127, rev: 1, url: '', htmlUrl: '', relations, fields };
}

const defs = new Map<string, AdoFieldMeta>([
  [
    'System.Description',
    { referenceName: 'System.Description', name: 'Description', type: 'html', readOnly: false },
  ],
  [
    'Custom.Request',
    { referenceName: 'Custom.Request', name: 'Request', type: 'html', readOnly: false },
  ],
  [
    'Custom.Contract',
    { referenceName: 'Custom.Contract', name: 'Contract', type: 'string', readOnly: true },
  ],
  [
    'Microsoft.VSTS.Scheduling.DueDate',
    {
      referenceName: 'Microsoft.VSTS.Scheduling.DueDate',
      name: 'Due Date',
      type: 'dateTime',
      readOnly: false,
    },
  ],
]);

const requestLayout = normalizeLayout({
  pages: [
    {
      id: 'p-details',
      label: 'Details',
      pageType: 'custom',
      sections: [
        {
          id: 'Section1',
          groups: [
            {
              label: 'Request',
              controls: [{ id: 'Custom.Request', controlType: 'HtmlFieldControl' }],
            },
            {
              label: 'Agreed Response',
              controls: [{ id: 'Custom.Agreed', controlType: 'HtmlFieldControl' }],
            },
            { label: 'Notes', controls: [{ id: 'Custom.Ticket', controlType: 'FieldControl' }] },
          ],
        },
        {
          id: 'Section2',
          groups: [
            {
              label: 'Contract',
              controls: [
                { id: 'Custom.Contract', label: 'Contract no.', controlType: 'FieldControl' },
                { id: 'Custom.Tier', controlType: 'FieldControl' },
                { id: 'System.AssignedTo', controlType: 'FieldControl' },
              ],
            },
            {
              label: 'Schedule',
              controls: [
                { id: 'Microsoft.VSTS.Scheduling.DueDate', controlType: 'DateTimeControl' },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'p-sla',
      label: 'SLA',
      pageType: 'custom',
      sections: [
        {
          groups: [
            { label: 'SLA', controls: [{ id: 'Custom.SlaHours', controlType: 'FieldControl' }] },
          ],
        },
      ],
    },
    {
      id: 'p-empty',
      label: 'Empty page',
      pageType: 'custom',
      sections: [
        {
          groups: [
            { label: 'X', controls: [{ id: 'Custom.Nothing', controlType: 'FieldControl' }] },
          ],
        },
      ],
    },
  ],
});

describe('buildFormModel with a layout', () => {
  const request = item({
    'System.WorkItemType': 'Customer Request',
    'System.AssignedTo': { displayName: 'Dana Reyes' },
    'Custom.Request': '<p>Payroll needs the approved holidays as a CSV.</p>',
    'Custom.Ticket': 'SUP-20418',
    'Custom.Contract': 'C-2291',
    'Custom.SlaHours': 8,
    'Microsoft.VSTS.Scheduling.DueDate': '2026-11-14T00:00:00Z',
  });
  const form = buildFormModel(request, requestLayout, defs);

  it('makes a tab of every custom page that has something, Details first', () => {
    expect(form.fromLayout).toBe(true);
    expect(form.tabs.map((t) => [t.id, t.label])).toEqual([
      ['details', 'Details'],
      ['p-sla', 'SLA'],
    ]);
  });

  it('puts long text in the main column in layout order and offers the empty ones', () => {
    const [details] = form.tabs;
    expect(details!.html.map((b) => b.label)).toEqual(['Request']);
    expect(details!.emptyHtml.map((f) => f.label)).toEqual(['Agreed Response']);
    expect(details!.plain.map((f) => [f.label, f.text])).toEqual([['Ticket', 'SUP-20418']]);
  });

  it("names rail groups as ADO does and keeps the header's facts out of them", () => {
    const contract = form.tabs[0]!.groups.find((g) => g.label === 'Contract')!;
    expect(contract.fields.map((f) => [f.label, f.text, f.readOnly])).toEqual([
      ['Contract no.', 'C-2291', true],
    ]);
    expect(contract.empty.map((f) => f.key)).toEqual(['Custom.Tier']);
    expect(contract.custom).toBe(true);
  });

  it('takes the due date as the type fact when the type has no severity or effort', () => {
    expect(form.typeFact?.key).toBe('Microsoft.VSTS.Scheduling.DueDate');
    // …and the rail leaves it out: the Schedule group has nothing else.
    expect(form.tabs[0]!.groups.some((g) => g.label === 'Schedule')).toBe(false);
  });
});

describe('typeFactKey', () => {
  it('picks the first of Severity, Effort, Story Points, Due date the type has', () => {
    expect(
      typeFactKey(
        item({
          'Microsoft.VSTS.Scheduling.Effort': 5,
          'Microsoft.VSTS.Common.Severity': '2 - High',
        }),
        null,
      ),
    ).toBe('Microsoft.VSTS.Common.Severity');
    expect(typeFactKey(item({ 'Microsoft.VSTS.Scheduling.StoryPoints': 3 }), null)).toBe(
      'Microsoft.VSTS.Scheduling.StoryPoints',
    );
    expect(typeFactKey(item({}), null)).toBeNull();
  });
});

describe('buildFormModel without a layout', () => {
  it('falls back to one Details tab: well-known long text first, the rest in one group', () => {
    const form = buildFormModel(
      item(
        {
          'System.WorkItemType': 'Bug',
          'System.Title': 'x',
          'Microsoft.VSTS.TCM.ReproSteps': '<ol><li>Open</li></ol>',
          'System.Description': '<p>About</p>',
          'System.AreaPath': 'Acme\\Portal',
          'System.ChangedDate': '2026-11-11T09:00:00Z',
          'Microsoft.VSTS.Common.Severity': '3 - Medium',
        },
        [
          {
            rel: 'System.LinkTypes.Hierarchy-Reverse',
            url: 'https://x/_apis/wit/workItems/3980',
            attributes: {},
          },
          { rel: 'ArtifactLink', url: 'vstfs:///GitHub/PullRequest/abc%2f812', attributes: {} },
        ],
      ),
      null,
      null,
    );
    expect(form.fromLayout).toBe(false);
    const [tab] = form.tabs;
    expect(tab!.html.map((b) => b.key)).toEqual([
      'System.Description',
      'Microsoft.VSTS.TCM.ReproSteps',
    ]);
    expect(tab!.groups.map((g) => g.kind)).toEqual(['fields', 'development', 'related']);
    expect(tab!.groups[0]!.fields.map((f) => f.key)).toEqual(['System.AreaPath']);
    expect(form.typeFact?.key).toBe('Microsoft.VSTS.Common.Severity');
  });
});
