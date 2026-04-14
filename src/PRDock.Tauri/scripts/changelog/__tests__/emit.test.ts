import { describe, it, expect } from 'vitest';
import { emitModule } from '../emit';
import type { Release } from '../../../src/types/whats-new';

const SAMPLE: Release[] = [
  {
    version: '1.0.11',
    date: '2026-04-14',
    summary: 'A and B.',
    highlights: [
      {
        kind: 'new',
        title: 'A',
        description: 'first',
        hero: { src: 'whats-new/1.0.11/a.png', alt: 'A' },
        keyboard: 'Ctrl+Shift+W',
      },
      {
        kind: 'improved',
        title: 'B',
        description: 'second',
        hero: null,
        keyboard: null,
      },
    ],
    alsoFixed: ['tiny fix'],
    autoOpenEligible: true,
  },
];

describe('emitModule', () => {
  it('produces a stable TS module string that re-imports safely', () => {
    const out = emitModule(SAMPLE);
    expect(out).toContain(`import type { Release } from '@/types/whats-new';`);
    expect(out).toContain(`export const RELEASES: Release[]`);
    // JSON.stringify uses double quotes — corrected from plan's single-quote assertion
    expect(out).toContain(`"1.0.11"`);
    expect(out).toContain(`/whats-new/1.0.11/a.png`);
    expect(out).toContain(`"Ctrl+Shift+W"`);
    // JSON.stringify quotes object keys — corrected from plan's unquoted-key regex
    expect(out).toMatch(/"autoOpenEligible": true/);
  });

  it('rewrites hero.src to an absolute /whats-new/... URL', () => {
    const out = emitModule(SAMPLE);
    expect(out).toContain(`"src": "/whats-new/1.0.11/a.png"`);
  });

  it('emits an empty array when given none', () => {
    const out = emitModule([]);
    expect(out).toContain(`export const RELEASES: Release[] = [];`);
  });
});
