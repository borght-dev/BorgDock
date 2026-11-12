import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkItemDetailDataResult } from '@/hooks/useWorkItemDetailData';
import { toWorkItemDetailData } from '@/hooks/useWorkItemDetailData';
import { buildFormModel } from '@/services/ado/form-model';
import { normalizeLayout } from '@/services/ado/layout';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { WorkItem } from '@/types';
import { WorkItemDetailPanel } from '../WorkItemDetailPanel';

vi.mock('@/hooks/useAdoImageAuth', () => ({ useAdoImageAuth: vi.fn() }));
vi.mock('@/services/ado/workitems', () => ({
  getWorkItemUpdates: vi.fn(async () => []),
  getWorkItems: vi.fn(async () => []),
}));

const ADO = { organization: 'acme', project: 'portal' };

const bug: WorkItem = {
  id: 4127,
  rev: 3,
  url: 'https://dev.azure.com/acme/portal/_apis/wit/workItems/4127',
  htmlUrl: 'https://dev.azure.com/acme/portal/_workitems/edit/4127',
  relations: [],
  fields: {
    'System.WorkItemType': 'Bug',
    'System.Title': 'Holiday timeplan not visible in technician schedule',
    'System.State': 'Code Review',
    'System.AreaPath': 'Acme\\Portal\\Schedules',
    'System.IterationPath': 'Acme\\Release 5.2.10',
    'System.Tags': 'autoship; portal',
    'Microsoft.VSTS.Common.Priority': 2,
    'Microsoft.VSTS.Common.Severity': '2 - Not Critical',
    'Microsoft.VSTS.Scheduling.Effort': 3,
    'Custom.Customer': 'Northwind Foods',
    'System.Description':
      '<div><p><b>CAUTION:</b> This email originated from outside of the organization.</p>' +
      '<p>Hi Support Team,</p><p>The Holiday Timeplan is not visible in the new portal.</p>' +
      '<p>Kind regards,</p><p>Sam Peeters</p><p>IT Support Coordinator</p></div>',
    'Custom.DeveloperNotes':
      '<p>Update (2026-11-11) — Holidays now show in the weekly overview</p><p>What was wrong: the day read No schedule.</p><p>What changed: holidays render as blocks.</p>',
  },
};

const layout = normalizeLayout({
  pages: [
    {
      id: 'details',
      label: 'Details',
      pageType: 'custom',
      sections: [
        {
          id: 'Section1',
          groups: [
            {
              label: 'Description',
              controls: [{ id: 'System.Description', controlType: 'HtmlFieldControl' }],
            },
            {
              label: 'Developer Notes',
              controls: [{ id: 'Custom.DeveloperNotes', controlType: 'HtmlFieldControl' }],
            },
            {
              label: 'System Info',
              controls: [{ id: 'Microsoft.VSTS.TCM.SystemInfo', controlType: 'HtmlFieldControl' }],
            },
          ],
        },
        {
          id: 'Section2',
          groups: [
            {
              label: 'Planning',
              inherited: true,
              controls: [
                { id: 'Microsoft.VSTS.Common.Priority', controlType: 'FieldControl' },
                { id: 'Microsoft.VSTS.Common.Severity', controlType: 'FieldControl' },
                { id: 'Microsoft.VSTS.Scheduling.Effort', controlType: 'FieldControl' },
                { id: 'Microsoft.VSTS.Scheduling.RemainingWork', controlType: 'FieldControl' },
              ],
            },
            {
              label: 'Customer',
              controls: [{ id: 'Custom.Customer', controlType: 'FieldControl' }],
            },
          ],
        },
        {
          id: 'Section3',
          groups: [
            {
              label: 'Deployment',
              isContribution: true,
              contribution: { contributionId: 'ms.vss-work-web.deployments' },
              controls: [],
            },
          ],
        },
      ],
    },
    {
      id: 'autoship',
      label: 'Autoship',
      pageType: 'custom',
      sections: [
        {
          groups: [
            { label: 'Plan', controls: [{ id: 'Custom.PlanUrl', controlType: 'FieldControl' }] },
          ],
        },
      ],
    },
  ],
});

