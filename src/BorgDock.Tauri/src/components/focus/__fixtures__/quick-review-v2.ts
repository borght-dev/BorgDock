import type { PullRequestFileChange } from '@/types';

/**
 * The PRs of design/quick-review-v2/mockups.html, for the Quick Review
 * stories: the planboard PR walked with its proof (frames A and B) and the
 * timesheets PR re-reviewed after two new commits (frame C).
 */

export const PLANBOARD_HEAD = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

export const PLANBOARD_BODY = `## Summary

A saved search can fill in filter fields that the organisation's filter layout hides, so planners saw narrowed results without knowing why. The Advanced Filters workspace now lists those fields under "Hidden fields in use" with a hint, and \`usePlanboardFilterLayout\` exposes which fields are hidden. Translations for all six languages are in the pending folder.

## Changes

- \`usePlanboardFilterLayout\` returns the hidden fields next to the visible ones.
- The workspace shows hidden fields a saved search fills in, read-only, under their own heading.
- New translation keys for the heading and its hint.

## Test plan

- [x] Unit tests for the layout hook
- [x] Playwright: saved search with hidden Region
- [x] Translations checked in nl and de

AB#60640`;

const code = (lines: string[]) => lines.join('\n');

export const PLANBOARD_FILES: PullRequestFileChange[] = [
  {
    filename: 'Database/Translations/pending/ab60640-hidden-filter-fields.json',
    status: 'added',
    sha: 'translations',
    additions: 20,
    deletions: 0,
    patch: code([
      '@@ -0,0 +1,20 @@',
      '+{',
      '+  "rows": {',
      '+    "PLANBOARD_FILTER_HIDDEN_FIELDS_IN_USE": {',
      '+      "de": "Ausgeblendete Felder in Verwendung",',
      '+      "enUs": "Hidden fields in use",',
      '+      "enGb": "Hidden fields in use",',
      '+      "es": "Campos ocultos en uso",',
      '+      "nl": "Verborgen velden in gebruik",',
      '+      "sv": "Dolda fält som används"',
      '+    },',
      '+    "PLANBOARD_FILTER_HIDDEN_FIELDS_IN_USE_HINT": {',
      '+      "de": "Von einer gespeicherten Suche ausgefüllt.",',
      '+      "enUs": "Filled in by a saved search. Hidden on your organisation\'s filter layout.",',
      '+      "enGb": "Filled in by a saved search. Hidden on your organisation\'s filter layout.",',
      '+      "es": "Rellenado por una búsqueda guardada.",',
      '+      "nl": "Ingevuld door een opgeslagen zoekopdracht.",',
      '+      "sv": "Ifyllt av en sparad sökning."',
      '+    }',
      '+  }',
      '+}',
    ]),
  },
  {
    filename: 'FSP/FSP.Portal/src/components/planboard/AdvancedFiltersWorkspace.tsx',
    status: 'modified',
    sha: 'workspace',
    additions: 128,
    deletions: 45,
    patch: code([
      '@@ -84,12 +84,26 @@ export function AdvancedFiltersWorkspace({ layout, savedSearch }: Props) {',
      '   const { visibleFields, hiddenFields } = usePlanboardFilterLayout(layout);',
      '   const activeFilters = useActiveFilters(savedSearch);',
      '-  const fields = visibleFields;',
      '+  const hiddenInUse = hiddenFields.filter((field) => activeFilters.has(field.key));',
      ' ',
      '   return (',
      '     <FilterPanel>',
      '-      {fields.map((field) => (',
      '+      {visibleFields.map((field) => (',
      '         <FilterField key={field.key} field={field} />',
      '       ))}',
      '+      {hiddenInUse.length > 0 && (',
      '+        <FilterSection',
      "+          title={t('PLANBOARD_FILTER_HIDDEN_FIELDS_IN_USE')}",
      "+          hint={t('PLANBOARD_FILTER_HIDDEN_FIELDS_IN_USE_HINT')}",
      '+        >',
      '+          {hiddenInUse.map((field) => (',
      '+            <FilterField key={field.key} field={field} readOnly />',
      '+          ))}',
      '+        </FilterSection>',
      '+      )}',
      '     </FilterPanel>',
      '   );',
      ' }',
    ]),
  },
  {
    filename: 'FSP/FSP.Portal/src/hooks/planboard/usePlanboardFilterLayout.ts',
    status: 'modified',
    sha: 'hook',
    additions: 53,
    deletions: 14,
    patch: code([
      '@@ -12,7 +12,12 @@ export function usePlanboardFilterLayout(layout: FilterLayout) {',
      '-  const visibleFields = layout.fields.filter((field) => !field.hidden);',
      '-  return { visibleFields };',
      '+  return useMemo(() => {',
      '+    const visibleFields = layout.fields.filter((field) => !field.hidden);',
      '+    const hiddenFields = layout.fields.filter((field) => field.hidden);',
      '+    return { visibleFields, hiddenFields };',
      '+  }, [layout]);',
      ' }',
    ]),
  },
  {
    filename: 'FSP/FSP.Portal/src/types/planboardFilters.ts',
    status: 'modified',
    sha: 'types',
    additions: 3,
    deletions: 0,
    patch: code([
      '@@ -20,4 +20,7 @@ export interface PlanboardFilterField {',
      '   key: string;',
      '   label: string;',
      '+  /** Hidden by the organisation filter layout. */',
      '+  hidden?: boolean;',
      '+  readOnly?: boolean;',
      ' }',
    ]),
  },
  {
    filename: 'Documentation/planboard/filters.md',
    status: 'modified',
    sha: 'docs-filters',
    additions: 2,
    deletions: 0,
    patch: code([
      '@@ -40,3 +40,5 @@ ## Saved searches',
      ' A saved search remembers every filter you set.',
      '+',
      '+Fields your organisation hides still apply when a saved search fills them in.',
    ]),
  },
  {
    filename: 'Documentation/planboard/planboard.md',
    status: 'modified',
    sha: 'docs-planboard',
    additions: 18,
    deletions: 2,
    patch: code([
      '@@ -1,4 +1,6 @@',
      '-# Planboard',
      '+# The planboard',
      '+',
      '+See [filters](filters.md) for saved searches and hidden fields.',
    ]),
  },
  {
    filename: 'Tests/e2e/planboard-advanced-filters.spec.ts',
    status: 'modified',
    sha: 'e2e',
    additions: 87,
    deletions: 5,
    patch: code([
      "@@ -10,3 +10,9 @@ test.describe('advanced filters', () => {",
      "+  test('shows hidden fields a saved search fills in', async ({ page }) => {",
      "+    await openSavedSearch(page, 'NL-South planners');",
      "+    await expect(page.getByText('Hidden fields in use')).toBeVisible();",
      '+  });',
    ]),
  },
  {
    filename: 'Tests/components/AdvancedFiltersWorkspace.test.tsx',
    status: 'added',
    sha: 'workspace-test',
    additions: 250,
    deletions: 0,
    patch: code([
      '@@ -0,0 +1,4 @@',
      "+it('lists hidden fields in use, read-only', () => {",
      "+  render(<AdvancedFiltersWorkspace layout={layoutWith({ hidden: ['region'] })} savedSearch={nlSouth} />);",
      "+  expect(screen.getByRole('textbox', { name: 'Region' })).toHaveAttribute('readonly');",
      '+});',
    ]),
  },
  {
    filename: 'Tests/hooks/usePlanboardFilterLayout.test.ts',
    status: 'added',
    sha: 'hook-test',
    additions: 64,
    deletions: 0,
    patch: code([
      '@@ -0,0 +1,3 @@',
      "+it('splits visible and hidden fields', () => {",
      '+  expect(result.current.hiddenFields).toHaveLength(2);',
      '+});',
    ]),
  },
  {
    filename: 'Tests/types/planboardFilters.test.ts',
    status: 'added',
    sha: 'types-test',
    additions: 9,
    deletions: 0,
    patch: code([
      "@@ -0,0 +1,9 @@ describe('planboardFilters', () => {",
      "+  it('reports hidden fields a saved search fills in', () => {",
      "+    const layout = layoutWith({ hidden: ['region', 'skill'] });",
      "+    const search = savedSearch({ region: 'NL-South' });",
      "+    expect(hiddenFieldsInUse(layout, search)).toEqual(['region']);",
      '+  });',
      '+',
      "+  it('ignores hidden fields the search leaves empty', () => {",
      "+    expect(hiddenFieldsInUse(layoutWith({ hidden: ['skill'] }), savedSearch({}))).toEqual([]);",
      '+  });',
    ]),
  },
];

