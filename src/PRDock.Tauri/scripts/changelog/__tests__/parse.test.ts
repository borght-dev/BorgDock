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

  it('lifts the first markdown image out of the bullet as the hero', () => {
    const md = `## 1.0.11 — 2026-04-14

### New Features

- **Close PRs** — Some copy. ![Close button](whats-new/1.0.11/close-pr.png) More copy.
`;
    const { releases, imageRefs } = parseChangelog(md);
    const h = releases[0].highlights[0];
    expect(h.hero).toEqual({ src: 'whats-new/1.0.11/close-pr.png', alt: 'Close button' });
    expect(h.description).toBe('Some copy. More copy.');
    expect(imageRefs).toEqual([
      { version: '1.0.11', relPath: 'whats-new/1.0.11/close-pr.png', lineNumber: 5 },
    ]);
  });

  it('uses the highlight title as hero alt when markdown alt is empty', () => {
    const md = `## 1.0.11 — 2026-04-14

### Improvements

- **Build integrity** — Copy. ![](whats-new/1.0.11/ci.png)
`;
    const { releases } = parseChangelog(md);
    expect(releases[0].highlights[0].hero?.alt).toBe('Build integrity');
  });

  it('keeps second and later images inline in the description', () => {
    const md = `## 1.0.11 — 2026-04-14

### New Features

- **Thing** — Text ![](a.png) more ![](b.png).
`;
    const { releases } = parseChangelog(md);
    const h = releases[0].highlights[0];
    expect(h.hero?.src).toBe('a.png');
    expect(h.description).toContain('![](b.png)');
    expect(h.description).not.toContain('![](a.png)');
  });

  it('extracts the first kbd-looking backtick span into keyboard', () => {
    const md = `## 1.0.11 — 2026-04-14

### New Features

- **Close shortcut** — Hit \`Ctrl+Shift+W\` or \`F4\` to close.
`;
    const { releases } = parseChangelog(md);
    expect(releases[0].highlights[0].keyboard).toBe('Ctrl+Shift+W');
  });

  it('ignores non-shortcut backticks', () => {
    const md = `## 1.0.11 — 2026-04-14

### Bug Fixes

- **Fix** — The \`WorktreePruneDialog\` no longer loops.
`;
    const { releases } = parseChangelog(md);
    expect(releases[0].highlights[0].keyboard).toBeNull();
  });

  it('summary is empty when there are no highlights', () => {
    const md = `## 1.0.11 — 2026-04-14\n\n### Bug Fixes\n\n- plain fix.\n`;
    const { releases } = parseChangelog(md);
    expect(releases[0].summary).toBe('');
  });

  it('summary with one highlight ends with a period', () => {
    const md = `## 1.0.11 — 2026-04-14\n\n### New Features\n\n- **Alpha** — desc.\n`;
    const { releases } = parseChangelog(md);
    expect(releases[0].summary).toBe('Alpha.');
  });

  it('summary with two highlights joins with "and"', () => {
    const md = `## 1.0.11 — 2026-04-14\n\n### New Features\n\n- **Alpha** — a.\n- **Beta** — b.\n`;
    const { releases } = parseChangelog(md);
    expect(releases[0].summary).toBe('Alpha and Beta.');
  });

  it('summary with three highlights uses Oxford comma', () => {
    const md = `## 1.0.11 — 2026-04-14\n\n### New Features\n\n- **Alpha** — a.\n- **Beta** — b.\n- **Gamma** — c.\n`;
    const { releases } = parseChangelog(md);
    expect(releases[0].summary).toBe('Alpha, Beta, and Gamma.');
  });

  it('summary with more than three truncates and adds "and more"', () => {
    const md = `## 1.0.11 — 2026-04-14\n\n### New Features\n\n- **A** — a.\n- **B** — b.\n- **C** — c.\n- **D** — d.\n`;
    const { releases } = parseChangelog(md);
    expect(releases[0].summary).toBe('A, B, C, and more.');
  });

  it('autoOpenEligible is true when any highlight is new or improved', () => {
    const mdNew = `## 1.0.11 — 2026-04-14\n\n### New Features\n\n- **A** — a.\n`;
    const mdImp = `## 1.0.11 — 2026-04-14\n\n### Improvements\n\n- **A** — a.\n`;
    const mdFixedOnly = `## 1.0.11 — 2026-04-14\n\n### Bug Fixes\n\n- **A** — a.\n`;
    const mdAlsoOnly = `## 1.0.11 — 2026-04-14\n\n### Bug Fixes\n\n- plain.\n`;
    expect(parseChangelog(mdNew).releases[0].autoOpenEligible).toBe(true);
    expect(parseChangelog(mdImp).releases[0].autoOpenEligible).toBe(true);
    expect(parseChangelog(mdFixedOnly).releases[0].autoOpenEligible).toBe(false);
    expect(parseChangelog(mdAlsoOnly).releases[0].autoOpenEligible).toBe(false);
  });
});
