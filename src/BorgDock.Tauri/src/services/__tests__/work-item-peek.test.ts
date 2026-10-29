import { describe, expect, it } from 'vitest';
import type { WorkItem } from '@/types';
import { rehypeWorkItemRefs, workItemIdFromHref, workItemPeekOf } from '../work-item-peek';

function item(fields: Record<string, unknown>): WorkItem {
  return { id: 61021, rev: 3, url: '', relations: [], htmlUrl: '', fields };
}

describe('workItemIdFromHref', () => {
  it('reads ADO work item URLs and AB# reference anchors', () => {
    expect(workItemIdFromHref('https://dev.azure.com/org/Project/_workitems/edit/61021')).toBe(
      61021,
    );
    expect(
      workItemIdFromHref('https://org.visualstudio.com/Project/_workitems/edit/61021/?view=x'),
    ).toBe(61021);
    expect(workItemIdFromHref('#bd-ab-42')).toBe(42);
    expect(workItemIdFromHref('#user-content-bd-ab-42')).toBe(42);
  });

  it('leaves every other link alone', () => {
    expect(workItemIdFromHref(undefined)).toBeNull();
    expect(workItemIdFromHref('https://github.com/o/r/pull/12')).toBeNull();
    expect(workItemIdFromHref('https://dev.azure.com/org/Project/_workitems/edit/abc')).toBeNull();
    expect(workItemIdFromHref('#heading')).toBeNull();
  });
});

describe('rehypeWorkItemRefs', () => {
  it('turns plain AB# text into links and leaves code and links alone', () => {
    const text = (value: string) => ({ type: 'text', value });
    const link = (href: string, label: string) => ({
      type: 'element',
      tagName: 'a',
      properties: { href },
      children: [text(label)],
    });
    const tree = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'p',
          children: [
            text('Fixes AB#61021 and ab#7.'),
            { type: 'element', tagName: 'code', children: [text('AB#1')] },
            link('https://x', 'AB#2'),
          ],
        },
      ],
    };
    rehypeWorkItemRefs()(tree);
    expect(tree.children[0]!.children).toEqual([
      text('Fixes '),
      link('#bd-ab-61021', 'AB#61021'),
      text(' and '),
      link('#bd-ab-7', 'ab#7'),
      text('.'),
      { type: 'element', tagName: 'code', children: [text('AB#1')] },
      link('https://x', 'AB#2'),
    ]);
  });
});

describe('workItemPeekOf', () => {
  it('reads what the card shows, the iteration by its own name and the description as text', () => {
    const peek = workItemPeekOf(
      item({
        'System.WorkItemType': 'Bug',
        'System.State': 'Code Review',
        'System.Title': 'Drag preview lands one lane too low',
        'System.AssignedTo': { displayName: 'Koen van der Borght' },
        'System.IterationPath': 'FSP\\2026\\Sprint 2026-22',
        'Microsoft.VSTS.Common.Priority': 2,
        'Microsoft.VSTS.Scheduling.Effort': 5,
        'System.Description': '',
        'Microsoft.VSTS.TCM.ReproSteps':
          '<div><b>Repro:</b> scroll &amp; drag</div><p>Lands low</p>',
        'System.ChangedDate': '2026-10-29T08:00:00Z',
        'System.ChangedBy': { displayName: 'Vera' },
      }),
    );
    expect(peek).toEqual({
      id: 61021,
      type: 'Bug',
      state: 'Code Review',
      title: 'Drag preview lands one lane too low',
      assignee: 'Koen van der Borght',
      iteration: 'Sprint 2026-22',
      priority: 2,
      points: 5,
      description: 'Repro: scroll & drag\nLands low',
      changedAt: '2026-10-29T08:00:00Z',
      changedBy: 'Vera',
    });
  });

  it('has no iteration at the project root and nulls for missing numbers', () => {
    const peek = workItemPeekOf(item({ 'System.IterationPath': 'FSP' }));
    expect(peek).toMatchObject({ iteration: null, priority: null, points: null, assignee: null });
  });
});
