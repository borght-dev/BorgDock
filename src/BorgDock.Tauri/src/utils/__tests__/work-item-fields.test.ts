import { describe, expect, it } from 'vitest';
import type { AdoFieldMeta } from '@/services/ado/fields';
import type { WorkItem } from '@/types';
import { classifyFields } from '../work-item-fields';

function makeItem(fields: Record<string, unknown>): WorkItem {
  return {
    id: 1,
    rev: 1,
    url: 'https://example/_apis/wit/workitems/1',
    htmlUrl: 'https://example/_workitems/edit/1',
    fields: { 'System.WorkItemType': 'Bug', 'System.Title': 'x', ...fields },
    relations: [],
  };
}

function metaMap(entries: AdoFieldMeta[]): Map<string, AdoFieldMeta> {
  return new Map(entries.map((e) => [e.referenceName, e]));
}

describe('classifyFields', () => {
  it('falls back to RICH_TEXT_FIELDS when no metadata is provided', () => {
    const item = makeItem({
      'Microsoft.VSTS.TCM.ReproSteps': '<p>steps</p>',
      'Custom.QANotes': 'plain text',
    });
    const { richText, custom } = classifyFields(item);
    expect(richText.map((f) => f.fieldKey)).toEqual(['Microsoft.VSTS.TCM.ReproSteps']);
    expect(custom.map((f) => f.fieldKey)).toEqual(['Custom.QANotes']);
  });

  it('treats metadata-typed html fields as rich text even without HTML markup', () => {
    const item = makeItem({ 'Custom.QANotes': 'plain QA text' });
    const defs = metaMap([
      { referenceName: 'Custom.QANotes', name: 'QA Notes', type: 'html', readOnly: false },
    ]);
    const { richText, custom } = classifyFields(item, defs);
    expect(richText).toHaveLength(1);
    expect(richText[0]).toMatchObject({
      fieldKey: 'Custom.QANotes',
      label: 'QA Notes',
      isHtml: true,
      htmlContent: 'plain QA text',
    });
    expect(custom).toHaveLength(0);
  });

  it('drops fields whose value is empty or absent', () => {
    const defs = metaMap([
      { referenceName: 'Custom.QANotes', name: 'QA Notes', type: 'html', readOnly: false },
    ]);
    // Field absent on the item entirely (the typical ADO response)
    expect(classifyFields(makeItem({}), defs).richText).toHaveLength(0);
    // Field present but empty string
    expect(classifyFields(makeItem({ 'Custom.QANotes': '' }), defs).richText).toHaveLength(0);
  });

  it('uses the friendly name from metadata when available', () => {
    const item = makeItem({ 'Custom.MyOrg.WeirdRefName': 'value' });
    const defs = metaMap([
      {
        referenceName: 'Custom.MyOrg.WeirdRefName',
        name: 'Field With Spaces',
        type: 'string',
        readOnly: false,
      },
    ]);
    const { custom } = classifyFields(item, defs);
    expect(custom[0]?.label).toBe('Field With Spaces');
  });
});
