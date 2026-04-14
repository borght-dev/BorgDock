# "What's new?" experience — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an in-app "What's new?" window that auto-opens after PRDock updates to a release with user-facing changes and stays reachable from tray/settings for manual recall.

**Architecture:** A Vite plugin parses `CHANGELOG.md` at build time and emits a typed TS module plus copied hero images. A new Tauri window (`whats-new.html` / 520×640) renders this content. A React hook compares the current app version against a persisted `lastSeenVersion` and opens the window when a missed release has a New Features or Improvements section.

**Tech Stack:** TypeScript, React 19, Tailwind v4, Vite 6, Tauri 2, Vitest, `@tauri-apps/plugin-store`, `react-markdown`.

---

## Spec adjustments (read before starting)

Two deviations from the brainstormed spec — kept here for continuity and to avoid surprise during review:

1. **Command Palette entry point is dropped.** The spec listed three manual entries (tray, Command Palette, Settings). Reality: `src/components/command-palette/CommandPalette.tsx` is hard-wired to Azure DevOps work item search — it has no generic action registry. Adding a generic launcher is out of scope. Tray + Settings remain as manual entries.

2. **Two-mode validation.** The spec said "the build fails when current-release highlights are missing an image." Applied literally that breaks `npm run build` on fresh clones because the current `package.json` version (1.0.10, already shipped without images) would trip the check. Refined rule:
   - `npm run build` (always): parse, emit generated module, fail only on (a) malformed CHANGELOG.md or (b) an `![](...)` reference whose file doesn't exist on disk. Does *not* enforce "every highlight has an image".
   - `npm run validate-release -- <VERSION>` (called by `/release` before `git tag`): strict check — every highlight for `<VERSION>` must have a hero image.

Both adjustments preserve the spec's intent. The plan uses them as its source of truth.

---

## File structure

**New authored sources (committed):**

```
docs/whats-new/                                    # Hero image sources
  README.md                                        # Authoring convention
  .gitkeep
src/PRDock.Tauri/scripts/changelog/
  parse.ts                                         # Pure CHANGELOG.md → Release[] parser
  emit.ts                                          # Release[] → generated TS module string
  copy-images.ts                                   # Copies/rewrites hero image paths
  vite-plugin.ts                                   # Wraps parse+emit+copy as a Vite plugin
  validate-release.ts                              # Strict CLI for /release workflow
  types.ts                                         # Parser internal types
  __tests__/parse.test.ts
  __tests__/emit.test.ts
  __tests__/copy-images.test.ts
src/PRDock.Tauri/src/types/whats-new.ts            # Public Release / Highlight types
src/PRDock.Tauri/src/generated/changelog.ts        # Initial stub; overwritten by Vite plugin
src/PRDock.Tauri/src/utils/semver.ts               # semverGt / semverLte / semverEq
src/PRDock.Tauri/src/stores/whats-new-store.ts     # lastSeenVersion + autoOpenDisabled
src/PRDock.Tauri/src/hooks/useWhatsNew.ts          # Auto-open gate + openWhatsNew()
src/PRDock.Tauri/whats-new.html                    # Vite entry
src/PRDock.Tauri/src/whats-new-main.tsx            # React root
src/PRDock.Tauri/src/components/whats-new/
  WhatsNewApp.tsx
  ReleaseAccordion.tsx
  HighlightCard.tsx
  HeroBanner.tsx
  AlsoFixedList.tsx
  useReleasesToShow.ts
  index.ts
  __tests__/WhatsNewApp.test.tsx
  __tests__/ReleaseAccordion.test.tsx
  __tests__/HighlightCard.test.tsx
  __tests__/HeroBanner.test.tsx
  __tests__/useReleasesToShow.test.ts
src/PRDock.Tauri/src/utils/__tests__/semver.test.ts
src/PRDock.Tauri/src/stores/__tests__/whats-new-store.test.ts
src/PRDock.Tauri/src/hooks/__tests__/useWhatsNew.test.ts
```

**Modified files:**

```
.gitignore                                         # Ignore public/whats-new/
src/PRDock.Tauri/package.json                      # Add tsx devDep + validate-release script
src/PRDock.Tauri/vite.config.ts                    # Register plugin + rollup input
src/PRDock.Tauri/src/styles/index.css              # Kind-color CSS vars
src/PRDock.Tauri/src-tauri/src/platform/window.rs  # open_whats_new_window command
src/PRDock.Tauri/src-tauri/src/lib.rs              # Register command in invoke_handler
src/PRDock.Tauri/src-tauri/src/platform/tray.rs    # "What's new…" menu item
src/PRDock.Tauri/src-tauri/capabilities/default.json # Allow open_whats_new_window invoke
src/PRDock.Tauri/src/App.tsx                       # Call useWhatsNew()
src/PRDock.Tauri/src/components/settings/UpdateSection.tsx  # "View release notes" button
src/PRDock.Tauri/src/__tests__/build-integrity.test.ts      # Include whats-new.html
.claude/commands/release.md                        # Hero-image + validator steps
```

**Generated (gitignored):**

```
src/PRDock.Tauri/public/whats-new/<version>/*      # Runtime-served hero images
```

---

## Phase 1 — Scaffolding

### Task 1: Scaffold directories, gitignore, and public types

**Files:**
- Create: `docs/whats-new/README.md`
- Create: `docs/whats-new/.gitkeep`
- Modify: `.gitignore`
- Create: `src/PRDock.Tauri/src/types/whats-new.ts`
- Create: `src/PRDock.Tauri/src/generated/changelog.ts`

- [ ] **Step 1: Create the authored-sources directory with a README**

Create `docs/whats-new/README.md`:

```markdown
# Hero images for "What's new?" window

Drop one PNG, JPG, GIF, or WEBP per highlight into `docs/whats-new/<version>/`,
then reference it from the corresponding bullet in `/CHANGELOG.md`:

    - **Close PRs from the detail panel** — One-line description. ![](whats-new/1.0.11/close-pr.png)

The build-time Vite plugin lifts the image out of the bullet, copies it to
`src/PRDock.Tauri/public/whats-new/<version>/`, and serves it at
`/whats-new/<version>/<name>.png`.

Constraints:
- Current-release highlights require an image (enforced by `npm run validate-release`).
- Historical releases render a gradient fallback when an image is missing.
- First `![](...)` in a bullet is the hero; additional images stay inline in the description.
```

Create `docs/whats-new/.gitkeep` as an empty file.

- [ ] **Step 2: Extend `.gitignore`**

Append to `.gitignore`:

```
## "What's new" generated hero images (sources live in docs/whats-new/)
src/PRDock.Tauri/public/whats-new/
```

- [ ] **Step 3: Add the public types**

Create `src/PRDock.Tauri/src/types/whats-new.ts`:

```ts
export type Kind = 'new' | 'improved' | 'fixed';

export interface Highlight {
  kind: Kind;
  title: string;
  /** Markdown description with the hero image stripped out. */
  description: string;
  /** First markdown image in the bullet, or null. */
  hero: { src: string; alt: string } | null;
  /** First backtick-wrapped shortcut token (e.g. "Ctrl+Shift+W"), if any. */
  keyboard: string | null;
}

export interface Release {
  /** "1.0.11" — strict x.y.z. */
  version: string;
  /** ISO-like "YYYY-MM-DD". */
  date: string;
  /** Auto-generated one-liner shown in the hero and collapsed row. */
  summary: string;
  highlights: Highlight[];
  /** Plain-markdown bullets with no **title** prefix. */
  alsoFixed: string[];
  /** Precomputed: ≥1 highlight with kind 'new' or 'improved'. */
  autoOpenEligible: boolean;
}
```

- [ ] **Step 4: Add the initial generated stub**

Create `src/PRDock.Tauri/src/generated/changelog.ts`:

```ts
// THIS FILE IS GENERATED by scripts/changelog/vite-plugin.ts.
// Edit /CHANGELOG.md and re-run `npm run dev` or `npm run build`.
import type { Release } from '@/types/whats-new';

export const RELEASES: Release[] = [];
```

- [ ] **Step 5: Verify project still builds**

Run: `cd src/PRDock.Tauri && npm run lint`
Expected: no errors for the new files (other unrelated files may warn).

Run: `cd src/PRDock.Tauri && npx tsc -b --noEmit`
Expected: passes with no errors.

- [ ] **Step 6: Commit**

```bash
git add docs/whats-new/ .gitignore \
  src/PRDock.Tauri/src/types/whats-new.ts \
  src/PRDock.Tauri/src/generated/changelog.ts
git commit -m "chore(whats-new): scaffold directories, public types, and generated stub"
```

---

## Phase 2 — CHANGELOG parser

### Task 2: Parser — version + date extraction (TDD)

**Files:**
- Create: `src/PRDock.Tauri/scripts/changelog/types.ts`
- Create: `src/PRDock.Tauri/scripts/changelog/parse.ts`
- Create: `src/PRDock.Tauri/scripts/changelog/__tests__/parse.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/PRDock.Tauri/scripts/changelog/__tests__/parse.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Verify the test fails**

Run: `cd src/PRDock.Tauri && npx vitest run scripts/changelog/__tests__/parse.test.ts`
Expected: FAIL — `Cannot find module '../parse'`.

- [ ] **Step 3: Create internal types**

Create `src/PRDock.Tauri/scripts/changelog/types.ts`:

```ts
import type { Release } from '../../src/types/whats-new';

export type { Release };

export interface ParsedChangelog {
  releases: Release[];
  /** Image references found in the markdown: { version, relPath, lineNumber }. */
  imageRefs: Array<{ version: string; relPath: string; lineNumber: number }>;
}

export interface ParseError extends Error {
  lineNumber?: number;
}
```

- [ ] **Step 4: Implement minimal parse**

Create `src/PRDock.Tauri/scripts/changelog/parse.ts`:

```ts
import type { ParsedChangelog, Release } from './types';

const VERSION_HEADING = /^##\s+(\d+\.\d+\.\d+)\s+—\s+(\d{4}-\d{2}-\d{2})\s*$/;

function semverCompareDesc(a: string, b: string): number {
  const [aMaj, aMin, aPat] = a.split('.').map(Number);
  const [bMaj, bMin, bPat] = b.split('.').map(Number);
  if (aMaj !== bMaj) return bMaj - aMaj;
  if (aMin !== bMin) return bMin - aMin;
  return bPat - aPat;
}

export function parseChangelog(md: string): ParsedChangelog {
  const lines = md.split(/\r?\n/);
  const releases: Release[] = [];
  const imageRefs: ParsedChangelog['imageRefs'] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('## ')) continue;
    if (line.startsWith('### ')) continue;
    const m = line.match(VERSION_HEADING);
    if (!m) {
      const err: Error & { lineNumber?: number } = new Error(
        `malformed version heading at line ${i + 1}: ${line}`,
      );
      err.lineNumber = i + 1;
      throw err;
    }
    releases.push({
      version: m[1],
      date: m[2],
      summary: '',
      highlights: [],
      alsoFixed: [],
      autoOpenEligible: false,
    });
  }

  releases.sort((a, b) => semverCompareDesc(a.version, b.version));
  return { releases, imageRefs };
}
```

- [ ] **Step 5: Verify the test passes**

Run: `cd src/PRDock.Tauri && npx vitest run scripts/changelog/__tests__/parse.test.ts`
Expected: all 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/PRDock.Tauri/scripts/changelog/
git commit -m "feat(whats-new): parser extracts version and date headings"
```

---

### Task 3: Parser — bullets → highlights and alsoFixed

**Files:**
- Modify: `src/PRDock.Tauri/scripts/changelog/parse.ts`
- Modify: `src/PRDock.Tauri/scripts/changelog/__tests__/parse.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/PRDock.Tauri/scripts/changelog/__tests__/parse.test.ts` inside the `describe` block:

```ts
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
```

- [ ] **Step 2: Verify the new tests fail**

Run: `cd src/PRDock.Tauri && npx vitest run scripts/changelog/__tests__/parse.test.ts`
Expected: the three new tests FAIL; earlier ones still pass.

