import { describe, expect, it } from 'vitest';
import { normalizeLayout } from '../layout';

describe('normalizeLayout', () => {
  it('returns no extra tabs and no detail keys for an empty layout', () => {
    expect(normalizeLayout({})).toEqual({ pages: [], extraTabs: [], detailsFieldKeys: [] });
    expect(normalizeLayout({ pages: [] })).toEqual({
      pages: [],
      extraTabs: [],
      detailsFieldKeys: [],
    });
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
          sections: [
            { groups: [{ controls: [{ id: 'System.Title', controlType: 'FieldControl' }] }] },
          ],
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

  it('keeps sections, groups and their kinds: fields, links controls and extensions', () => {
    const layout = normalizeLayout({
      pages: [
        {
          id: 'p1',
          label: 'Details',
          pageType: 'custom',
          sections: [
            {
              id: 'Section1',
              groups: [
                {
                  label: 'Repro Steps',
                  inherited: true,
                  controls: [
                    { id: 'Microsoft.VSTS.TCM.ReproSteps', controlType: 'HtmlFieldControl' },
                  ],
                },
              ],
            },
            {
              id: 'Section3',
              groups: [
                {
                  id: 'g-dev',
                  label: 'Development',
                  inherited: true,
                  controls: [{ controlType: 'LinksControl' }],
                },
                {
                  id: 'g-rel',
                  label: 'Related Work',
                  inherited: true,
                  controls: [{ controlType: 'LinksControl' }],
                },
                {
                  id: 'g-dep',
                  label: 'Deployment',
                  isContribution: true,
                  contribution: { contributionId: 'ms.vss-work-web.work-item-deployments' },
                },
                {
                  id: 'g-cust',
                  label: 'Customer',
                  controls: [
                    {
                      id: 'Custom.Customer',
                      label: 'Account',
                      controlType: 'FieldControl',
                      readOnly: true,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const [page] = layout.pages;
    expect(page?.sections.map((s) => s.id)).toEqual(['Section1', 'Section3']);
    const groups = page!.sections[1]!.groups;
    expect(groups.map((g) => [g.label, g.kind, g.custom])).toEqual([
      ['Development', 'development', false],
      ['Related Work', 'related', false],
      ['Deployment', 'extension', false],
      ['Customer', 'fields', true],
    ]);
    expect(groups[3]!.controls[0]).toMatchObject({
      id: 'Custom.Customer',
      label: 'Account',
      kind: 'field',
      readOnly: true,
    });
  });
});
