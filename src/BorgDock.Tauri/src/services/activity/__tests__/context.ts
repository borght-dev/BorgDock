import type { DeriveContext } from '../types';

export const SEEDED_AT = '2026-10-27T08:00:00.000Z';

export function context(overrides: Partial<DeriveContext> = {}): DeriveContext {
  return {
    sourceId: 't3:local',
    now: '2026-10-27T10:00:00.000Z',
    coverage: 'live',
    seed: false,
    seededAt: SEEDED_AT,
    ...overrides,
  };
}

export function seedContext(overrides: Partial<DeriveContext> = {}): DeriveContext {
  return context({ seed: true, seededAt: null, now: SEEDED_AT, ...overrides });
}
