import type { PullRequestCommit, PullRequestFileChange } from '@/types';
import { PLANBOARD_FILES } from './quick-review-v2';

const code = (lines: string[]) => lines.join('\n');

const TYPES = 'FSP/FSP.Portal/src/types/planboardFilters.ts';
const HOOK = 'FSP/FSP.Portal/src/hooks/planboard/usePlanboardFilterLayout.ts';
const WORKSPACE = 'FSP/FSP.Portal/src/components/planboard/AdvancedFiltersWorkspace.tsx';
const TRANSLATIONS = 'Database/Translations/pending/ab60640-hidden-filter-fields.json';

/** What the summary agent answers for the planboard PR (#4812). */
export const PLANBOARD_GUIDE = {
  summary:
    'A saved search could fill a filter field that the organisation layout hides, so planners saw narrowed results without knowing why. The Advanced Filters workspace now lists those fields under "Hidden fields in use", read only, with a hint.',
  focus: [
    'Hidden fields render readOnly: a planner can no longer clear a hidden filter from the workspace.',
    'usePlanboardFilterLayout memoises on the layout object, which saved searches recreate on every load.',
  ],
  chapters: [
    {
      title: 'Types say which fields are hidden',
      intent:
        'The rest of the change asks one helper which fields a search fills but the layout hides.',
      check: 'An empty saved search returns no hidden fields.',
      files: [
        { path: TYPES, why: 'adds hiddenFieldsInUse()' },
        { path: 'Tests/types/planboardFilters.test.ts', why: 'covers filled and empty searches' },
      ],
    },
    {
      title: 'Hook exposes hidden fields',
      intent: 'The workspace needs the hidden fields next to the visible ones.',
      check: 'The memo key: layout objects are recreated per load.',
      files: [
        { path: HOOK, why: 'returns hiddenFields, memoised on the layout' },
        { path: 'Tests/hooks/usePlanboardFilterLayout.test.ts', why: 'hidden fields per layout' },
      ],
    },
    {
      title: 'Workspace lists them',
      intent: 'Planners see which hidden fields narrow their results.',
      check: 'readOnly: should a planner be able to drop the filter from the saved search?',
      files: [
        { path: WORKSPACE, why: 'new "Hidden fields in use" section' },
        {
          path: 'Tests/components/AdvancedFiltersWorkspace.test.tsx',
          why: 'section shows and hides',
        },
        {
          path: 'Tests/e2e/planboard-advanced-filters.spec.ts',
          why: 'end to end in the planboard',
        },
      ],
    },
    {
      title: 'Translations and docs',
      intent: 'The section title and hint in every language, and the user docs.',
      check: '',
      files: [
        { path: TRANSLATIONS, why: 'title and hint keys' },
        { path: 'Documentation/planboard/filters.md', why: 'describes the section' },
        { path: 'Documentation/planboard/planboard.md', why: 'links to it' },
      ],
    },
  ],
};

export const PLANBOARD_COMMITS: PullRequestCommit[] = [
  {
    sha: '1f2e3d4c5b6a79881726354433221100ffeeddcc',
    message: 'Find the filter fields a saved search fills but the layout hides',
    authorLogin: 'mvisser',
    authorAvatarUrl: '',
    date: new Date(Date.now() - 26 * 3_600_000).toISOString(),
  },
  {
    sha: '2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d',
    message:
      'Return hidden fields from usePlanboardFilterLayout\n\nMemoised on the layout so the workspace does not filter on every render.',
    authorLogin: 'mvisser',
    authorAvatarUrl: '',
    date: new Date(Date.now() - 25 * 3_600_000).toISOString(),
  },
  {
    sha: '3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e',
    message: 'List hidden fields in use in the Advanced Filters workspace',
    authorLogin: 'mvisser',
    authorAvatarUrl: '',
    date: new Date(Date.now() - 22 * 3_600_000).toISOString(),
  },
  {
    sha: '4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f',
    message: 'Translations, docs and tests for hidden filters',
    authorLogin: 'mvisser',
    authorAvatarUrl: '',
    date: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  },
];

