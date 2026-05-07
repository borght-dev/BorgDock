import { describe, expect, it } from 'vitest';
import type { ProcessTab } from '@/services/ado/layout';
import type { DynamicFieldItem } from '@/types';
import { buildDetailTabs } from '../partitionFields';

const F = (key: string, opts: Partial<DynamicFieldItem> = {}): DynamicFieldItem => ({
  fieldKey: key,
  label: opts.label ?? key,
  isHtml: opts.isHtml ?? false,
  value: opts.value,
  htmlContent: opts.htmlContent,
  section: opts.section ?? 'standard',
});

describe('buildDetailTabs', () => {
  it('returns one Overview tab containing every field when no layout is given', () => {
    const slices = buildDetailTabs(
      {
        richText: [F('Microsoft.VSTS.TCM.ReproSteps', { isHtml: true })],
        standard: [F('System.AreaPath')],
        custom: [F('Custom.QANotes')],
      },
      undefined,
      undefined,
    );
    expect(slices).toHaveLength(1);
    const only = slices[0]!;
    expect(only.id).toBe('overview');
    expect(only.fields.richText.map((f) => f.fieldKey)).toEqual([
      'Microsoft.VSTS.TCM.ReproSteps',
    ]);
    expect(only.fields.standard.map((f) => f.fieldKey)).toEqual(['System.AreaPath']);
    expect(only.fields.custom.map((f) => f.fieldKey)).toEqual(['Custom.QANotes']);
  });

  it('puts Release-notes field on its own tab and keeps Overview clean', () => {
    const extraTabs: ProcessTab[] = [
      { id: 'rn', label: 'Release notes', fieldKeys: ['Custom.ReleaseNotes'] },
    ];
    const slices = buildDetailTabs(
      {
        richText: [
          F('System.Description', { isHtml: true }),
          F('Custom.ReleaseNotes', { isHtml: true }),
        ],
        standard: [F('System.AreaPath')],
        custom: [],
      },
      ['System.Description', 'System.AreaPath'],
      extraTabs,
    );

    expect(slices.map((s) => s.label)).toEqual(['Overview', 'Release notes']);
    const overview = slices[0]!;
    const rn = slices[1]!;
    expect(overview.fields.richText.map((f) => f.fieldKey)).toEqual(['System.Description']);
    expect(overview.fields.standard.map((f) => f.fieldKey)).toEqual(['System.AreaPath']);
    expect(rn.fields.richText.map((f) => f.fieldKey)).toEqual(['Custom.ReleaseNotes']);
  });

  it('keeps fields not claimed by any tab on Overview', () => {
    const extraTabs: ProcessTab[] = [
      { id: 'rn', label: 'Release notes', fieldKeys: ['Custom.ReleaseNotes'] },
    ];
    const slices = buildDetailTabs(
      {
        richText: [],
        standard: [F('System.AreaPath'), F('Custom.Stray')],
        custom: [],
      },
      ['System.AreaPath'], // detailsFieldKeys: doesn't list Custom.Stray
      extraTabs,
    );
    const overviewKeys = slices[0]!.fields.standard.map((f) => f.fieldKey);
    expect(overviewKeys).toContain('System.AreaPath');
    expect(overviewKeys).toContain('Custom.Stray');
  });

  it('drops extra tabs whose fields are absent from the work item', () => {
    const extraTabs: ProcessTab[] = [
      { id: 'rn', label: 'Release notes', fieldKeys: ['Custom.ReleaseNotes'] },
    ];
    const slices = buildDetailTabs(
      { richText: [], standard: [F('System.AreaPath')], custom: [] },
      ['System.AreaPath'],
      extraTabs,
    );
    expect(slices.map((s) => s.label)).toEqual(['Overview']);
  });
});