export const TIMESHEET_REVIEWED = 'e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3';
export const TIMESHEET_HEAD = '9c1d2e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d';

export const TIMESHEET_BODY = `## Summary

Break minutes were summed per day and rounded once, so split shifts lost up to 14 minutes. Rounding now happens per shift part. Fixes the payroll mismatch reported by Heras (AB#60612).`;

const unchanged = (filename: string, additions: number): PullRequestFileChange => ({
  filename,
  status: 'modified',
  sha: filename,
  additions,
  deletions: 1,
  patch: `@@ -1,2 +1,${additions + 1} @@\n context();\n-old();\n${Array.from({ length: additions }, (_, i) => `+line${i}();`).join('\n')}`,
});

const BREAK_ROUNDING_SINCE = code([
  '@@ -18,9 +18,7 @@ public static class BreakRounding',
  '     public static int RoundBreakMinutes(IEnumerable<Shift> shifts, RoundingRule rule)',
  '     {',
  '-        var total = shifts.Sum(s => s.BreakMinutes);',
  '-        return rule.Round(total);',
  '+        return shifts.Sum(shift => RoundPerShift(shift, rule));',
  '     }',
  '@@ -41,6 +39,12 @@ public static class BreakRounding',
  '     public static int RoundToQuarter(int minutes) =>',
  '         (int)(Math.Round(minutes / 15.0, MidpointRounding.AwayFromZero) * 15);',
  '+',
  '+    public static int RoundPerShift(Shift shift, RoundingRule rule) =>',
  '+        shift.IsSplit',
  '+            ? shift.Parts.Sum(part => rule.Round(part.BreakMinutes))',
  '+            : rule.Round(shift.BreakMinutes);',
  '+',
  '+    private static bool HasBreak(Shift shift) => shift.BreakMinutes > 0;',
  ' }',
]);

