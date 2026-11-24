import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildOverview } from '../engine';
import { goldenInput } from './golden-input';

/**
 * Dispatch's overview for one fixed input, recorded before 4.17.0 took the
 * workstream context pass out of the engine. A difference here is a change
 * to what Dispatch shows: record it again only when that change is meant.
 */
describe('buildOverview', () => {
  it('shows what it showed for the same items, threads and pull requests', () => {
    const golden = JSON.parse(readFileSync(join(__dirname, 'engine-golden.json'), 'utf8'));
    expect(JSON.parse(JSON.stringify(buildOverview(goldenInput())))).toEqual(golden);
  });
});