- [ ] **Step 3: Replace parse.ts with a two-pass implementation**

Overwrite `src/PRDock.Tauri/scripts/changelog/parse.ts`:

```ts
import type { ParsedChangelog, Release } from './types';
import type { Highlight, Kind } from '../../src/types/whats-new';

const VERSION_HEADING = /^##\s+(\d+\.\d+\.\d+)\s+—\s+(\d{4}-\d{2}-\d{2})\s*$/;
const SECTION_HEADING = /^###\s+(.+?)\s*$/;
const TITLE_BULLET = /^-\s+\*\*(.+?)\*\*\s*—\s+(.*)$/;
const PLAIN_BULLET = /^-\s+(.+)$/;

const SECTION_TO_KIND: Record<string, Kind> = {
  'New Features': 'new',
  Improvements: 'improved',
  'Bug Fixes': 'fixed',
};

function semverCompareDesc(a: string, b: string): number {
  const [aMaj, aMin, aPat] = a.split('.').map(Number);
  const [bMaj, bMin, bPat] = b.split('.').map(Number);
  if (aMaj !== bMaj) return bMaj - aMaj;
  if (aMin !== bMin) return bMin - aMin;
  return bPat - aPat;
}

function makeHighlight(kind: Kind, title: string, body: string): Highlight {
  return {
    kind,
    title,
    description: body,
    hero: null,
    keyboard: null,
  };
}

export function parseChangelog(md: string): ParsedChangelog {
  const lines = md.split(/\r?\n/);
  const releases: Release[] = [];
  const imageRefs: ParsedChangelog['imageRefs'] = [];

  let currentRelease: Release | null = null;
  let currentKind: Kind | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('## ') && !line.startsWith('### ')) {
      const m = line.match(VERSION_HEADING);
      if (!m) {
        const err: Error & { lineNumber?: number } = new Error(
          `malformed version heading at line ${i + 1}: ${line}`,
        );
        err.lineNumber = i + 1;
        throw err;
      }
      currentRelease = {
        version: m[1],
        date: m[2],
        summary: '',
        highlights: [],
        alsoFixed: [],
        autoOpenEligible: false,
      };
      releases.push(currentRelease);
      currentKind = null;
      continue;
    }

    if (line.startsWith('### ')) {
      const m = line.match(SECTION_HEADING);
      currentKind = (m && SECTION_TO_KIND[m[1]]) ?? null;
      continue;
    }

    if (!currentRelease || !currentKind) continue;

    const titleMatch = line.match(TITLE_BULLET);
    if (titleMatch) {
      currentRelease.highlights.push(
        makeHighlight(currentKind, titleMatch[1], titleMatch[2]),
      );
      continue;
    }

    if (currentKind === 'fixed') {
      const plain = line.match(PLAIN_BULLET);
      if (plain) currentRelease.alsoFixed.push(plain[1]);
    }
  }

  releases.sort((a, b) => semverCompareDesc(a.version, b.version));
  return { releases, imageRefs };
}
```

- [ ] **Step 4: Verify all tests pass**

Run: `cd src/PRDock.Tauri && npx vitest run scripts/changelog/__tests__/parse.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/PRDock.Tauri/scripts/changelog/parse.ts \
  src/PRDock.Tauri/scripts/changelog/__tests__/parse.test.ts
git commit -m "feat(whats-new): parser extracts highlights, alsoFixed, and kinds from sections"
```

---

### Task 4: Parser — hero image and keyboard extraction

**Files:**
- Modify: `src/PRDock.Tauri/scripts/changelog/parse.ts`
- Modify: `src/PRDock.Tauri/scripts/changelog/__tests__/parse.test.ts`

- [ ] **Step 1: Add failing tests**

Append to the same `describe` block in `parse.test.ts`:

```ts
  it('lifts the first markdown image out of the bullet as the hero', () => {
    const md = `## 1.0.11 — 2026-04-14

### New Features

- **Close PRs** — Some copy. ![Close button](whats-new/1.0.11/close-pr.png) More copy.
`;
    const { releases, imageRefs } = parseChangelog(md);
    const h = releases[0].highlights[0];
    expect(h.hero).toEqual({ src: 'whats-new/1.0.11/close-pr.png', alt: 'Close button' });
    expect(h.description).toBe('Some copy.  More copy.');
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
```

- [ ] **Step 2: Verify the new tests fail**

Run: `cd src/PRDock.Tauri && npx vitest run scripts/changelog/__tests__/parse.test.ts`
Expected: 5 new tests FAIL.

- [ ] **Step 3: Extend `makeHighlight` with extraction**

Replace the `makeHighlight` function and add two helpers in `src/PRDock.Tauri/scripts/changelog/parse.ts` (keep the rest of the file unchanged):

```ts
const MD_IMAGE = /!\[([^\]]*)\]\(([^)\s]+)\)/;
const SHORTCUT_TOKEN = /^(?:⌘|⇧|⌃|⌥|Ctrl|Cmd|Command|Alt|Option|Shift|Meta|Super)(?:[+\-](?:⌘|⇧|⌃|⌥|Ctrl|Cmd|Command|Alt|Option|Shift|Meta|Super|[A-Z0-9]|F\d{1,2}))+$|^F\d{1,2}$/;
const BACKTICK_SPAN = /`([^`]+)`/g;

function extractHero(body: string, fallbackAlt: string): {
  body: string;
  hero: Highlight['hero'];
  heroRel: string | null;
} {
  const match = body.match(MD_IMAGE);
  if (!match) return { body, hero: null, heroRel: null };
  const [full, alt, src] = match;
  // Collapse surrounding whitespace: remove the token and any trailing single space.
  const cleaned = body.replace(full, '').replace(/  +/g, ' ').replace(/ +([.,;:!?])/g, '$1');
  return {
    body: cleaned,
    hero: { src, alt: alt.trim() || fallbackAlt },
    heroRel: src,
  };
}

function extractKeyboard(body: string): string | null {
  let m: RegExpExecArray | null;
  const re = new RegExp(BACKTICK_SPAN.source, 'g');
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(body)) !== null) {
    if (SHORTCUT_TOKEN.test(m[1])) return m[1];
  }
  return null;
}

function makeHighlight(kind: Kind, title: string, rawBody: string): {
  highlight: Highlight;
  heroRel: string | null;
} {
  const { body: bodyAfterHero, hero, heroRel } = extractHero(rawBody, title);
  const keyboard = extractKeyboard(bodyAfterHero);
  return {
    highlight: {
      kind,
      title,
      description: bodyAfterHero.trim(),
      hero,
      keyboard,
    },
    heroRel,
  };
}
```

Then change the call sites in `parseChangelog` from:

```ts
    if (titleMatch) {
      currentRelease.highlights.push(
        makeHighlight(currentKind, titleMatch[1], titleMatch[2]),
      );
      continue;
    }
```

to:

```ts
    if (titleMatch) {
      const { highlight, heroRel } = makeHighlight(currentKind, titleMatch[1], titleMatch[2]);
      currentRelease.highlights.push(highlight);
      if (heroRel) {
        imageRefs.push({ version: currentRelease.version, relPath: heroRel, lineNumber: i + 1 });
      }
      continue;
    }
```

- [ ] **Step 4: Verify all tests pass**

Run: `cd src/PRDock.Tauri && npx vitest run scripts/changelog/__tests__/parse.test.ts`
Expected: all 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/PRDock.Tauri/scripts/changelog/parse.ts \
  src/PRDock.Tauri/scripts/changelog/__tests__/parse.test.ts
git commit -m "feat(whats-new): parser extracts hero image and keyboard shortcut per highlight"
```

---

### Task 5: Parser — summary and autoOpenEligible

**Files:**
- Modify: `src/PRDock.Tauri/scripts/changelog/parse.ts`
- Modify: `src/PRDock.Tauri/scripts/changelog/__tests__/parse.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `parse.test.ts`:

```ts
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
```

- [ ] **Step 2: Verify failures**

Run: `cd src/PRDock.Tauri && npx vitest run scripts/changelog/__tests__/parse.test.ts`
Expected: 6 new tests FAIL.

- [ ] **Step 3: Implement summary + eligibility**

Add this helper at the bottom of `parse.ts`:

```ts
function deriveSummary(highlights: Highlight[]): string {
  const titles = highlights.map((h) => h.title);
  if (titles.length === 0) return '';
  if (titles.length === 1) return `${titles[0]}.`;
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}.`;
  if (titles.length === 3) return `${titles[0]}, ${titles[1]}, and ${titles[2]}.`;
  return `${titles[0]}, ${titles[1]}, ${titles[2]}, and more.`;
}
```

In `parseChangelog`, replace the final sort block with:

```ts
  for (const r of releases) {
    r.summary = deriveSummary(r.highlights);
    r.autoOpenEligible = r.highlights.some((h) => h.kind === 'new' || h.kind === 'improved');
  }

  releases.sort((a, b) => semverCompareDesc(a.version, b.version));
  return { releases, imageRefs };
```

- [ ] **Step 4: Verify all tests pass**

Run: `cd src/PRDock.Tauri && npx vitest run scripts/changelog/__tests__/parse.test.ts`
Expected: all 17 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/PRDock.Tauri/scripts/changelog/parse.ts \
  src/PRDock.Tauri/scripts/changelog/__tests__/parse.test.ts
git commit -m "feat(whats-new): parser derives summary and autoOpenEligible per release"
```

---

## Phase 3 — Emitter and image copy

### Task 6: Emit — generate typed TS module

**Files:**
- Create: `src/PRDock.Tauri/scripts/changelog/emit.ts`
- Create: `src/PRDock.Tauri/scripts/changelog/__tests__/emit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/PRDock.Tauri/scripts/changelog/__tests__/emit.test.ts`:

```ts
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
    expect(out).toContain(`'1.0.11'`);
    expect(out).toContain(`/whats-new/1.0.11/a.png`);
    expect(out).toContain(`"Ctrl+Shift+W"`);
    expect(out).toMatch(/autoOpenEligible: true/);
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
```

- [ ] **Step 2: Verify the test fails**

Run: `cd src/PRDock.Tauri && npx vitest run scripts/changelog/__tests__/emit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the emitter**

Create `src/PRDock.Tauri/scripts/changelog/emit.ts`:

```ts
import type { Release } from '../../src/types/whats-new';

function toServedUrl(relPath: string): string {
  // relPath like "whats-new/1.0.11/close-pr.png" → "/whats-new/1.0.11/close-pr.png"
  return '/' + relPath.replace(/^\/+/, '');
}

function rewriteReleases(releases: Release[]): Release[] {
  return releases.map((r) => ({
    ...r,
    highlights: r.highlights.map((h) => ({
      ...h,
      hero: h.hero ? { src: toServedUrl(h.hero.src), alt: h.hero.alt } : null,
    })),
  }));
}

export function emitModule(releases: Release[]): string {
  const rewritten = rewriteReleases(releases);
  const body = JSON.stringify(rewritten, null, 2);
  return `// THIS FILE IS GENERATED by scripts/changelog/vite-plugin.ts.
// Edit /CHANGELOG.md and re-run \`npm run dev\` or \`npm run build\`.
import type { Release } from '@/types/whats-new';

export const RELEASES: Release[] = ${body};
`;
}
```

- [ ] **Step 4: Verify the test passes**

Run: `cd src/PRDock.Tauri && npx vitest run scripts/changelog/__tests__/emit.test.ts`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/PRDock.Tauri/scripts/changelog/emit.ts \
  src/PRDock.Tauri/scripts/changelog/__tests__/emit.test.ts
git commit -m "feat(whats-new): emit typed TS module from parsed releases"
```

---

### Task 7: copy-images — validate references and copy to public/

**Files:**
- Create: `src/PRDock.Tauri/scripts/changelog/copy-images.ts`
- Create: `src/PRDock.Tauri/scripts/changelog/__tests__/copy-images.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/PRDock.Tauri/scripts/changelog/__tests__/copy-images.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncImages } from '../copy-images';

