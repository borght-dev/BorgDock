import { describe, expect, it } from 'vitest';
import { semverEq, semverGt, semverLte } from '../semver';

describe('semver helpers', () => {
  it('semverGt compares correctly', () => {
    expect(semverGt('1.0.11', '1.0.10')).toBe(true);
    expect(semverGt('1.0.10', '1.0.11')).toBe(false);
    expect(semverGt('1.1.0', '1.0.99')).toBe(true);
    expect(semverGt('2.0.0', '1.99.99')).toBe(true);
    expect(semverGt('1.0.10', '1.0.10')).toBe(false);
  });

  it('semverLte compares correctly', () => {
    expect(semverLte('1.0.10', '1.0.11')).toBe(true);
    expect(semverLte('1.0.11', '1.0.11')).toBe(true);
    expect(semverLte('1.0.11', '1.0.10')).toBe(false);
  });

  it('semverEq compares correctly', () => {
    expect(semverEq('1.0.10', '1.0.10')).toBe(true);
    expect(semverEq('1.0.10', '1.0.11')).toBe(false);
  });
});
