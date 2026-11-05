import { describe, expect, it } from 'vitest';
import { makePr } from '@/components/focus/__tests__/helpers';
import type { DiffFile } from '@/types';
import {
  buildGuidePrompt,
  guideEntryFor,
  guideGroups,
  OTHER_CHAPTER,
  parseGuide,
} from '../review-guide';

const META = {
  headSha: 'abc',
  provider: 'claude',
  model: 'sonnet',
  durationMs: 1200,
  createdAt: '2026-10-30T10:00:00Z',
};

function file(filename: string, patch = '@@ -1 +1 @@\n-a\n+b'): DiffFile {
  return {
    filename,
    status: 'modified',
    patch,
    additions: 1,
    deletions: 1,
    isBinary: false,
    isTruncated: false,
    sha: filename,
  };
}

const PATHS = ['src/hooks/useLayout.ts', 'src/Workspace.tsx', 'src/Workspace.test.tsx', 'bun.lock'];

describe('parseGuide', () => {
  it('reads chapters in order and resolves loose paths', () => {
    const guide = parseGuide(
      `Here you go:\n\`\`\`json\n${JSON.stringify({
        summary: 'Shows hidden filters.',
        chapters: [
          {
            title: 'Hook exposes hidden fields',
            intent: 'The workspace needs to know.',
            check: 'Memoisation.',
            files: [{ path: 'hooks/useLayout.ts', why: 'returns hiddenFields' }],
          },
          {
            title: 'Workspace renders them',
            intent: 'Planners see why.',
            check: '',
            files: [{ path: 'src/workspace.tsx', why: 'new section' }, 'src/Workspace.test.tsx'],
          },
        ],
        focus: ['a', 'b', 'c', 'd'],
      })}\n\`\`\``,
      PATHS,
      META,
    );
    expect(guide.summary).toBe('Shows hidden filters.');
    expect(guide.chapters.map((c) => c.title)).toEqual([
      'Hook exposes hidden fields',
      'Workspace renders them',
      OTHER_CHAPTER,
    ]);
    expect(guide.chapters[0]!.files).toEqual([
      { path: 'src/hooks/useLayout.ts', why: 'returns hiddenFields' },
    ]);
    expect(guide.chapters[1]!.files.map((f) => f.path)).toEqual([
      'src/Workspace.tsx',
      'src/Workspace.test.tsx',
    ]);
    expect(guide.chapters[2]!.files).toEqual([{ path: 'bun.lock', why: '' }]);
    expect(guide.focus).toEqual(['a', 'b', 'c']);
    expect(guide.headSha).toBe('abc');
  });

  it('keeps a file in the first chapter that names it and drops made-up paths', () => {
    const guide = parseGuide(
      JSON.stringify({
        summary: '',
        chapters: [
          { title: 'One', files: ['src/Workspace.tsx', 'src/Nope.ts'] },
          { title: 'Two', files: ['src/Workspace.tsx'] },
        ],
      }),
      ['src/Workspace.tsx'],
      META,
    );
    expect(guide.chapters).toEqual([
      { title: 'One', intent: '', check: '', files: [{ path: 'src/Workspace.tsx', why: '' }] },
    ]);
    expect(guide.focus).toEqual([]);
  });

  it('refuses an answer that is not a guide', () => {
    expect(() => parseGuide('I could not read the diff.', PATHS, META)).toThrow(/did not answer/);
    expect(() => parseGuide('{"chapters": [{"title": "x"', PATHS, META)).toThrow(/did not answer/);
    expect(() => parseGuide('{"chapters": [}', PATHS, META)).toThrow(/not valid JSON/);
    expect(() =>
      parseGuide('{"chapters": [{"title": "x", "files": ["nope"]}]}', PATHS, META),
    ).toThrow(/placed none/);
  });

  it('does not guess between two files with the same name', () => {
    const guide = parseGuide(
      JSON.stringify({ chapters: [{ title: 'One', files: ['index.ts', 'a/x.ts'] }] }),
      ['a/index.ts', 'b/index.ts', 'a/x.ts'],
      META,
    );
    expect(guide.chapters[0]!.files.map((f) => f.path)).toEqual(['a/x.ts']);
    expect(guide.chapters[1]!.files.map((f) => f.path)).toEqual(['a/index.ts', 'b/index.ts']);
  });
});