const COMMIT_PATHS: Record<string, string[]> = {
  [PLANBOARD_COMMITS[0]!.sha]: [TYPES],
  [PLANBOARD_COMMITS[1]!.sha]: [HOOK],
  [PLANBOARD_COMMITS[2]!.sha]: [WORKSPACE],
  [PLANBOARD_COMMITS[3]!.sha]: PLANBOARD_FILES.map((f) => f.filename).filter(
    (p) => ![TYPES, HOOK, WORKSPACE].includes(p),
  ),
};

/** The planboard PR's files as each commit changed them. */
export function planboardCommitFiles(sha: string): PullRequestFileChange[] {
  const paths = COMMIT_PATHS[sha] ?? [];
  return PLANBOARD_FILES.filter((f) => paths.includes(f.filename));
}

const ROUND_PER_SHIFT = [
  'public static int RoundPerShift(Shift shift, RoundingRule rule) =>',
  '    shift.IsSplit',
  '        ? shift.Parts.Sum(part => rule.Round(part.BreakMinutes))',
  '        : rule.Round(shift.BreakMinutes);',
];

/**
 * A refactor PR where most of the diff is noise: a method moved to its own
 * class, a re-indented block, usings. One real change hides among it.
 */
export const NOISE_FILES: PullRequestFileChange[] = [
  {
    filename: 'FSP/FSP.Api/Timesheets/BreakRounding.cs',
    status: 'modified',
    sha: 'break-rounding',
    additions: 2,
    deletions: 7,
    patch: code([
      '@@ -1,4 +1,5 @@',
      ' using System;',
      ' using System.Linq;',
      '+using FSP.Api.Timesheets.Rounding;',
      ' ',
      ' namespace FSP.Api.Timesheets;',
      '@@ -18,5 +19,5 @@ public static class BreakRounding',
      '     public static int RoundBreakMinutes(IEnumerable<Shift> shifts, RoundingRule rule)',
      '     {',
      '-        return shifts.Sum(shift => RoundPerShift(shift, rule));',
      '+        return shifts.Sum(shift => ShiftRounding.RoundPerShift(shift, rule));',
      '     }',
      '@@ -30,8 +31,3 @@ public static class BreakRounding',
      '     public static int RoundToQuarter(int minutes) =>',
      '         (int)(Math.Round(minutes / 15.0, MidpointRounding.AwayFromZero) * 15);',
      '-',
      ...ROUND_PER_SHIFT.map((l) => `-    ${l}`),
      ' }',
    ]),
  },
  {
    filename: 'FSP/FSP.Api/Timesheets/Rounding/ShiftRounding.cs',
    status: 'added',
    sha: 'shift-rounding',
    additions: 9,
    deletions: 0,
    patch: code([
      '@@ -0,0 +1,9 @@',
      '+namespace FSP.Api.Timesheets.Rounding;',
      '+',
      '+public static class ShiftRounding',
      '+{',
      ...ROUND_PER_SHIFT.map((l) => `+    ${l}`),
      '+}',
    ]),
  },
  {
    filename: 'FSP/FSP.Api/Timesheets/TimesheetService.cs',
    status: 'modified',
    sha: 'timesheet-service',
    additions: 8,
    deletions: 7,
    patch: code([
      '@@ -40,7 +40,7 @@ public sealed class TimesheetService',
      '     public async Task<Timesheet> Close(Guid timesheetId)',
      '     {',
      '-      var timesheet = await timesheets.Get(timesheetId);',
      '-      timesheet.Close(clock.Now);',
      '-      await timesheets.Save(timesheet);',
      '+        var timesheet = await timesheets.Get(timesheetId);',
      '+        timesheet.Close(clock.Now);',
      '+        await timesheets.Save(timesheet);',
      '         return timesheet;',
      '     }',
      '@@ -61,6 +61,7 @@ public sealed class TimesheetService',
      '         var breaks = BreakRounding.RoundBreakMinutes(day.Shifts, rule);',
      '-        return day.Worked - breaks;',
      '+        var worked = day.Worked - breaks;',
      '+        return Math.Max(worked, 0);',
      '     }',
    ]),
  },
  {
    filename: 'FSP/FSP.Api/Program.cs',
    status: 'modified',
    sha: 'program',
    additions: 1,
    deletions: 0,
    patch: code([
      '@@ -3,3 +3,4 @@',
      ' using FSP.Api.Planboard;',
      ' using FSP.Api.Timesheets;',
      '+using FSP.Api.Timesheets.Rounding;',
      ' ',
    ]),
  },
];
