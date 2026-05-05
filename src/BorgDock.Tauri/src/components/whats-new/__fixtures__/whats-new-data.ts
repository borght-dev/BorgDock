// src/components/whats-new/__fixtures__/whats-new-data.ts
//
// Synthetic Release fixtures for Storybook stories that need
// deterministic edge-case content. Real RELEASES are imported from
// @/generated/changelog at runtime via the Storybook Proxy alias and
// override only when releasesOverride is set.

import type { Highlight, Release } from '@/types/whats-new';

export function makeHighlight(overrides: Partial<Highlight> = {}): Highlight {
  return {
    kind: 'new',
    title: 'A new feature',
    description: 'A short markdown description of the highlighted feature.',
    hero: null,
    keyboard: null,
    ...overrides,
  };
}

export function makeRelease(overrides: Partial<Release> = {}): Release {
  return {
    version: '1.2.0',
    date: '2026-04-30',
    summary: 'A normal release with a sentence-long summary.',
    highlights: [],
    alsoFixed: [],
    autoOpenEligible: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Curated single releases — used by Release-shape-axis stories.
// Each is a single-element substitute for the "latest" release in stories.
// ---------------------------------------------------------------------------

export const releaseEmptySummary: Release = makeRelease({
  version: '1.3.0',
  date: '2026-05-01',
  summary: '',
});

export const releaseRichSummary: Release = makeRelease({
  version: '1.3.1',
  date: '2026-05-02',
  summary:
    'A multi-sentence release summary. It runs to roughly two lines on a typical viewport, ' +
    'demonstrating how the hero copy wraps when content actually fills it.',
});

export const releaseNoHighlights: Release = makeRelease({
  version: '1.3.2',
  date: '2026-05-03',
  summary: 'A release with fixes but no headline highlights.',
  highlights: [],
  alsoFixed: ['Minor bug fix.', 'Another minor bug fix.'],
});

export const releaseSingleHighlight: Release = makeRelease({
  version: '1.3.3',
  date: '2026-05-04',
  summary: 'One marquee feature.',
  highlights: [
    makeHighlight({
      kind: 'new',
      title: 'Single Highlight',
      description: 'The only headline change in this release.',
    }),
  ],
  autoOpenEligible: true,
});

export const releaseManyHighlights: Release = makeRelease({
  version: '1.3.4',
  date: '2026-05-05',
  summary: 'A release with six headline changes.',
  highlights: [
    makeHighlight({ kind: 'new', title: 'Highlight A', description: 'First.' }),
    makeHighlight({ kind: 'improved', title: 'Highlight B', description: 'Second.' }),
    makeHighlight({ kind: 'fixed', title: 'Highlight C', description: 'Third.' }),
    makeHighlight({ kind: 'new', title: 'Highlight D', description: 'Fourth.' }),
    makeHighlight({ kind: 'improved', title: 'Highlight E', description: 'Fifth.' }),
    makeHighlight({ kind: 'new', title: 'Highlight F', description: 'Sixth.' }),
  ],
  autoOpenEligible: true,
});

export const releaseLongHighlight: Release = makeRelease({
  version: '1.3.5',
  date: '2026-05-06',
  summary: 'A release with a single very long highlight card.',
  highlights: [
    makeHighlight({
      kind: 'improved',
      title:
        'A highlight title that is itself fairly long and may wrap on narrower viewports to multiple lines',
      description:
        'A multi-paragraph description that exceeds the comfortable card height. ' +
        'It is designed to exercise the card layout and verify text wrapping, line-height, ' +
        'and the markdown renderer handle a substantial body without overflowing the surrounding window.',
      keyboard: 'Ctrl+Shift+L',
    }),
  ],
  autoOpenEligible: true,
});

export const releaseNoFixes: Release = makeRelease({
  version: '1.3.6',
  date: '2026-05-07',
  summary: 'A release with no "also fixed" entries.',
  alsoFixed: [],
});

export const releaseFewFixes: Release = makeRelease({
  version: '1.3.7',
  date: '2026-05-08',
  summary: 'A release with three small fixes.',
  alsoFixed: ['Fix one.', 'Fix two.', 'Fix three.'],
});

export const releaseLongFixList: Release = makeRelease({
  version: '1.3.8',
  date: '2026-05-09',
  summary: 'A release dominated by a long list of fixes.',
  alsoFixed: Array.from({ length: 25 }, (_, i) => `Fix number ${i + 1} — short description.`),
});

export const releaseLongMixed: Release = makeRelease({
  version: '1.3.9',
  date: '2026-05-10',
  summary:
    'A worst-case release that combines a long summary, several heavy highlights, and a long fix list to exercise the full layout.',
  highlights: [
    makeHighlight({
      kind: 'new',
      title: 'A long highlight title for the first card',
      description: 'A reasonably long description for the first highlight in the worst-case story.',
    }),
    makeHighlight({
      kind: 'improved',
      title: 'A long highlight title for the second card',
      description: 'A reasonably long description for the second highlight in the worst-case story.',
    }),
    makeHighlight({
      kind: 'fixed',
      title: 'A long highlight title for the third card',
      description: 'A reasonably long description for the third highlight in the worst-case story.',
    }),
  ],
  alsoFixed: Array.from({ length: 18 }, (_, i) => `Worst-case fix ${i + 1}.`),
  autoOpenEligible: true,
});

export const releaseLongVersion: Release = makeRelease({
  version: '1.2.0-beta.4+build.42',
  date: '2026-05-04',
  summary: 'A pre-release with a long version string.',
});

export const releaseLongDate: Release = makeRelease({
  version: '1.4.0',
  date: '2024-01-15',
  summary: 'An older release used to verify date formatting at >1 year.',
});

// ---------------------------------------------------------------------------
// Curated histories — used by Accordion-axis and Edge-case stories.
// All arrays are sorted newest-first to match RELEASES.
// ---------------------------------------------------------------------------

export const noReleases: Release[] = [];

export const oneRelease: Release[] = [
  makeRelease({ version: '1.0.0', date: '2026-04-01', summary: 'The very first release.' }),
];

export const deepHistory: Release[] = [
  makeRelease({ version: '1.7.0', date: '2026-05-15', summary: 'Latest.' }),
  makeRelease({ version: '1.6.0', date: '2026-05-08' }),
  makeRelease({ version: '1.5.0', date: '2026-05-01' }),
  makeRelease({ version: '1.4.0', date: '2026-04-24' }),
  makeRelease({ version: '1.3.0', date: '2026-04-17' }),
  makeRelease({ version: '1.2.0', date: '2026-04-10' }),
  makeRelease({ version: '1.1.0', date: '2026-04-03' }),
  makeRelease({ version: '1.0.0', date: '2026-03-27' }),
];

// Spread of dates for the AccordionWithDates story — today, weeks ago,
// months ago, and >1 year. Ordered newest-first.
export const dateSpreadHistory: Release[] = [
  makeRelease({ version: '2.0.0', date: '2026-05-05', summary: 'Today.' }),
  makeRelease({ version: '1.9.0', date: '2026-04-21', summary: 'Two weeks ago.' }),
  makeRelease({ version: '1.8.0', date: '2026-02-05', summary: 'Three months ago.' }),
  makeRelease({ version: '1.7.0', date: '2024-08-12', summary: 'Over a year ago.' }),
];

// History used by the Release-shape stories: prepends the curated edge-case
// release as the newest, then provides two normal historical releases for
// accordion context. Stories pick which curated release to put on top.
export function shapeStoryHistory(latest: Release): Release[] {
  return [
    latest,
    makeRelease({ version: '1.0.1', date: '2026-04-23', summary: 'Prior release.' }),
    makeRelease({ version: '1.0.0', date: '2026-04-16', summary: 'Earlier release.' }),
  ];
}