describe('guideGroups and guideEntryFor', () => {
  const guide = parseGuide(
    JSON.stringify({
      chapters: [
        { title: 'Core', intent: 'Why', files: [{ path: 'src/Workspace.tsx', why: 'w' }] },
        { title: 'Tests', files: ['src/Workspace.test.tsx'] },
      ],
    }),
    ['src/Workspace.tsx', 'src/Workspace.test.tsx'],
    META,
  );

  it('numbers the chapters and orders the files by them', () => {
    const files = [file('src/Workspace.test.tsx'), file('src/Workspace.tsx')];
    expect(
      guideGroups(guide, files).map((g) => [g.number, g.name, g.note, g.files[0]!.filename]),
    ).toEqual([
      [1, 'Core', 'Why', 'src/Workspace.tsx'],
      [2, 'Tests', '', 'src/Workspace.test.tsx'],
    ]);
  });

  it('finds a file’s chapter', () => {
    expect(guideEntryFor(guide, 'src/Workspace.tsx')).toMatchObject({ number: 1, why: 'w' });
    expect(guideEntryFor(guide, 'nope')).toBeNull();
  });
});

describe('buildGuidePrompt', () => {
  it('sends patches but leaves generated files and oversized patches out', () => {
    const prompt = buildGuidePrompt({
      pr: makePr({ title: 'Show hidden filters', number: 4812, body: 'Body text' }).pullRequest,
      files: [
        file('src/Workspace.tsx', '@@ -1 +1 @@\n-old\n+new'),
        file('bun.lock', '@@ -1 +1 @@\n-x\n+y'),
        file('src/Huge.ts', `@@ -1 +1 @@\n${'+x\n'.repeat(8000)}`),
      ],
      commits: ['Add hook', 'Render section'],
    });
    expect(prompt).toContain('# Show hidden filters (#4812)');
    expect(prompt).toContain('```diff\n@@ -1 +1 @@\n-old\n+new\n```');
    expect(prompt).toContain('### bun.lock (modified, +1 -1)\nGenerated or lockfile');
    expect(prompt).toContain('### src/Huge.ts (modified, +1 -1)\n```diff\n@@ -1 +1 @@\n+x\n');
    expect(prompt).toMatch(/\(cut here: \d+ more lines\)/);
    expect(prompt.length).toBeLessThan(24_000);
    expect(prompt).toContain('- Add hook\n- Render section');
    expect(prompt).toContain('Body text');
    expect(prompt).not.toContain("The reviewer's instructions");
    expect(prompt).not.toContain('Skipped by the reviewer');
  });

  it("names skipped files without their patch and adds the reviewer's instructions", () => {
    const prompt = buildGuidePrompt({
      pr: makePr({ title: 'Quote details', number: 6143 }).pullRequest,
      files: [
        file('src/Quote.tsx', '@@ -1 +1 @@\n-old\n+new'),
        file('plans/AB61129-quote-plan.html', '@@ -0,0 +1 @@\n+<h1>The whole plan</h1>'),
      ],
      commits: [],
      instructions: '  Call out every new translation key.  ',
      skip: ['*.html'],
    });
    expect(prompt).toContain(
      '### plans/AB61129-quote-plan.html (modified, +1 -1)\nSkipped by the reviewer: do not open it.',
    );
    expect(prompt).not.toContain('The whole plan');
    expect(prompt).toContain('Never open or read them');
    expect(prompt).toContain("## The reviewer's instructions");
    expect(prompt).toContain('Call out every new translation key.\n');
    expect(prompt).toContain('```diff\n@@ -1 +1 @@\n-old\n+new\n```');
  });
});