let tmp: string;
let docsRoot: string;
let publicRoot: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-copy-'));
  docsRoot = path.join(tmp, 'docs', 'whats-new');
  publicRoot = path.join(tmp, 'public', 'whats-new');
  fs.mkdirSync(path.join(docsRoot, '1.0.11'), { recursive: true });
  fs.writeFileSync(path.join(docsRoot, '1.0.11', 'close-pr.png'), 'PNGDATA');
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('syncImages', () => {
  it('copies referenced images into public/whats-new/<version>/', () => {
    syncImages({
      refs: [{ version: '1.0.11', relPath: 'whats-new/1.0.11/close-pr.png', lineNumber: 10 }],
      docsRoot,
      publicRoot,
    });
    const copied = path.join(publicRoot, '1.0.11', 'close-pr.png');
    expect(fs.existsSync(copied)).toBe(true);
    expect(fs.readFileSync(copied, 'utf8')).toBe('PNGDATA');
  });

  it('throws when a referenced image is missing on disk', () => {
    expect(() =>
      syncImages({
        refs: [{ version: '1.0.11', relPath: 'whats-new/1.0.11/missing.png', lineNumber: 10 }],
        docsRoot,
        publicRoot,
      }),
    ).toThrow(/CHANGELOG\.md:10/);
  });

  it('deduplicates and skips no-op copies when content is unchanged', () => {
    // Seed an identical file in public/ already.
    fs.mkdirSync(path.join(publicRoot, '1.0.11'), { recursive: true });
    fs.writeFileSync(path.join(publicRoot, '1.0.11', 'close-pr.png'), 'PNGDATA');
    const mtimeBefore = fs.statSync(path.join(publicRoot, '1.0.11', 'close-pr.png')).mtimeMs;

    syncImages({
      refs: [
        { version: '1.0.11', relPath: 'whats-new/1.0.11/close-pr.png', lineNumber: 10 },
        { version: '1.0.11', relPath: 'whats-new/1.0.11/close-pr.png', lineNumber: 12 },
      ],
      docsRoot,
      publicRoot,
    });

    const mtimeAfter = fs.statSync(path.join(publicRoot, '1.0.11', 'close-pr.png')).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });
});
```

- [ ] **Step 2: Verify the test fails**

Run: `cd src/PRDock.Tauri && npx vitest run scripts/changelog/__tests__/copy-images.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `syncImages`**

Create `src/PRDock.Tauri/scripts/changelog/copy-images.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import type { ParsedChangelog } from './types';

export interface SyncImagesInput {
  refs: ParsedChangelog['imageRefs'];
  /** Directory that contains `<version>/` subfolders with source PNGs. */
  docsRoot: string;
  /** Destination directory that Vite serves statically. */
  publicRoot: string;
}

function relativeToDocs(relPath: string): string {
  // "whats-new/1.0.11/close-pr.png" → "1.0.11/close-pr.png"
  const prefix = 'whats-new/';
  if (!relPath.startsWith(prefix)) {
    throw new Error(`unexpected image path "${relPath}" — must start with "whats-new/"`);
  }
  return relPath.slice(prefix.length);
}

function sameContent(a: string, b: string): boolean {
  try {
    const ab = fs.readFileSync(a);
    const bb = fs.readFileSync(b);
    if (ab.byteLength !== bb.byteLength) return false;
    return ab.equals(bb);
  } catch {
    return false;
  }
}

export function syncImages({ refs, docsRoot, publicRoot }: SyncImagesInput): string[] {
  const seen = new Set<string>();
  const copied: string[] = [];

  for (const ref of refs) {
    const rel = relativeToDocs(ref.relPath);
    if (seen.has(rel)) continue;
    seen.add(rel);

    const src = path.join(docsRoot, rel);
    if (!fs.existsSync(src)) {
      throw new Error(
        `CHANGELOG.md:${ref.lineNumber} references missing image "${ref.relPath}". ` +
          `Add ${path.join('docs', 'whats-new', rel)} or remove the ![](...) from the bullet.`,
      );
    }

    const dst = path.join(publicRoot, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });

    if (sameContent(src, dst)) continue;
    fs.copyFileSync(src, dst);
    copied.push(dst);
  }

  return copied;
}
```

- [ ] **Step 4: Verify the test passes**

Run: `cd src/PRDock.Tauri && npx vitest run scripts/changelog/__tests__/copy-images.test.ts`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/PRDock.Tauri/scripts/changelog/copy-images.ts \
  src/PRDock.Tauri/scripts/changelog/__tests__/copy-images.test.ts
git commit -m "feat(whats-new): copy-images validates references and mirrors to public dir"
```

---

## Phase 4 — Vite plugin and release validator

### Task 8: Vite plugin — wrap parse + emit + sync

**Files:**
- Create: `src/PRDock.Tauri/scripts/changelog/vite-plugin.ts`
- Modify: `src/PRDock.Tauri/vite.config.ts`

- [ ] **Step 1: Write the plugin**

Create `src/PRDock.Tauri/scripts/changelog/vite-plugin.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { parseChangelog } from './parse';
import { emitModule } from './emit';
import { syncImages } from './copy-images';

interface PluginOptions {
  /** Monorepo/package root. Paths below are resolved relative to this. */
  packageRoot: string;
  /** Repo root (where CHANGELOG.md lives). */
  repoRoot: string;
}

function run({ packageRoot, repoRoot }: PluginOptions): void {
  const changelogPath = path.join(repoRoot, 'CHANGELOG.md');
  const docsRoot = path.join(repoRoot, 'docs', 'whats-new');
  const publicRoot = path.join(packageRoot, 'public', 'whats-new');
  const outPath = path.join(packageRoot, 'src', 'generated', 'changelog.ts');

  const md = fs.readFileSync(changelogPath, 'utf8');
  const parsed = parseChangelog(md);
  syncImages({ refs: parsed.imageRefs, docsRoot, publicRoot });

  const next = emitModule(parsed.releases);
  const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
  if (current !== next) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, next, 'utf8');
  }
}

export function changelogPlugin(options: PluginOptions): Plugin {
  return {
    name: 'prdock-whats-new-changelog',
    buildStart() {
      run(options);
    },
    configureServer(server: ViteDevServer) {
      const watchPaths = [
        path.join(options.repoRoot, 'CHANGELOG.md'),
        path.join(options.repoRoot, 'docs', 'whats-new'),
      ];
      for (const p of watchPaths) server.watcher.add(p);
      server.watcher.on('change', (changed) => {
        if (
          changed === path.join(options.repoRoot, 'CHANGELOG.md') ||
          changed.startsWith(path.join(options.repoRoot, 'docs', 'whats-new') + path.sep)
        ) {
          try {
            run(options);
          } catch (err) {
            server.config.logger.error(
              `[whats-new] changelog plugin error: ${(err as Error).message}`,
            );
          }
        }
      });
    },
  };
}
```

- [ ] **Step 2: Register the plugin in `vite.config.ts`**

In `src/PRDock.Tauri/vite.config.ts`:

At the top, add:

```ts
import { changelogPlugin } from "./scripts/changelog/vite-plugin";
```

Inside `defineConfig({ plugins: [...] })`, add after `tailwindcss()`:

```ts
    changelogPlugin({
      packageRoot: __dirname,
      repoRoot: path.resolve(__dirname, "../.."),
    }),
```

- [ ] **Step 3: Verify dev mode regenerates the file**

First, delete the stub content (the plugin should regenerate):

Run: `cd src/PRDock.Tauri && rm -f src/generated/changelog.ts && npx vite build 2>&1 | head -40`

Expected: no errors; the build completes.

Run: `cat src/PRDock.Tauri/src/generated/changelog.ts | head -5`

Expected: starts with `// THIS FILE IS GENERATED` and contains a populated `RELEASES` array with 1.0.10 etc.

- [ ] **Step 4: Regenerate and confirm TS still compiles**

Run: `cd src/PRDock.Tauri && npx tsc -b --noEmit`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/PRDock.Tauri/scripts/changelog/vite-plugin.ts \
  src/PRDock.Tauri/vite.config.ts \
  src/PRDock.Tauri/src/generated/changelog.ts
git commit -m "feat(whats-new): wire Vite plugin so dev and build regenerate the module"
```

---

### Task 9: Release-strict validator CLI

**Files:**
- Create: `src/PRDock.Tauri/scripts/changelog/validate-release.ts`
- Modify: `src/PRDock.Tauri/package.json`

- [ ] **Step 1: Add `tsx` as a devDependency**

Run: `cd src/PRDock.Tauri && npm install --save-dev tsx@^4.19.0`

Expected: package.json gains `"tsx": "^4.19.0"` under `devDependencies`.

- [ ] **Step 2: Add the validator script**

Create `src/PRDock.Tauri/scripts/changelog/validate-release.ts`:

```ts
#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { parseChangelog } from './parse';

function fail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(`validate-release: ${msg}`);
  process.exit(1);
}

function main() {
  const version = process.argv[2];
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`usage: validate-release <VERSION>  (got "${version ?? ''}")`);
  }

  const packageRoot = path.resolve(__dirname, '../..');
  const repoRoot = path.resolve(packageRoot, '../..');
  const changelogPath = path.join(repoRoot, 'CHANGELOG.md');

  if (!fs.existsSync(changelogPath)) fail(`${changelogPath} does not exist`);

  const md = fs.readFileSync(changelogPath, 'utf8');
  const { releases } = parseChangelog(md);
  const target = releases.find((r) => r.version === version);
  if (!target) fail(`no CHANGELOG entry for ${version}`);

  const missing = target.highlights.filter((h) => !h.hero);
  if (missing.length > 0) {
    const lines = missing
      .map(
        (h) =>
          `  - "${h.title}" (${h.kind}): add docs/whats-new/${version}/<slug>.png and reference it as ![](whats-new/${version}/<slug>.png), or remove **bold title** to demote it to "Also fixed".`,
      )
      .join('\n');
    fail(`${missing.length} highlight(s) in ${version} have no hero image:\n${lines}`);
  }

  // eslint-disable-next-line no-console
  console.log(`validate-release: ${version} OK (${target.highlights.length} highlights)`);
}

main();
```

- [ ] **Step 3: Add `validate-release` npm script**

In `src/PRDock.Tauri/package.json`, in the `"scripts"` object, add:

```json
    "validate-release": "tsx scripts/changelog/validate-release.ts"
```

- [ ] **Step 4: Smoke-test the validator against an intentionally-missing case**

Run: `cd src/PRDock.Tauri && npm run validate-release -- 1.0.99 2>&1 || true`

Expected: exits non-zero with message `no CHANGELOG entry for 1.0.99`.

Run: `cd src/PRDock.Tauri && npm run validate-release -- 1.0.2 2>&1 || true`

Expected: exits non-zero with message mentioning `"Notification windows are no longer transparent"` has no hero image (or similar; 1.0.2 is shipped without images).

Run: `cd src/PRDock.Tauri && npm run validate-release -- 0.0.6`

Expected: exits 0 with `OK (0 highlights)` — 0.0.6 was bugfix-only.

- [ ] **Step 5: Commit**

```bash
git add src/PRDock.Tauri/scripts/changelog/validate-release.ts \
  src/PRDock.Tauri/package.json \
  src/PRDock.Tauri/package-lock.json
git commit -m "feat(whats-new): add validate-release CLI for strict pre-tag checks"
```

---

## Phase 5 — Utilities and state

### Task 10: semver helpers

**Files:**
- Create: `src/PRDock.Tauri/src/utils/semver.ts`
- Create: `src/PRDock.Tauri/src/utils/__tests__/semver.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/PRDock.Tauri/src/utils/__tests__/semver.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
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
```

- [ ] **Step 2: Verify it fails**

Run: `cd src/PRDock.Tauri && npx vitest run src/utils/__tests__/semver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/PRDock.Tauri/src/utils/semver.ts`:

```ts
function parts(v: string): [number, number, number] {
  const [maj, min, pat] = v.split('.').map(Number);
  return [maj, min, pat];
}

export function semverEq(a: string, b: string): boolean {
  return a === b;
}