const SINCE_FILES: PullRequestFileChange[] = [
  {
    filename: 'FSP/FSP.Api/Timesheets/BreakRounding.cs',
    status: 'modified',
    sha: 'rounding-new',
    additions: 8,
    deletions: 2,
    patch: BREAK_ROUNDING_SINCE,
  },
  {
    filename: 'Tests/Timesheets/BreakRoundingTests.cs',
    status: 'modified',
    sha: 'rounding-tests-new',
    additions: 31,
    deletions: 0,
    patch: code([
      '@@ -30,3 +30,8 @@ public class BreakRoundingTests',
      '+    [Fact]',
      '+    public void Split_shift_parts_round_on_their_own()',
      '+        => Assert.Equal(0, BreakRounding.RoundBreakMinutes(SplitShift(7, 7), QuarterHour));',
    ]),
  },
  {
    filename: 'Documentation/timesheets/rounding.md',
    status: 'modified',
    sha: 'rounding-docs-new',
    additions: 4,
    deletions: 1,
    patch: code([
      '@@ -8,2 +8,5 @@ ## Breaks',
      '-Breaks are rounded once per day.',
      '+Breaks are rounded per shift part, so two short breaks',
      '+in a split shift are never added up before rounding.',
    ]),
  },
];

export const TIMESHEET_FILES: PullRequestFileChange[] = [
  { ...SINCE_FILES[0]!, additions: 46, deletions: 12 },
  unchanged('FSP/FSP.Api/Timesheets/TimesheetCalculator.cs', 14),
  unchanged('FSP/FSP.Api/Timesheets/Shift.cs', 6),
  unchanged('FSP/FSP.Api/Timesheets/RoundingRule.cs', 9),
  unchanged('FSP/FSP.Api/Payroll/PayrollExport.cs', 4),
  unchanged('FSP/FSP.Portal/src/timesheets/BreakSummary.tsx', 11),
  unchanged('FSP/FSP.Portal/src/timesheets/useTimesheet.ts', 3),
  unchanged('Database/Migrations/20261024_SplitShiftParts.sql', 18),
  unchanged('Documentation/timesheets/payroll.md', 2),
  { ...SINCE_FILES[2]!, additions: 12, deletions: 3 },
  { ...SINCE_FILES[1]!, additions: 120, deletions: 0 },
  unchanged('Tests/Timesheets/TimesheetCalculatorTests.cs', 22),
];

export const TIMESHEET_COMPARE = {
  status: 'ahead',
  ahead_by: 2,
  commits: [
    { commit: { message: 'Add per-shift rounding helper' } },
    { commit: { message: 'Round each split-shift part on its own\n\nFixes the review note.' } },
  ],
  files: SINCE_FILES.map((file) => ({
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    patch: file.patch,
    sha: file.sha,
  })),
};
