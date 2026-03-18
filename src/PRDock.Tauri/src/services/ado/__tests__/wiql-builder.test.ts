import { describe, it, expect } from 'vitest';
import { buildIdPrefixWiql } from '../workitems';

describe('buildIdPrefixWiql', () => {
  it('generates exact match and two ranges for 5-digit prefix', () => {
    const wiql = buildIdPrefixWiql('52445');

    expect(wiql).toContain('[System.Id] = 52445');
    expect(wiql).toContain('([System.Id] >= 524450 AND [System.Id] <= 524459)');
    expect(wiql).toContain('([System.Id] >= 5244500 AND [System.Id] <= 5244599)');
  });

  it('generates exact match and five ranges for 2-digit prefix', () => {
    const wiql = buildIdPrefixWiql('52');

    expect(wiql).toContain('[System.Id] = 52');
    expect(wiql).toContain('([System.Id] >= 520 AND [System.Id] <= 529)');
    expect(wiql).toContain('([System.Id] >= 5200 AND [System.Id] <= 5299)');
    expect(wiql).toContain('([System.Id] >= 52000 AND [System.Id] <= 52999)');
    expect(wiql).toContain('([System.Id] >= 520000 AND [System.Id] <= 529999)');
    expect(wiql).toContain('([System.Id] >= 5200000 AND [System.Id] <= 5299999)');
  });

  it('generates only exact match for 7-digit prefix', () => {
    const wiql = buildIdPrefixWiql('9999999');

    expect(wiql).toBe(
      'SELECT [System.Id] FROM WorkItems WHERE [System.Id] = 9999999',
    );
  });

  it('throws for empty string', () => {
    expect(() => buildIdPrefixWiql('')).toThrow();
  });

  it('throws for non-numeric string', () => {
    expect(() => buildIdPrefixWiql('abc')).toThrow(/numeric/);
  });

  it('starts with SELECT statement', () => {
    const wiql = buildIdPrefixWiql('123');
    expect(wiql).toMatch(/^SELECT \[System\.Id\] FROM WorkItems WHERE/);
  });
});