export function semverGt(a: string, b: string): boolean {
  const [aMaj, aMin, aPat] = parts(a);
  const [bMaj, bMin, bPat] = parts(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPat > bPat;
}

export function semverLte(a: string, b: string): boolean {
  return !semverGt(a, b);
}
```

- [ ] **Step 4: Verify all tests pass**

Run: `cd src/PRDock.Tauri && npx vitest run src/utils/__tests__/semver.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/PRDock.Tauri/src/utils/
git commit -m "feat(whats-new): add strict x.y.z semver comparison helpers"
```

---

### Task 11: whats-new persistent store

**Files:**
- Create: `src/PRDock.Tauri/src/stores/whats-new-store.ts`
- Create: `src/PRDock.Tauri/src/stores/__tests__/whats-new-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/PRDock.Tauri/src/stores/__tests__/whats-new-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const storeMock = {
  get: vi.fn(),
  set: vi.fn(),
  save: vi.fn(),
};

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(async () => storeMock),
}));

import { useWhatsNewStore } from '../whats-new-store';

describe('whats-new-store', () => {
  beforeEach(() => {
    storeMock.get.mockReset();
    storeMock.set.mockReset();
    storeMock.save.mockReset();
    useWhatsNewStore.setState({
      lastSeenVersion: null,
      autoOpenDisabled: false,
      hydrated: false,
    });
  });

  it('hydrate reads both keys from tauri-plugin-store', async () => {
    storeMock.get.mockImplementation(async (key: string) => {
      if (key === 'lastSeenVersion') return '1.0.10';
      if (key === 'autoOpenDisabled') return true;
      return null;
    });
    await useWhatsNewStore.getState().hydrate();
    expect(useWhatsNewStore.getState()).toMatchObject({
      lastSeenVersion: '1.0.10',
      autoOpenDisabled: true,
      hydrated: true,
    });
  });

  it('setLastSeenVersion updates state and persists', async () => {
    await useWhatsNewStore.getState().hydrate();
    storeMock.set.mockClear();
    storeMock.save.mockClear();
    await useWhatsNewStore.getState().setLastSeenVersion('1.0.11');
    expect(useWhatsNewStore.getState().lastSeenVersion).toBe('1.0.11');
    expect(storeMock.set).toHaveBeenCalledWith('lastSeenVersion', '1.0.11');
    expect(storeMock.save).toHaveBeenCalled();
  });

  it('disableAutoOpen flips the flag and bumps lastSeenVersion', async () => {
    await useWhatsNewStore.getState().hydrate();
    storeMock.set.mockClear();
    await useWhatsNewStore.getState().disableAutoOpen('1.0.11');
    const state = useWhatsNewStore.getState();
    expect(state.autoOpenDisabled).toBe(true);
    expect(state.lastSeenVersion).toBe('1.0.11');
    expect(storeMock.set).toHaveBeenCalledWith('autoOpenDisabled', true);
    expect(storeMock.set).toHaveBeenCalledWith('lastSeenVersion', '1.0.11');
  });
});
```

- [ ] **Step 2: Verify it fails**

Run: `cd src/PRDock.Tauri && npx vitest run src/stores/__tests__/whats-new-store.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the store**

Create `src/PRDock.Tauri/src/stores/whats-new-store.ts`:

```ts
import { create } from 'zustand';
import { createLogger } from '@/services/logger';

const log = createLogger('whats-new-store');

interface State {
  lastSeenVersion: string | null;
  autoOpenDisabled: boolean;
  hydrated: boolean;
}

interface Actions {
  hydrate(): Promise<void>;
  setLastSeenVersion(version: string): Promise<void>;
  disableAutoOpen(currentVersion: string): Promise<void>;
}

async function getStore() {
  const { load } = await import('@tauri-apps/plugin-store');
  return load('whats-new-state.json');
}

export const useWhatsNewStore = create<State & Actions>((set, get) => ({
  lastSeenVersion: null,
  autoOpenDisabled: false,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const store = await getStore();
      const lastSeenVersion = (await store.get<string>('lastSeenVersion')) ?? null;
      const autoOpenDisabled = (await store.get<boolean>('autoOpenDisabled')) ?? false;
      set({ lastSeenVersion, autoOpenDisabled, hydrated: true });
    } catch (err) {
      log.warn('hydrate failed — starting with defaults', err);
      set({ hydrated: true });
    }
  },

  setLastSeenVersion: async (version) => {
    set({ lastSeenVersion: version });
    try {
      const store = await getStore();
      await store.set('lastSeenVersion', version);
      await store.save();
    } catch (err) {
      log.warn('setLastSeenVersion persist failed', err);
    }
  },

  disableAutoOpen: async (currentVersion) => {
    set({ autoOpenDisabled: true, lastSeenVersion: currentVersion });
    try {
      const store = await getStore();
      await store.set('autoOpenDisabled', true);
      await store.set('lastSeenVersion', currentVersion);
      await store.save();
    } catch (err) {
      log.warn('disableAutoOpen persist failed', err);
    }
  },
}));
```

- [ ] **Step 4: Verify all tests pass**

Run: `cd src/PRDock.Tauri && npx vitest run src/stores/__tests__/whats-new-store.test.ts`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/PRDock.Tauri/src/stores/
git commit -m "feat(whats-new): zustand store persists lastSeenVersion and autoOpenDisabled"
```

---

### Task 12: useWhatsNew hook — gate + openWhatsNew

**Files:**
- Create: `src/PRDock.Tauri/src/hooks/useWhatsNew.ts`
- Create: `src/PRDock.Tauri/src/hooks/__tests__/useWhatsNew.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/PRDock.Tauri/src/hooks/__tests__/useWhatsNew.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

const getVersionMock = vi.fn();
vi.mock('@tauri-apps/api/app', () => ({ getVersion: getVersionMock }));

const storeState = {
  lastSeenVersion: null as string | null,
  autoOpenDisabled: false,
  hydrated: false,
  hydrate: vi.fn(async () => {}),
  setLastSeenVersion: vi.fn(async (v: string) => {
    storeState.lastSeenVersion = v;
  }),
  disableAutoOpen: vi.fn(async (v: string) => {
    storeState.autoOpenDisabled = true;
    storeState.lastSeenVersion = v;
  }),
};
vi.mock('@/stores/whats-new-store', () => ({
  useWhatsNewStore: Object.assign(() => storeState, {
    getState: () => storeState,
    setState: (partial: Partial<typeof storeState>) => Object.assign(storeState, partial),
  }),
}));

const RELEASES_VALUE: Array<{
  version: string;
  autoOpenEligible: boolean;
  highlights: unknown[];
  alsoFixed: unknown[];
  date: string;
  summary: string;
}> = [];
vi.mock('@/generated/changelog', () => ({
  get RELEASES() {
    return RELEASES_VALUE;
  },
}));

import { useWhatsNew } from '../useWhatsNew';

beforeEach(() => {
  invokeMock.mockReset();
  getVersionMock.mockReset();
  storeState.lastSeenVersion = null;
  storeState.autoOpenDisabled = false;
  storeState.hydrated = false;
  storeState.hydrate.mockClear();
  storeState.setLastSeenVersion.mockClear();
  storeState.disableAutoOpen.mockClear();
  RELEASES_VALUE.length = 0;
});

describe('useWhatsNew', () => {
  it('seeds lastSeenVersion on first run and does not auto-open', async () => {
    getVersionMock.mockResolvedValue('1.0.11');
    storeState.hydrate.mockImplementation(async () => {
      storeState.hydrated = true;
    });

    renderHook(() => useWhatsNew());

    await waitFor(() => {
      expect(storeState.setLastSeenVersion).toHaveBeenCalledWith('1.0.11');
    });
    expect(invokeMock).not.toHaveBeenCalledWith('open_whats_new_window', expect.anything());
  });

  it('auto-opens when a missed release is eligible', async () => {
    getVersionMock.mockResolvedValue('1.0.11');
    storeState.hydrate.mockImplementation(async () => {
      storeState.hydrated = true;
      storeState.lastSeenVersion = '1.0.9';
    });
    RELEASES_VALUE.push(
      {
        version: '1.0.11',
        date: '2026-04-14',
        summary: 's',
        highlights: [],
        alsoFixed: [],
        autoOpenEligible: true,
      },
      {
        version: '1.0.10',
        date: '2026-04-01',
        summary: '',
        highlights: [],
        alsoFixed: [],
        autoOpenEligible: false,
      },
    );

    renderHook(() => useWhatsNew());

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('open_whats_new_window', { version: null });
    });
  });

  it('does not auto-open when only bugfix-only releases were missed', async () => {
    getVersionMock.mockResolvedValue('1.0.11');
    storeState.hydrate.mockImplementation(async () => {
      storeState.hydrated = true;
      storeState.lastSeenVersion = '1.0.10';
    });
    RELEASES_VALUE.push({
      version: '1.0.11',
      date: '2026-04-14',
      summary: '',
      highlights: [],
      alsoFixed: ['fix'],
      autoOpenEligible: false,
    });

    renderHook(() => useWhatsNew());

    await waitFor(() => {
      expect(storeState.hydrate).toHaveBeenCalled();
    });
    expect(invokeMock).not.toHaveBeenCalledWith('open_whats_new_window', expect.anything());
  });

  it('does not auto-open when autoOpenDisabled is true', async () => {
    getVersionMock.mockResolvedValue('1.0.11');
    storeState.hydrate.mockImplementation(async () => {
      storeState.hydrated = true;
      storeState.lastSeenVersion = '1.0.9';
      storeState.autoOpenDisabled = true;
    });
    RELEASES_VALUE.push({
      version: '1.0.11',
      date: '2026-04-14',
      summary: 's',
      highlights: [],
      alsoFixed: [],
      autoOpenEligible: true,
    });

    renderHook(() => useWhatsNew());

    await waitFor(() => {
      expect(storeState.hydrate).toHaveBeenCalled();
    });
    expect(invokeMock).not.toHaveBeenCalledWith('open_whats_new_window', expect.anything());
  });
});
```

- [ ] **Step 2: Verify it fails**

Run: `cd src/PRDock.Tauri && npx vitest run src/hooks/__tests__/useWhatsNew.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the hook**

Create `src/PRDock.Tauri/src/hooks/useWhatsNew.ts`:

```ts
import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { RELEASES } from '@/generated/changelog';
import { semverGt, semverLte } from '@/utils/semver';
import { useWhatsNewStore } from '@/stores/whats-new-store';
import { createLogger } from '@/services/logger';

const log = createLogger('useWhatsNew');

export async function openWhatsNew(version: string | null = null): Promise<void> {
  try {
    await invoke('open_whats_new_window', { version });
  } catch (err) {
    log.error('open_whats_new_window failed', err);
  }
}

export function useWhatsNew(): void {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      let currentVersion: string;
      try {
        currentVersion = await getVersion();
      } catch {
        currentVersion = '0.0.0';
      }

      await useWhatsNewStore.getState().hydrate();
      const { lastSeenVersion, autoOpenDisabled } = useWhatsNewStore.getState();

      if (lastSeenVersion === null) {
        // First run of this feature on this machine — silently seed.
        await useWhatsNewStore.getState().setLastSeenVersion(currentVersion);
        log.info('first run, seeded lastSeenVersion', { currentVersion });
        return;
      }

      if (autoOpenDisabled) {
        log.info('autoOpenDisabled — skipping auto-open');
        return;
      }

      const missed = RELEASES.filter(
        (r) => semverGt(r.version, lastSeenVersion) && semverLte(r.version, currentVersion),
      );
      if (missed.some((r) => r.autoOpenEligible)) {
        log.info('auto-opening whats-new', { missed: missed.map((r) => r.version) });
        await openWhatsNew(null);
      } else {
        log.info('no eligible missed release — not opening', {
          lastSeenVersion,
          currentVersion,
          missedCount: missed.length,
        });
      }
    })();
  }, []);
}
```

- [ ] **Step 4: Verify all tests pass**

