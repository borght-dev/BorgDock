import { describe, expect, it } from 'vitest';
import { normalizeLayout } from '../layout';

describe('normalizeLayout', () => {
  it('returns no extra tabs and no detail keys for an empty layout', () => {
    expect(normalizeLayout({})).toEqual({ extraTabs: [], detailsFieldKeys: [] });
    expect(normalizeLayout({ pages: [] })).toEqual({ extraTabs: [], detailsFieldKeys: [] });
  });

  it('treats the first custom page as Details and skips system pages', () => {
    const layout = normalizeLayout({
      pages: [
        {
          id: 'p1',
          label: 'Details',
          pageType: 'custom',
          visible: true,
          sections: [
            {
              groups: [
                {
                  controls: [
                    { id: 'System.Description', controlType: 'HtmlFieldControl' },
                    { id: 'Microsoft.VSTS.Common.Priority', controlType: 'FieldControl' },
                  ],
                },
              ],
            },
          ],
        },
        { id: 'p2', label: 'History', pageType: 'history', visible: true },
        { id: 'p3', label: 'Links', pageType: 'links', visible: true },
        {
          id: 'p4',
          label: 'Release notes',
          pageType: 'custom',
          visible: true,
          sections: [
            {
              groups: [
                {
                  controls: [{ id: 'Custom.ReleaseNotes', controlType: 'HtmlFieldControl' }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(layout.detailsFieldKeys).toEqual([
      'System.Description',
      'Microsoft.VSTS.Common.Priority',
    ]);
    expect(layout.extraTabs).toHaveLength(1);
    expect(layout.extraTabs[0]).toMatchObject({
      id: 'p4',
      label: 'Release notes',
      fieldKeys: ['Custom.ReleaseNotes'],
    });
  });

  it('drops invisible pages, groups, and controls', () => {
    const layout = normalizeLayout({
      pages: [
        {
          id: 'p1',
          label: 'Details',
          pageType: 'custom',
          visible: true,
          sections: [
            {
              groups: [
                {
                  visible: false,
                  controls: [{ id: 'Custom.Hidden', controlType: 'FieldControl' }],
                },
                {
                  controls: [
                    { id: 'Custom.AlsoHidden', controlType: 'FieldControl', visible: false },
                    { id: 'Custom.Visible', controlType: 'FieldControl' },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: 'p2',
          label: 'Hidden Tab',
          pageType: 'custom',
          visible: false,
          sections: [
            {
              groups: [{ controls: [{ id: 'Custom.X', controlType: 'FieldControl' }] }],
            },
          ],
        },
      ],
    });
    expect(layout.detailsFieldKeys).toEqual(['Custom.Visible']);
    expect(layout.extraTabs).toEqual([]);
  });

  it('skips contribution and label/html-only controls (no field binding)', () => {
    const layout = normalizeLayout({
      pages: [
        {
          id: 'p1',
          label: 'Details',
          pageType: 'custom',
          visible: true,
          sections: [
            {
              groups: [
                {
                  controls: [
                    { controlType: 'LabelControl' },
                    { id: 'banner', controlType: 'HtmlControl' },
                    {
                      id: 'ext.contribution',
                      controlType: 'FieldControl',
                      metadata: { isContribution: true },
                    },
                    { id: 'System.Title', controlType: 'FieldControl' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(layout.detailsFieldKeys).toEqual(['System.Title']);
  });

  it('drops extra tabs that have no fields', () => {
    const layout = normalizeLayout({
      pages: [
        {
          id: 'p1',
          label: 'Details',
          pageType: 'custom',
          visible: true,
          sections: [{ groups: [{ controls: [{ id: 'System.Title', controlType: 'FieldControl' }] }] }],
        },
        {
          id: 'p2',
          label: 'Empty',
          pageType: 'custom',
          visible: true,
          sections: [{ groups: [{ controls: [] }] }],
        },
      ],
    });
    expect(layout.extraTabs).toEqual([]);
  });
});