function makeData(
  item: WorkItem,
  overrides: Partial<WorkItemDetailDataResult> = {},
): WorkItemDetailDataResult {
  return {
    workItem: item,
    detailData: toWorkItemDetailData(item, ADO),
    form: buildFormModel(item, layout, null),
    layout,
    attachments: [],
    availableStates: ['New', 'Code Review', 'Done'],
    comments: [],
    isLoadingComments: false,
    isLoading: false,
    statusText: undefined,
    error: null,
    getClient: () => null,
    save: vi.fn(async () => {}),
    remove: vi.fn(async () => true),
    addComment: vi.fn(async () => {}),
    openInBrowser: vi.fn(async () => {}),
    downloadAttachment: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('WorkItemDetailPanel', () => {
  beforeEach(() => {
    useWorkItemsStore.setState({ currentUserDisplayName: 'Dana Reyes', workItems: [] });
  });

  it('shows each fact once: in the header, not again in the rail', () => {
    render(<WorkItemDetailPanel data={makeData(bug)} />);
    const facts = document.querySelector('[data-wid-facts]') as HTMLElement;
    expect(within(facts).getByText('Code Review')).toBeInTheDocument();
    expect(within(facts).getByText('2 · Not critical')).toBeInTheDocument();
    const rail = document.querySelector('[data-wid-rail]') as HTMLElement;
    expect(within(rail).queryByText('Priority')).toBeNull();
    expect(within(rail).queryByText('Severity')).toBeNull();
    expect(within(rail).getByText('Effort')).toBeInTheDocument();
  });

  it('lays the rail out as the ADO layout groups it, custom groups tagged', () => {
    render(<WorkItemDetailPanel data={makeData(bug)} />);
    const rail = document.querySelector('[data-wid-rail]') as HTMLElement;
    expect(within(rail).getByText('Planning')).toBeInTheDocument();
    expect(within(rail).getByText('1 empty')).toBeInTheDocument();
    const customer = rail.querySelector('[data-wid-group="Customer"]') as HTMLElement;
    expect(within(customer).getByText('custom group')).toBeInTheDocument();
    expect(within(customer).getByText('Northwind Foods')).toBeInTheDocument();
    expect(within(rail).getByText('Open in ADO')).toBeInTheDocument();
  });

  it('turns custom pages into tabs', () => {
    render(<WorkItemDetailPanel data={makeData(bug)} />);
    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Activity/ })).toBeInTheDocument();
  });

  it('folds the email banner and signature of the description', () => {
    render(<WorkItemDetailPanel data={makeData(bug)} />);
    expect(screen.getByText('External-sender warning hidden')).toBeInTheDocument();
    expect(screen.getByText(/Signature hidden: Sam Peeters/)).toBeInTheDocument();
    expect(screen.getByText(/not visible in the new portal/)).toBeInTheDocument();
    expect(screen.queryByText(/originated from outside/)).toBeNull();
  });

  it('puts the newest Developer Notes update in Latest, in its titled parts', () => {
    render(<WorkItemDetailPanel data={makeData(bug)} />);
    const latest = document.querySelector('[data-wid-latest]') as HTMLElement;
    expect(
      within(latest).getByText('Holidays now show in the weekly overview'),
    ).toBeInTheDocument();
    expect(within(latest).getByText('What was wrong')).toBeInTheDocument();
    expect(within(latest).getByText('the day read No schedule.')).toBeInTheDocument();
  });

  it('offers empty long-text fields of the layout as "+ Add"', () => {
    render(<WorkItemDetailPanel data={makeData(bug)} />);
    const empties = document.querySelector('[data-wid-empties]') as HTMLElement;
    expect(within(empties).getByText('System Info')).toBeInTheDocument();
  });

  it('saves the type fact as a field change', () => {
    const data = makeData(bug);
    useWorkItemsStore.setState({
      fieldAllowedValues: new Map([
        ['Bug|Microsoft.VSTS.Common.Severity', ['1 - Critical', '2 - Not Critical']],
      ]),
    });
    render(<WorkItemDetailPanel data={data} />);
    fireEvent.click(screen.getByTitle('Severity'));
    fireEvent.click(screen.getByRole('menuitem', { name: '1 - Critical' }));
    expect(data.save).toHaveBeenCalledWith(
      expect.objectContaining({ fields: { 'Microsoft.VSTS.Common.Severity': '1 - Critical' } }),
    );
  });

  it('assigns the item to me from the header', () => {
    const data = makeData(bug);
    render(<WorkItemDetailPanel data={data} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assign me' }));
    expect(screen.getAllByText('Dana Reyes').length).toBeGreaterThan(0);
  });
});