Run: `cd src/PRDock.Tauri && npx vitest run src/hooks/__tests__/useWhatsNew.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/PRDock.Tauri/src/hooks/
git commit -m "feat(whats-new): useWhatsNew hook seeds on first run and opens on missed releases"
```

---

## Phase 6 — Tauri window + entry point

### Task 13: Rust `open_whats_new_window` command

**Files:**
- Modify: `src/PRDock.Tauri/src-tauri/src/platform/window.rs`
- Modify: `src/PRDock.Tauri/src-tauri/src/lib.rs`
- Modify: `src/PRDock.Tauri/src-tauri/capabilities/default.json`

- [ ] **Step 1: Add the command at the bottom of `window.rs`**

Append to `src/PRDock.Tauri/src-tauri/src/platform/window.rs`:

```rust
#[tauri::command]
pub async fn open_whats_new_window(
    app: tauri::AppHandle,
    version: Option<String>,
) -> Result<(), String> {
    let label = "whats-new";
    log::info!("open_whats_new_window: entry version={:?}", version);

    if let Some(existing) = app.get_webview_window(label) {
        log::info!("open_whats_new_window: reusing existing window");
        if let Some(ref v) = version {
            let v_json = serde_json::to_string(v).map_err(|e| e.to_string())?;
            let _ = existing.eval(&format!(
                "window.dispatchEvent(new CustomEvent('whats-new:navigate', {{ detail: {} }}))",
                v_json
            ));
        }
        existing.show().map_err(|e| e.to_string())?;
        existing.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let version_json = match &version {
        Some(v) => serde_json::to_string(v).map_err(|e| e.to_string())?,
        None => "null".to_string(),
    };
    let init_script = format!(
        "window.__PRDOCK_WHATS_NEW__ = {{ version: {} }};",
        version_json
    );

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let app_for_build = app.clone();

    app.run_on_main_thread(move || {
        let result = WebviewWindowBuilder::new(
            &app_for_build,
            label,
            WebviewUrl::App("whats-new.html".into()),
        )
        .title("What's new in PRDock")
        .inner_size(520.0, 640.0)
        .min_inner_size(480.0, 480.0)
        .resizable(true)
        .skip_taskbar(true)
        .center()
        .focused(true)
        .initialization_script(&init_script)
        .build();

        let send_result = match result {
            Ok(win) => {
                let _ = win.show();
                let _ = win.set_focus();
                let _ = win.set_skip_taskbar(true);
                let win_repaint = win.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(200));
                    let _ = win_repaint.set_focus();
                    force_repaint(&win_repaint);
                });
                Ok(())
            }
            Err(e) => {
                log::error!("open_whats_new_window: build failed: {e}");
                Err(e.to_string())
            }
        };
        let _ = tx.send(send_result);
    })
    .map_err(|e| e.to_string())?;

    rx.await.map_err(|e| e.to_string())?
}
```

- [ ] **Step 2: Register in `invoke_handler!`**

In `src/PRDock.Tauri/src-tauri/src/lib.rs`, locate the `// Window` block in `invoke_handler![]` and add:

```rust
            platform::window::open_whats_new_window,
```

right after `platform::window::open_pr_detail_window,`.

- [ ] **Step 3: Allow the command in capabilities**

In `src/PRDock.Tauri/src-tauri/capabilities/default.json`, find the `"permissions"` array. Locate the existing command-permission entry (e.g. for `open_pr_detail_window`). Add the new entry next to it. Example addition to the permissions array:

```json
        "core:window:default",
        "core:webview:default"
```

If permissions are listed as object entries like `{ "identifier": "...", "allow": [...] }`, append `"open_whats_new_window"` to the allow list that already contains `"open_pr_detail_window"`. Run the following to inspect the file first:

Run: `cat src/PRDock.Tauri/src-tauri/capabilities/default.json`

Then edit it to add `open_whats_new_window` to whichever section already allows `open_pr_detail_window`. (The exact structure depends on how capabilities are currently configured; the pattern is: wherever `open_pr_detail_window` lives, add `open_whats_new_window` beside it.)

- [ ] **Step 4: Verify the Rust side builds**

Run: `cd src/PRDock.Tauri/src-tauri && cargo build 2>&1 | tail -20`
Expected: compilation succeeds. If a warning appears about unused imports (e.g. `serde_json`), add a `use` for it at the top of `window.rs`.

- [ ] **Step 5: Commit**

```bash
git add src/PRDock.Tauri/src-tauri/src/platform/window.rs \
  src/PRDock.Tauri/src-tauri/src/lib.rs \
  src/PRDock.Tauri/src-tauri/capabilities/default.json
git commit -m "feat(whats-new): Tauri open_whats_new_window command at 520x640"
```

---

### Task 14: Vite entry — whats-new.html + whats-new-main.tsx

**Files:**
- Create: `src/PRDock.Tauri/whats-new.html`
- Create: `src/PRDock.Tauri/src/whats-new-main.tsx`
- Modify: `src/PRDock.Tauri/vite.config.ts`

- [ ] **Step 1: Create the HTML entry**

Create `src/PRDock.Tauri/whats-new.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>What's new in PRDock</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/whats-new-main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create the React bootstrap**

Create `src/PRDock.Tauri/src/whats-new-main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import { WhatsNewApp } from './components/whats-new/WhatsNewApp';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { attachConsoleBridge, createLogger } from './services/logger';

attachConsoleBridge();
const log = createLogger('whats-new-boot');

window.addEventListener('error', (e) => {
  log.error('window error', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  log.error('unhandled rejection', e.reason);
});

const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.classList.toggle('dark', isDark);

try {
  const root = document.getElementById('root');
  if (!root) throw new Error('#root not found in whats-new.html');
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <WhatsNewApp />
      </ErrorBoundary>
    </React.StrictMode>,
  );
  log.info('React mounted');
} catch (err) {
  log.error('mount failed', err);
  document.body.innerHTML = `<pre style="padding:16px;color:#f87171;font:12px monospace;white-space:pre-wrap;">What's new failed to mount:\n${String(err)}</pre>`;
}
```

- [ ] **Step 3: Register the rollup input**

In `src/PRDock.Tauri/vite.config.ts`, under `build.rollupOptions.input`, add:

```ts
        'whats-new': path.resolve(__dirname, "whats-new.html"),
```

- [ ] **Step 4: Create a minimal WhatsNewApp stub so the build compiles**

Create `src/PRDock.Tauri/src/components/whats-new/WhatsNewApp.tsx`:

```tsx
export function WhatsNewApp() {
  return <div>Loading…</div>;
}
```

And `src/PRDock.Tauri/src/components/whats-new/index.ts`:

```ts
export { WhatsNewApp } from './WhatsNewApp';
```

- [ ] **Step 5: Verify it builds**

Run: `cd src/PRDock.Tauri && npx tsc -b --noEmit && npx vite build 2>&1 | tail -20`
Expected: build succeeds; emitted output includes `whats-new.html` in `dist/`.

Run: `ls src/PRDock.Tauri/dist/whats-new.html`
Expected: file exists.

- [ ] **Step 6: Commit**

```bash
git add src/PRDock.Tauri/whats-new.html \
  src/PRDock.Tauri/src/whats-new-main.tsx \
  src/PRDock.Tauri/src/components/whats-new/ \
  src/PRDock.Tauri/vite.config.ts
git commit -m "feat(whats-new): Vite entry + React bootstrap for whats-new window"
```

---

## Phase 7 — Styling tokens

### Task 15: Kind-color CSS variables

**Files:**
- Modify: `src/PRDock.Tauri/src/styles/index.css`

- [ ] **Step 1: Append kind tokens to the light (`:root`) block**

Find the closing `}` of the `:root {` block. Before it, add:

```css
  /* "What's new" kind badges */
  --color-whats-new-new-fg: #2E8E78;
  --color-whats-new-new-bg: rgba(59, 166, 142, 0.08);
  --color-whats-new-new-border: rgba(59, 166, 142, 0.22);

  --color-whats-new-improved-fg: #8A5F06;
  --color-whats-new-improved-bg: rgba(176, 125, 9, 0.08);
  --color-whats-new-improved-border: rgba(176, 125, 9, 0.22);

  --color-whats-new-fixed-fg: #6655D4;
  --color-whats-new-fixed-bg: rgba(124, 106, 246, 0.08);
  --color-whats-new-fixed-border: rgba(124, 106, 246, 0.22);

  --color-whats-new-rail: rgba(124, 106, 246, 0.22);
```

- [ ] **Step 2: Find the dark overrides block and add dark variants**

In the same file find the `.dark { ... }` block. Inside it add:

```css
  /* "What's new" kind badges — dark */
  --color-whats-new-new-fg: #7DD3C0;
  --color-whats-new-new-bg: rgba(125, 211, 192, 0.07);
  --color-whats-new-new-border: rgba(125, 211, 192, 0.20);

  --color-whats-new-improved-fg: #F5B73B;
  --color-whats-new-improved-bg: rgba(245, 183, 59, 0.06);
  --color-whats-new-improved-border: rgba(245, 183, 59, 0.20);

  --color-whats-new-fixed-fg: #B8B0F8;
  --color-whats-new-fixed-bg: rgba(184, 176, 248, 0.06);
  --color-whats-new-fixed-border: rgba(184, 176, 248, 0.20);

  --color-whats-new-rail: rgba(124, 106, 246, 0.24);
```

- [ ] **Step 3: Verify CSS loads**

Run: `cd src/PRDock.Tauri && npx vite build 2>&1 | tail -10`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/PRDock.Tauri/src/styles/index.css
git commit -m "style(whats-new): add kind-color CSS variables for light and dark themes"
```

---

## Phase 8 — React components (inside-out)

### Task 16: HeroBanner component

**Files:**
- Create: `src/PRDock.Tauri/src/components/whats-new/HeroBanner.tsx`
- Create: `src/PRDock.Tauri/src/components/whats-new/__tests__/HeroBanner.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/PRDock.Tauri/src/components/whats-new/__tests__/HeroBanner.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroBanner } from '../HeroBanner';

describe('HeroBanner', () => {
  it('renders an <img> when hero.src is provided', () => {
    render(<HeroBanner hero={{ src: '/whats-new/1.0.11/a.png', alt: 'alt' }} kind="new" />);
    const img = screen.getByAltText('alt') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain('/whats-new/1.0.11/a.png');
  });

  it('renders a gradient fallback when hero is null', () => {
    const { container } = render(<HeroBanner hero={null} kind="improved" />);
    expect(container.querySelector('[data-fallback="improved"]')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('falls back to gradient on img onError', () => {
    const { container } = render(
      <HeroBanner hero={{ src: '/whats-new/1.0.11/a.png', alt: 'alt' }} kind="fixed" />,
    );
    const img = container.querySelector('img') as HTMLImageElement;
    img.dispatchEvent(new Event('error'));
    expect(container.querySelector('[data-fallback="fixed"]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Verify it fails**

Run: `cd src/PRDock.Tauri && npx vitest run src/components/whats-new/__tests__/HeroBanner.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement HeroBanner**

Create `src/PRDock.Tauri/src/components/whats-new/HeroBanner.tsx`:

```tsx
import { useState } from 'react';
import type { Kind } from '@/types/whats-new';

const KIND_GRADIENTS: Record<Kind, string> = {
  new: 'bg-[radial-gradient(ellipse_360px_180px_at_50%_0%,rgba(59,166,142,0.16),transparent_60%),linear-gradient(160deg,#1a1335_0%,#2a1f5e_100%)]',
  improved:
    'bg-[radial-gradient(ellipse_360px_180px_at_50%_0%,rgba(245,183,59,0.14),transparent_60%),linear-gradient(160deg,#2a1f5e_0%,#3a3015_100%)]',
  fixed:
    'bg-[radial-gradient(ellipse_360px_180px_at_50%_50%,rgba(124,106,246,0.22),transparent_65%),linear-gradient(160deg,#1a1335_0%,#2a2066_50%,#1a1335_100%)]',
};

const KIND_ICON: Record<Kind, JSX.Element> = {
  new: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  ),
  improved: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 17l6-6 4 4 8-8M14 7h7v7" />
    </svg>
  ),
  fixed: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01" />
    </svg>
  ),
};

interface Props {
  hero: { src: string; alt: string } | null;
  kind: Kind;
}

export function HeroBanner({ hero, kind }: Props) {
  const [errored, setErrored] = useState(false);
  if (hero && !errored) {
    return (
      <div
        className="h-[74px] overflow-hidden rounded-md border border-[var(--color-subtle-border)] mb-2.5"
      >
        <img
          src={hero.src}
          alt={hero.alt}
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      </div>
    );
  }

  return (
    <div
      data-fallback={kind}
      className={`h-[74px] overflow-hidden rounded-md border border-[var(--color-subtle-border)] mb-2.5 flex items-center justify-center text-[rgba(237,234,244,0.9)] ${KIND_GRADIENTS[kind]}`}
      aria-hidden="true"
    >
      {KIND_ICON[kind]}
    </div>
  );
}
```

- [ ] **Step 4: Verify all tests pass**

Run: `cd src/PRDock.Tauri && npx vitest run src/components/whats-new/__tests__/HeroBanner.test.tsx`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/PRDock.Tauri/src/components/whats-new/HeroBanner.tsx \
  src/PRDock.Tauri/src/components/whats-new/__tests__/HeroBanner.test.tsx
git commit -m "feat(whats-new): HeroBanner renders img or kind-gradient fallback"
```

---

### Task 17: HighlightCard component

**Files:**
- Create: `src/PRDock.Tauri/src/components/whats-new/HighlightCard.tsx`
- Create: `src/PRDock.Tauri/src/components/whats-new/__tests__/HighlightCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/PRDock.Tauri/src/components/whats-new/__tests__/HighlightCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HighlightCard } from '../HighlightCard';
import type { Highlight } from '@/types/whats-new';

