// src/components/settings/__tests__/settings-search-index.test.ts
import { describe, it, expect } from 'vitest';
import { SETTINGS_FIELDS } from '../settings-search-index';
import { SETTINGS_SECTIONS } from '../sections-catalog';

describe('SETTINGS_FIELDS', () => {
  it('has no duplicate (sectionId, anchorId) pairs', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const f of SETTINGS_FIELDS) {
      const key = `${f.sectionId}.${f.anchorId}`;
      if (seen.has(key)) dupes.push(key);
      seen.add(key);
    }
    expect(dupes).toEqual([]);
  });

  it('only references known section ids', () => {
    const ids = new Set(SETTINGS_SECTIONS.map((s) => s.id));
    const unknown: string[] = [];
    for (const f of SETTINGS_FIELDS) {
      if (!ids.has(f.sectionId)) unknown.push(f.sectionId);
    }
    expect(unknown).toEqual([]);
  });

  it('every section has at least one field', () => {
    const sectionsWithoutFields: string[] = [];
    for (const s of SETTINGS_SECTIONS) {
      const has = SETTINGS_FIELDS.some((f) => f.sectionId === s.id);
      if (!has) sectionsWithoutFields.push(s.id);
    }
    expect(sectionsWithoutFields).toEqual([]);
  });

  it('anchor ids are kebab-case-ish (lowercase + hyphens)', () => {
    const bad = SETTINGS_FIELDS.filter((f) => !/^[a-z0-9-]+$/.test(f.anchorId));
    expect(bad.map((f) => `${f.sectionId}.${f.anchorId}`)).toEqual([]);
  });
});
