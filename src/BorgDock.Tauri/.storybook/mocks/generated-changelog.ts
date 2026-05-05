// .storybook/mocks/generated-changelog.ts
//
// Storybook re-export of @/generated/changelog. Defaults to the real
// RELEASES array. Stories that need a synthetic history set
// getControl().releasesOverride to substitute, story-by-story.
//
// We use a Proxy so every access (length, indexed, Symbol.iterator,
// .filter, .map, etc.) routes through the override-or-real choice
// at read time — without committing to a snapshot at module load.

import { RELEASES as REAL_RELEASES } from '../../src/generated/changelog';
import type { Release } from '../../src/types/whats-new';
import { getControl } from './control';

function pickSource(): readonly Release[] {
  // Guard for tests / SSR contexts where window is missing — fall back
  // to real data so module evaluation never throws.
  if (typeof window === 'undefined') return REAL_RELEASES;
  const override = getControl().releasesOverride;
  return override ?? REAL_RELEASES;
}

export const RELEASES: Release[] = new Proxy([] as Release[], {
  get(_target, prop, receiver) {
    return Reflect.get(pickSource(), prop, receiver);
  },
  has(_target, prop) {
    return Reflect.has(pickSource(), prop);
  },
  ownKeys(_target) {
    return Reflect.ownKeys(pickSource());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Reflect.getOwnPropertyDescriptor(pickSource(), prop);
  },
}) as Release[];