const base: Highlight = {
  kind: 'new',
  title: 'Close PRs',
  description: 'Stop hopping to the browser.',
  hero: null,
  keyboard: null,
};

describe('HighlightCard', () => {
  it('renders the title, description, and kind badge', () => {
    render(<HighlightCard highlight={base} />);
    expect(screen.getByText('Close PRs')).toBeTruthy();
    expect(screen.getByText(/stop hopping/i)).toBeTruthy();
    expect(screen.getByText('New')).toBeTruthy();
  });

  it('renders the keyboard chip when present', () => {
    render(<HighlightCard highlight={{ ...base, keyboard: 'Ctrl+Shift+W' }} />);
    expect(screen.getByText('Ctrl+Shift+W')).toBeTruthy();
  });

  it('labels the kind badge as "Improved" for improved', () => {
    render(<HighlightCard highlight={{ ...base, kind: 'improved' }} />);
    expect(screen.getByText('Improved')).toBeTruthy();
  });

  it('labels the kind badge as "Fixed" for fixed', () => {
    render(<HighlightCard highlight={{ ...base, kind: 'fixed' }} />);
    expect(screen.getByText('Fixed')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Verify it fails**

Run: `cd src/PRDock.Tauri && npx vitest run src/components/whats-new/__tests__/HighlightCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the card**

Create `src/PRDock.Tauri/src/components/whats-new/HighlightCard.tsx`:

```tsx
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import type { Highlight, Kind } from '@/types/whats-new';
import { HeroBanner } from './HeroBanner';

const KIND_LABEL: Record<Kind, string> = {
  new: 'New',
  improved: 'Improved',
  fixed: 'Fixed',
};

const KIND_CLASSES: Record<Kind, string> = {
  new: 'text-[var(--color-whats-new-new-fg)] bg-[var(--color-whats-new-new-bg)] border-[var(--color-whats-new-new-border)]',
  improved:
    'text-[var(--color-whats-new-improved-fg)] bg-[var(--color-whats-new-improved-bg)] border-[var(--color-whats-new-improved-border)]',
  fixed:
    'text-[var(--color-whats-new-fixed-fg)] bg-[var(--color-whats-new-fixed-bg)] border-[var(--color-whats-new-fixed-border)]',
};

interface Props {
  highlight: Highlight;
}

export function HighlightCard({ highlight }: Props) {
  const { kind, title, description, hero, keyboard } = highlight;
  return (
    <div className="mb-4 last:mb-1">
      <HeroBanner hero={hero} kind={kind} />
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span
          className={`text-[10px] font-medium uppercase tracking-[0.04em] px-1.5 py-0.5 rounded border ${KIND_CLASSES[kind]}`}
        >
          {KIND_LABEL[kind]}
        </span>
        <span className="text-[14px] font-medium text-[var(--color-text-primary)]">
          {title}
        </span>
        {keyboard && (
          <kbd className="font-mono text-[11px] px-1.5 py-[1px] rounded border bg-[var(--color-surface-raised)] border-[var(--color-strong-border)] text-[var(--color-text-primary)]">
            {keyboard}
          </kbd>
        )}
      </div>
      <div className="text-[13px] leading-[1.55] text-[var(--color-text-secondary)]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]}
          components={{
            p: ({ children }) => <p>{children}</p>,
            code: ({ children }) => (
              <code className="font-mono text-[11px] bg-[var(--color-surface-raised)] border border-[var(--color-subtle-border)] rounded px-1 py-[1px]">
                {children}
              </code>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--color-accent)] hover:underline"
              >
                {children}
              </a>
            ),
          }}
        >
          {description}
        </ReactMarkdown>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify all tests pass**

Run: `cd src/PRDock.Tauri && npx vitest run src/components/whats-new/__tests__/HighlightCard.test.tsx`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/PRDock.Tauri/src/components/whats-new/HighlightCard.tsx \
  src/PRDock.Tauri/src/components/whats-new/__tests__/HighlightCard.test.tsx
git commit -m "feat(whats-new): HighlightCard renders kind badge, title, kbd chip, and markdown"
```

---

### Task 18: AlsoFixedList component

**Files:**
- Create: `src/PRDock.Tauri/src/components/whats-new/AlsoFixedList.tsx`

- [ ] **Step 1: Implement directly (trivial enough that a test adds noise — covered by WhatsNewApp integration test)**

Create `src/PRDock.Tauri/src/components/whats-new/AlsoFixedList.tsx`:

```tsx
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

interface Props {
  items: string[];
}

export function AlsoFixedList({ items }: Props) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4 pt-4 border-t border-dashed border-[var(--color-subtle-border)]">
      <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-muted)] mb-2">
        Also fixed
      </div>
      <ul className="list-disc pl-4 text-[12.5px] leading-[1.7] text-[var(--color-text-secondary)]">
        {items.map((body, i) => (
          <li key={i}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeSanitize]}
              components={{
                p: ({ children }) => <span>{children}</span>,
                code: ({ children }) => (
                  <code className="font-mono text-[11px] text-[var(--color-text-primary)]">
                    {children}
                  </code>
                ),
              }}
            >
              {body}
            </ReactMarkdown>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src/PRDock.Tauri && npx tsc -b --noEmit`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/PRDock.Tauri/src/components/whats-new/AlsoFixedList.tsx
git commit -m "feat(whats-new): AlsoFixedList renders compact bullet list with markdown"
```

---

### Task 19: ReleaseAccordion component

**Files:**
- Create: `src/PRDock.Tauri/src/components/whats-new/ReleaseAccordion.tsx`
- Create: `src/PRDock.Tauri/src/components/whats-new/__tests__/ReleaseAccordion.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/PRDock.Tauri/src/components/whats-new/__tests__/ReleaseAccordion.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReleaseAccordion } from '../ReleaseAccordion';
import type { Release } from '@/types/whats-new';

const release: Release = {
  version: '1.0.11',
  date: '2026-04-14',
  summary: 'A and B.',
  highlights: [
    {
      kind: 'new',
      title: 'A',
      description: 'first',
      hero: null,
      keyboard: null,
    },
  ],
  alsoFixed: ['tiny fix'],
  autoOpenEligible: true,
};

describe('ReleaseAccordion', () => {
  it('shows version and date in the header', () => {
    render(<ReleaseAccordion release={release} defaultExpanded={false} isCurrent={true} />);
    expect(screen.getByText('1.0.11')).toBeTruthy();
    expect(screen.getByText('2026-04-14')).toBeTruthy();
  });

  it('shows Current pill when isCurrent is true and expanded', () => {
    render(<ReleaseAccordion release={release} defaultExpanded={true} isCurrent={true} />);
    expect(screen.getByText('Current')).toBeTruthy();
  });

  it('collapsed state hides highlights and shows the summary', () => {
    render(<ReleaseAccordion release={release} defaultExpanded={false} isCurrent={false} />);
    expect(screen.queryByText('A')).toBeNull();
    expect(screen.getByText(/A and B\./)).toBeTruthy();
  });

  it('expands when the header is clicked', () => {
    render(<ReleaseAccordion release={release} defaultExpanded={false} isCurrent={false} />);
    const trigger = screen.getByRole('button', { name: /1\.0\.11/i });
    fireEvent.click(trigger);
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText(/tiny fix/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Verify it fails**

Run: `cd src/PRDock.Tauri && npx vitest run src/components/whats-new/__tests__/ReleaseAccordion.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the accordion**

Create `src/PRDock.Tauri/src/components/whats-new/ReleaseAccordion.tsx`:

```tsx
import { useState } from 'react';
import type { Release } from '@/types/whats-new';
import { HighlightCard } from './HighlightCard';
import { AlsoFixedList } from './AlsoFixedList';

interface Props {
  release: Release;
  defaultExpanded: boolean;
  isCurrent: boolean;
}

function Caret({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block w-3 text-[10px] text-[var(--color-text-muted)]"
      style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 150ms' }}
    >
      ▾
    </span>
  );
}

export function ReleaseAccordion({ release, defaultExpanded, isCurrent }: Props) {
  const [open, setOpen] = useState(defaultExpanded);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-baseline justify-between py-2.5 border-t border-[var(--color-subtle-border)] text-left hover:bg-[var(--color-surface-hover)] transition-colors px-1 -mx-1 rounded"
        aria-expanded={open}
        aria-label={`${open ? 'Collapse' : 'Expand'} ${release.version}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Caret open={open} />
          <span className={`text-[14px] font-medium ${open ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]'}`}>
            {release.version}
          </span>
          {open && isCurrent && (
            <span className="text-[10.5px] font-medium tracking-[0.03em] text-[var(--color-accent)] bg-[var(--color-accent-subtle)] border border-[var(--color-purple-border)] rounded px-1.5 py-[1px]">
              Current
            </span>
          )}
          {!open && release.summary && (
            <span className="text-[12px] text-[var(--color-text-muted)] truncate">
              {release.summary}
            </span>
          )}
        </div>
        <span className="text-[12px] text-[var(--color-text-muted)] tabular-nums">
          {release.date}
        </span>
      </button>

      {open && (
        <div
          className="pt-2 pb-1 pl-4 ml-[3px] border-l-2"
          style={{ borderColor: 'var(--color-whats-new-rail)' }}
        >
          {release.highlights.map((h, i) => (
            <HighlightCard key={i} highlight={h} />
          ))}
          <AlsoFixedList items={release.alsoFixed} />
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Verify all tests pass**

Run: `cd src/PRDock.Tauri && npx vitest run src/components/whats-new/__tests__/ReleaseAccordion.test.tsx`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/PRDock.Tauri/src/components/whats-new/ReleaseAccordion.tsx \
  src/PRDock.Tauri/src/components/whats-new/__tests__/ReleaseAccordion.test.tsx
git commit -m "feat(whats-new): ReleaseAccordion with expand/collapse and Current pill"
```

---

### Task 20: useReleasesToShow hook

**Files:**
- Create: `src/PRDock.Tauri/src/components/whats-new/useReleasesToShow.ts`
- Create: `src/PRDock.Tauri/src/components/whats-new/__tests__/useReleasesToShow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/PRDock.Tauri/src/components/whats-new/__tests__/useReleasesToShow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeReleasesToShow } from '../useReleasesToShow';
import type { Release } from '@/types/whats-new';

const r = (version: string, autoOpenEligible = true): Release => ({
  version,
  date: '2026-04-14',
  summary: '',
  highlights: [],
  alsoFixed: [],
  autoOpenEligible,
});

describe('computeReleasesToShow', () => {
  it('defaults expansion to the newest missed release when no deep link', () => {
    const result = computeReleasesToShow({
      allReleases: [r('1.0.11'), r('1.0.10'), r('1.0.9')],
      currentVersion: '1.0.11',
      lastSeenVersion: '1.0.9',
      targetVersion: null,
    });
    expect(result.expandedVersion).toBe('1.0.11');
    expect(result.countBehind).toBe(2);
  });

  it('expands the deep-link version when provided', () => {
    const result = computeReleasesToShow({
      allReleases: [r('1.0.11'), r('1.0.10'), r('1.0.9')],
      currentVersion: '1.0.11',
      lastSeenVersion: '1.0.9',
      targetVersion: '1.0.10',
    });
    expect(result.expandedVersion).toBe('1.0.10');
  });

  it('counts 0 when no missed releases', () => {
    const result = computeReleasesToShow({
      allReleases: [r('1.0.11')],
      currentVersion: '1.0.11',
      lastSeenVersion: '1.0.11',
      targetVersion: null,
    });
    expect(result.countBehind).toBe(0);
    expect(result.expandedVersion).toBe('1.0.11');
  });

  it('falls back to newest overall when lastSeenVersion is null', () => {
    const result = computeReleasesToShow({
      allReleases: [r('1.0.11'), r('1.0.10')],
      currentVersion: '1.0.11',
      lastSeenVersion: null,
      targetVersion: null,
    });
    expect(result.expandedVersion).toBe('1.0.11');
  });
});
```

- [ ] **Step 2: Verify it fails**

Run: `cd src/PRDock.Tauri && npx vitest run src/components/whats-new/__tests__/useReleasesToShow.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the hook**

Create `src/PRDock.Tauri/src/components/whats-new/useReleasesToShow.ts`:

```ts
import { useEffect, useState } from 'react';
import type { Release } from '@/types/whats-new';
import { semverGt, semverLte } from '@/utils/semver';

interface ComputeInput {
  allReleases: Release[];
  currentVersion: string;
  lastSeenVersion: string | null;
  targetVersion: string | null;
}

interface ComputeResult {
  releases: Release[];
  expandedVersion: string | null;
  countBehind: number;
}

export function computeReleasesToShow(input: ComputeInput): ComputeResult {
  const { allReleases, currentVersion, lastSeenVersion, targetVersion } = input;

  const missed = allReleases.filter(
    (r) =>
      semverLte(r.version, currentVersion) &&
      (lastSeenVersion === null || semverGt(r.version, lastSeenVersion)),
  );

  const countBehind = missed.length;

  let expandedVersion: string | null = null;
  if (targetVersion && allReleases.some((r) => r.version === targetVersion)) {
    expandedVersion = targetVersion;
  } else if (missed.length > 0) {
    expandedVersion = missed[0].version; // allReleases is sorted newest-first
  } else if (allReleases.length > 0) {
    expandedVersion = allReleases[0].version;
  }

  return { releases: allReleases, expandedVersion, countBehind };
}

interface UseResult extends ComputeResult {
  currentVersion: string;
  ready: boolean;
}

export function useReleasesToShow(
  allReleases: Release[],
  lastSeenVersion: string | null,
  initialTarget: string | null,
): UseResult {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(initialTarget);

  useEffect(() => {
    import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then(setCurrentVersion)
      .catch(() => setCurrentVersion('0.0.0'));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<string | null>;
      setTarget(custom.detail);
    };
    window.addEventListener('whats-new:navigate', handler);
    return () => window.removeEventListener('whats-new:navigate', handler);
  }, []);

  if (!currentVersion) {
    return {
      releases: allReleases,
      expandedVersion: null,
      countBehind: 0,
      currentVersion: '0.0.0',
      ready: false,
    };
  }

  const computed = computeReleasesToShow({
    allReleases,
    currentVersion,
    lastSeenVersion,
    targetVersion: target,
  });
  return { ...computed, currentVersion, ready: true };
}
```

- [ ] **Step 4: Verify all tests pass**

Run: `cd src/PRDock.Tauri && npx vitest run src/components/whats-new/__tests__/useReleasesToShow.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/PRDock.Tauri/src/components/whats-new/useReleasesToShow.ts \
  src/PRDock.Tauri/src/components/whats-new/__tests__/useReleasesToShow.test.ts
git commit -m "feat(whats-new): useReleasesToShow computes expansion + count behind"
```

---

### Task 21: WhatsNewApp root

**Files:**
- Modify: `src/PRDock.Tauri/src/components/whats-new/WhatsNewApp.tsx`
- Create: `src/PRDock.Tauri/src/components/whats-new/__tests__/WhatsNewApp.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/PRDock.Tauri/src/components/whats-new/__tests__/WhatsNewApp.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const getVersionMock = vi.fn();
vi.mock('@tauri-apps/api/app', () => ({ getVersion: getVersionMock }));

const closeMock = vi.fn();
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ close: closeMock }),
}));

const setLastSeenVersion = vi.fn(async () => {});
const disableAutoOpen = vi.fn(async () => {});
const hydrate = vi.fn(async () => {});
const storeState = {
  lastSeenVersion: '1.0.9',
  autoOpenDisabled: false,
  hydrated: true,
  setLastSeenVersion,
  disableAutoOpen,
  hydrate,
};
vi.mock('@/stores/whats-new-store', () => ({
  useWhatsNewStore: Object.assign((selector?: (s: typeof storeState) => unknown) => {
    if (selector) return selector(storeState);
    return storeState;
  }, {
    getState: () => storeState,
    setState: (p: Partial<typeof storeState>) => Object.assign(storeState, p),
  }),
}));

vi.mock('@/generated/changelog', () => ({
  RELEASES: [
    {
      version: '1.0.11',
      date: '2026-04-14',
      summary: 'A.',
      highlights: [
        { kind: 'new', title: 'A', description: 'first', hero: null, keyboard: null },
      ],
      alsoFixed: [],
      autoOpenEligible: true,
    },
    {
      version: '1.0.10',
      date: '2026-04-01',
      summary: '',
      highlights: [],
      alsoFixed: [],
      autoOpenEligible: false,
    },
  ],
}));

import { WhatsNewApp } from '../WhatsNewApp';

beforeEach(() => {
  getVersionMock.mockResolvedValue('1.0.11');
  setLastSeenVersion.mockClear();
  disableAutoOpen.mockClear();
  hydrate.mockClear();
  closeMock.mockClear();
  storeState.lastSeenVersion = '1.0.9';
  storeState.autoOpenDisabled = false;
  storeState.hydrated = true;
});

describe('WhatsNewApp', () => {
  it('renders release head with current version and count behind', async () => {
    render(<WhatsNewApp />);
    await waitFor(() => {
      expect(screen.getByText(/what's new in/i)).toBeTruthy();
    });
    expect(screen.getByText('1.0.11')).toBeTruthy();
    expect(screen.getByText(/1 version behind|1 versions behind/i)).toBeTruthy();
  });

  it('expands the newest release by default', async () => {
    render(<WhatsNewApp />);
    await waitFor(() => {
      expect(screen.getByText('A')).toBeTruthy();
    });
  });

  it('"Got it" writes lastSeenVersion and closes the window', async () => {
    render(<WhatsNewApp />);
    await waitFor(() => screen.getByRole('button', { name: /got it/i }));
    fireEvent.click(screen.getByRole('button', { name: /got it/i }));
    await waitFor(() => {
      expect(setLastSeenVersion).toHaveBeenCalledWith('1.0.11');
      expect(closeMock).toHaveBeenCalled();
    });
  });

  it('"Don\'t auto-open again" writes both flags', async () => {
    render(<WhatsNewApp />);
    await waitFor(() => screen.getByLabelText(/don't auto-open/i));
    fireEvent.click(screen.getByLabelText(/don't auto-open/i));
    await waitFor(() => {
      expect(disableAutoOpen).toHaveBeenCalledWith('1.0.11');
    });
  });
});
```

- [ ] **Step 2: Verify it fails**

Run: `cd src/PRDock.Tauri && npx vitest run src/components/whats-new/__tests__/WhatsNewApp.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Replace the stub with the full component**

Overwrite `src/PRDock.Tauri/src/components/whats-new/WhatsNewApp.tsx`:

```tsx
import { useCallback, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { RELEASES } from '@/generated/changelog';
import { useWhatsNewStore } from '@/stores/whats-new-store';
import { createLogger } from '@/services/logger';
import { ReleaseAccordion } from './ReleaseAccordion';
import { useReleasesToShow } from './useReleasesToShow';

const log = createLogger('whats-new-app');

interface InjectedWindow {
  __PRDOCK_WHATS_NEW__?: { version: string | null };
}

export function WhatsNewApp() {
  const lastSeenVersion = useWhatsNewStore((s) => s.lastSeenVersion);
  const hydrated = useWhatsNewStore((s) => s.hydrated);
  const hydrate = useWhatsNewStore((s) => s.hydrate);
  const setLastSeenVersion = useWhatsNewStore((s) => s.setLastSeenVersion);
  const disableAutoOpen = useWhatsNewStore((s) => s.disableAutoOpen);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  const initialTarget =
    (window as unknown as InjectedWindow).__PRDOCK_WHATS_NEW__?.version ?? null;

  const { releases, expandedVersion, countBehind, currentVersion, ready } = useReleasesToShow(
    RELEASES,
    lastSeenVersion,
    initialTarget,
  );

  const handleGotIt = useCallback(async () => {
    if (!ready) return;
    await setLastSeenVersion(currentVersion);
    try {
      await getCurrentWindow().close();
    } catch (err) {
      log.warn('window close failed', err);
    }
  }, [ready, currentVersion, setLastSeenVersion]);

  const handleDisable = useCallback(
    async (checked: boolean) => {
      if (!ready || !checked) return;
      await disableAutoOpen(currentVersion);
    },
    [ready, currentVersion, disableAutoOpen],
  );

  const currentRelease = releases.find((r) => r.version === currentVersion);
  const headTitle = currentRelease?.version ?? currentVersion;
  const headSummary = currentRelease?.summary ?? '';
  const behindLabel =
    countBehind === 1 ? '1 version behind' : `${countBehind} versions behind`;

  return (
    <div className="h-screen w-full flex flex-col bg-[var(--color-background)] text-[var(--color-text-primary)] font-sans">
      <header className="px-6 pt-6 pb-3.5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-muted)] inline-flex items-center gap-2 before:content-[''] before:w-[5px] before:h-[5px] before:rounded-full before:bg-[var(--color-status-green)]">
            Release notes
          </span>
          <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
            {countBehind > 0 ? behindLabel : 'Up to date'}
          </span>
        </div>
        <h1 className="text-[22px] font-medium tracking-[-0.015em] mb-1 text-[var(--color-text-primary)]">
          What's new in{' '}
          <b className="font-semibold text-[var(--color-accent)] tabular-nums">{headTitle}</b>
        </h1>
        {headSummary && (
          <p className="text-[13px] text-[var(--color-text-muted)]">{headSummary}</p>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-6 pb-3.5">
        {releases.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-[var(--color-text-muted)]">
            No release notes yet.
          </div>
        ) : (
          releases.map((release) => (
            <ReleaseAccordion
              key={release.version}
              release={release}
              defaultExpanded={release.version === expandedVersion}
              isCurrent={release.version === currentVersion}
            />
          ))
        )}
      </div>

      <footer className="px-6 py-3 border-t border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] flex items-center justify-between">
        <label
          className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)] cursor-pointer select-none"
          aria-label="Don't auto-open again"
        >
          <input
            type="checkbox"
            className="h-[13px] w-[13px] accent-[var(--color-accent)] cursor-pointer"
            onChange={(e) => handleDisable(e.target.checked)}
          />
          Don't auto-open again
        </label>
        <div className="flex items-center gap-3.5">
          <a
            href="https://github.com/KoenvdB/PRDock/releases"
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
          >
            View on GitHub →
          </a>
          <button
            type="button"
            onClick={handleGotIt}
            className="bg-[var(--color-accent)] text-white border-0 rounded-md px-4 py-[7px] text-[13px] font-medium cursor-pointer hover:brightness-110 transition"
          >
            Got it
          </button>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 4: Verify all tests pass**

Run: `cd src/PRDock.Tauri && npx vitest run src/components/whats-new/__tests__/WhatsNewApp.test.tsx`
Expected: all 4 tests PASS.

Run: `cd src/PRDock.Tauri && npx vitest run src/components/whats-new/ src/hooks/__tests__/useWhatsNew.test.ts`
Expected: everything green.

- [ ] **Step 5: Commit**

```bash
git add src/PRDock.Tauri/src/components/whats-new/WhatsNewApp.tsx \
  src/PRDock.Tauri/src/components/whats-new/__tests__/WhatsNewApp.test.tsx
git commit -m "feat(whats-new): WhatsNewApp header, scroll, footer with Got it / Don't auto-open"
```

---

## Phase 9 — Wire entry points

### Task 22: Wire `useWhatsNew` into App.tsx

**Files:**
- Modify: `src/PRDock.Tauri/src/App.tsx`

- [ ] **Step 1: Add the import and call**

In `src/PRDock.Tauri/src/App.tsx`, add this import near the other hooks imports:

```tsx
import { useWhatsNew } from '@/hooks/useWhatsNew';
```

Inside the `App` function body, near the other hook calls (after `useTheme(...)` and `useAutoUpdate(...)`), add:

```tsx
  useWhatsNew();
```

- [ ] **Step 2: Verify tsc and tests**

Run: `cd src/PRDock.Tauri && npx tsc -b --noEmit`
Expected: passes.

Run: `cd src/PRDock.Tauri && npx vitest run src/`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/PRDock.Tauri/src/App.tsx
git commit -m "feat(whats-new): wire useWhatsNew into App so it runs on startup"
```

---

### Task 23: Tray menu "What's new…" item

**Files:**
- Modify: `src/PRDock.Tauri/src-tauri/src/platform/tray.rs`

- [ ] **Step 1: Register the menu item**

In `src/PRDock.Tauri/src-tauri/src/platform/tray.rs`, inside `setup_tray`, locate this block:

```rust
    let show = MenuItemBuilder::with_id("show", "Show sidebar").build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show)
        .item(&settings)
        .item(&separator)
        .item(&quit)
        .build()?;
```

Replace it with:

```rust
    let show = MenuItemBuilder::with_id("show", "Show sidebar").build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
    let whats_new = MenuItemBuilder::with_id("whats_new", "What's new…").build(app)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show)
        .item(&settings)
        .item(&whats_new)
        .item(&separator)
        .item(&quit)
        .build()?;
```

Then, in the `on_menu_event` match, add an arm for `"whats_new"` alongside the existing ones:

```rust
            "whats_new" => {
                let app_handle = app.clone();
                let _ = app.run_on_main_thread(move || {
                    let app_inner = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) =
                            crate::platform::window::open_whats_new_window(app_inner, None).await
                        {
                            log::error!("tray whats_new open failed: {e}");
                        }
                    });
                });
            }
```

- [ ] **Step 2: Verify the Rust side builds**

Run: `cd src/PRDock.Tauri/src-tauri && cargo build 2>&1 | tail -10`
Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add src/PRDock.Tauri/src-tauri/src/platform/tray.rs
git commit -m "feat(whats-new): add 'What's new…' entry to system tray menu"
```

---

### Task 24: Settings → "View release notes" button

**Files:**
- Modify: `src/PRDock.Tauri/src/components/settings/UpdateSection.tsx`

- [ ] **Step 1: Add the button next to "Check for Updates"**

In `src/PRDock.Tauri/src/components/settings/UpdateSection.tsx`, add this import near the others:

```tsx
import { openWhatsNew } from '@/hooks/useWhatsNew';
```

Then inside the `flex items-center gap-2` row containing the "Check for Updates" button, right after the existing `<button>` / `<span>` block (and before the closing `</div>` of that row), add:

```tsx
        <button
          className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[var(--color-action-secondary-fg)] bg-[var(--color-action-secondary-bg)] border border-[var(--color-subtle-border)] hover:bg-[var(--color-surface-hover)] transition-colors"
          onClick={() => openWhatsNew(null)}
        >
          View release notes
        </button>
```

- [ ] **Step 2: Verify tests and build**

Run: `cd src/PRDock.Tauri && npx tsc -b --noEmit && npx vitest run src/components/settings/`
Expected: everything passes.

- [ ] **Step 3: Commit**

```bash
git add src/PRDock.Tauri/src/components/settings/UpdateSection.tsx
git commit -m "feat(whats-new): add 'View release notes' button to Update settings"
```

---

## Phase 10 — Integration: build integrity + /release doc + smoke

### Task 25: Extend build-integrity test

**Files:**
- Modify: `src/PRDock.Tauri/src/__tests__/build-integrity.test.ts`

- [ ] **Step 1: Add the new entry point to the fixtures**

In `src/PRDock.Tauri/src/__tests__/build-integrity.test.ts`, find the `ENTRY_POINTS` array and append:

```ts
  { key: 'whats-new', html: 'whats-new.html', script: '/src/whats-new-main.tsx' },
```

Find the `RUST_WINDOW_URLS` object and add:

```ts
  'whats-new': 'whats-new.html',
```

- [ ] **Step 2: Verify the build-integrity suite still passes**

Run: `cd src/PRDock.Tauri && npx vitest run src/__tests__/build-integrity.test.ts`
Expected: all fixtures — including the new whats-new entry — pass.

- [ ] **Step 3: Commit**

```bash
git add src/PRDock.Tauri/src/__tests__/build-integrity.test.ts
git commit -m "test(whats-new): extend build-integrity to cover whats-new entry point"
```

---

### Task 26: Update `/release` slash command docs

**Files:**
- Modify: `.claude/commands/release.md`

- [ ] **Step 1: Insert the hero-image step and validator invocation**

In `.claude/commands/release.md`, find the numbered step list. Between step 3 (version bump) and step 4 (commit), insert a new step:

```markdown
4. **Attach hero images** for any `### New Features`, `### Improvements`, or bulletted `### Bug Fixes` entries that start with `**Bold Title**`:
   - Drop each hero into `docs/whats-new/<VERSION>/<slug>.png` (or jpg/gif/webp).
   - Reference it from the bullet: `- **Bold Title** — Description. ![alt](whats-new/<VERSION>/<slug>.png)`.
   - To demote a bullet that has no image ready, strip the `**Bold Title** — ` prefix so the bullet joins the compact "Also fixed" list and requires no image.

5. **Validate** the release note by running the strict validator:
   ```
   cd src/PRDock.Tauri && npm run validate-release -- <VERSION>
   ```
   If any highlight is missing a hero image, the validator prints `file:line` with a remediation hint and exits non-zero. Fix and re-run until it prints `OK`.
```

Then renumber the subsequent steps (the old step 4 "Commit" becomes step 6, etc.).

Add a note at the bottom of the "Important" section:

```markdown
- **Hero images are required for all current-release highlights.** Running `npm run validate-release -- <VERSION>` before tagging catches missing images. Historical versions are frozen; missing images there render a gradient fallback at runtime.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/release.md
git commit -m "docs(whats-new): update /release workflow with hero-image step and validator"
```

---

### Task 27: End-to-end smoke test

**Files:** (none modified)

- [ ] **Step 1: Full test suite**

Run: `cd src/PRDock.Tauri && npm run test 2>&1 | tail -40`
Expected: all Vitest tests pass (including new changelog, whats-new, semver, store, hook, and build-integrity suites).

- [ ] **Step 2: Lint**

Run: `cd src/PRDock.Tauri && npm run lint`
Expected: no errors. (Warnings in unrelated files that pre-existed are fine.)

- [ ] **Step 3: Full build**

Run: `cd src/PRDock.Tauri && npm run build 2>&1 | tail -20`
Expected: build succeeds; `dist/whats-new.html` exists; no runtime errors.

- [ ] **Step 4: Rust build**

Run: `cd src/PRDock.Tauri/src-tauri && cargo build 2>&1 | tail -10`
Expected: compiles.

- [ ] **Step 5: Sanity-check the generated module**

Run: `head -8 src/PRDock.Tauri/src/generated/changelog.ts`
Expected: starts with `// THIS FILE IS GENERATED` and imports `Release` from `@/types/whats-new`.

- [ ] **Step 6: Manual walkthrough (notes for reviewer; no action required here)**

When the reviewer runs `npm run tauri dev`, they should confirm:
- On first launch after this plan merges, no "What's new" window pops (first-run seed writes `lastSeenVersion = 1.0.10`).
- Tray right-click → "What's new…" opens the window.
- Settings → Updates → "View release notes" opens the window.
- The window shows the existing 1.0.10 and earlier entries with gradient fallbacks (no images exist yet for those).

- [ ] **Step 7: No new commit needed — smoke tests only**

If anything failed, diagnose and patch in a follow-up commit.

---

## Self-review

### Coverage against the spec

| Spec requirement | Task(s) |
|---|---|
| Auto-open after update to eligible release | 12, 22 |
| Manual entry: tray | 23 |
| Manual entry: Settings | 24 |
| Manual entry: Command Palette | *Dropped — see "Spec adjustments" section* |
| Hybrid content source (CHANGELOG.md + optional images) | 2–8 |
| All missed releases as accordion | 19, 20, 21 |
| Separate Tauri window 520×640 | 13, 14 |
| Auto-open gate (only New Features or Improvements) | 5, 12 |
| Data model (Highlight, Release) | 1, 2–7 |
| CHANGELOG.md convention (bold title, optional `![]()`) | 3, 4 |
| Build-time validation (missing image file) | 7, 8 |
| Strict release validator | 9 |
| Version tracking (lastSeenVersion, autoOpenDisabled) | 11 |
| First-run seed | 12 |
| "Got it" writes lastSeenVersion | 21 |
| "Don't auto-open again" writes both flags | 21 |
| Deep link `?version=` / `__PRDOCK_WHATS_NEW__` | 13, 20, 21 |
| Components (WhatsNewApp, ReleaseAccordion, HighlightCard, HeroBanner, AlsoFixedList, useReleasesToShow) | 14, 16–21 |
| Kind color mapping (New green / Improved yellow / Fixed violet) | 15, 17 |
| Error handling: missing historical hero | 16 |
| Error handling: missing current hero | 7, 9 |
| Error handling: empty RELEASES | 21 (empty-state branch) |
| Error handling: plugin-store failure | 11 |
| Error handling: image 404 at runtime | 16 |
| Tests: parser snapshots + validation | 2–7, 9 |
| Tests: hook logic | 12 |
| Tests: components | 16, 17, 19, 21 |
| Tests: build-integrity extension | 25 |
| Release-author workflow update | 26 |
| Rollout (first-run seed) | 12 |

### Placeholder scan

- No "TBD", "TODO", "implement later", or "fill in details" in implementation steps.
- No "add appropriate error handling" / "similar to Task N".
- Every code change shows the complete file/snippet.
- Every test run lists the exact command and expected outcome.

### Type consistency

- `Highlight.keyboard` is `string | null` in `types/whats-new.ts`, in every test, and in every consumer (`HighlightCard`, `emit.test.ts` sample).
- `Release` has consistent field order in tests and in the parser's populated object.
- `openWhatsNew(version: string | null = null)` matches the Rust command's `Option<String>` param and `useWhatsNew`/`UpdateSection` call sites.
- `open_whats_new_window` label is the literal `"whats-new"` consistently between Rust window creation and the build-integrity `RUST_WINDOW_URLS` key.
- `computeReleasesToShow` + `useReleasesToShow` match in field names (`releases`, `expandedVersion`, `countBehind`).

No inconsistencies detected during review.
