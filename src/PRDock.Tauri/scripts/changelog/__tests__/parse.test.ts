import { describe, it, expect } from 'vitest';
import { parseChangelog } from '../parse';

describe('parseChangelog', () => {
  it('extracts version and date from a simple heading', () => {
    const md = `# Changelog\n\n## 1.0.11 — 2026-04-14\n\n### New Features\n\n- **Thing** — Description.\n`;
    const result = parseChangelog(md);
    expect(result.releases).toHaveLength(1);
    expect(result.releases[0].version).toBe('1.0.11');
    expect(result.releases[0].date).toBe('2026-04-14');
  });

  it('returns versions sorted newest first (semver)', () => {
    const md = `# Changelog\n\n## 1.0.3 — 2026-03-10\n\n## 1.0.10 — 2026-04-01\n\n## 1.0.11 — 2026-04-14\n\n## 1.0.2 — 2026-03-10\n`;
    const result = parseChangelog(md);
    expect(result.releases.map((r) => r.version)).toEqual(['1.0.11', '1.0.10', '1.0.3', '1.0.2']);
  });

  it('throws when a version heading is malformed', () => {
    const md = `# Changelog\n\n## v1.0 — today\n`;
    expect(() => parseChangelog(md)).toThrow(/malformed version heading/i);
  });

  it('maps ### sections to highlight kinds', () => {
    const md = `## 1.0.11 — 2026-04-14

### New Features

- **A** — one.

### Improvements

- **B** — two.

### Bug Fixes

- **C** — three.
- plain fix without title.
`;
    const { releases } = parseChangelog(md);
    const r = releases[0];
    expect(r.highlights.map((h) => [h.kind, h.title])).toEqual([
      ['new', 'A'],
      ['improved', 'B'],
      ['fixed', 'C'],
    ]);
    expect(r.alsoFixed).toEqual(['plain fix without title.']);
  });

  it('puts bugfix bullets without **title** into alsoFixed, not highlights', () => {
    const md = `## 1.0.11 — 2026-04-14

### Bug Fixes

- One plain fix.
- Another one.
`;
    const { releases } = parseChangelog(md);
    expect(releases[0].highlights).toHaveLength(0);
    expect(releases[0].alsoFixed).toEqual(['One plain fix.', 'Another one.']);
  });

  it('splits title and description at " — "', () => {
    const md = `## 1.0.11 — 2026-04-14

### New Features

- **Title here** — Description with *markdown*.
`;
    const { releases } = parseChangelog(md);
    expect(releases[0].highlights[0].title).toBe('Title here');
    expect(releases[0].highlights[0].description).toBe('Description with *markdown*.');
  });
});
