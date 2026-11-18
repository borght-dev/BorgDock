import { describe, expect, it } from 'vitest';
import { parsePatch } from '@/services/diff-parser';
import {
  canRender,
  draftOnRenderedBlock,
  type MarkdownNode,
  patchLines,
  planChanges,
  readRemovedMark,
  remarkChangeMarks,
  renderKindOf,
  resolveRepoPath,
  withFencedFrontMatter,
} from '../rendered-file';

describe('renderKindOf', () => {
  it('knows the files that have a page to draw', () => {
    expect(renderKindOf('docs/guide.md')).toBe('markdown');
    expect(renderKindOf('README.MARKDOWN')).toBe('markdown');
    expect(renderKindOf('docs/plans/plan.html')).toBe('html');
    expect(renderKindOf('site/index.htm')).toBe('html');
    expect(renderKindOf('assets/logo.svg')).toBe('svg');
    expect(renderKindOf('src/App.tsx')).toBeNull();
    expect(renderKindOf('docs/page.mdx')).toBeNull();
  });

  it('draws nothing for a removed file', () => {
    expect(canRender({ filename: 'docs/guide.md', status: 'removed' })).toBeNull();
    expect(canRender({ filename: 'docs/guide.md', status: 'modified' })).toBe('markdown');
  });
});

describe('resolveRepoPath', () => {
  it('reads a relative address from the folder of the file', () => {
    expect(resolveRepoPath('docs/plans/plan.html', 'img/shot.png')).toBe('docs/plans/img/shot.png');
    expect(resolveRepoPath('docs/plans/plan.html', './style.css?v=2#top')).toBe(
      'docs/plans/style.css',
    );
    expect(resolveRepoPath('docs/plans/plan.html', '../shared/a%20b.js')).toBe(
      'docs/shared/a b.js',
    );
    expect(resolveRepoPath('README.md', 'docs/logo.png')).toBe('docs/logo.png');
  });

  it('reads a leading slash from the root of the repository', () => {
    expect(resolveRepoPath('docs/plans/plan.html', '/assets/app.css')).toBe('assets/app.css');
  });

  it('leaves alone what is not in the repository', () => {
    expect(resolveRepoPath('docs/a.html', 'https://example.com/x.png')).toBeNull();
    expect(resolveRepoPath('docs/a.html', '//example.com/x.png')).toBeNull();
    expect(resolveRepoPath('docs/a.html', 'data:image/png;base64,AAAA')).toBeNull();
    expect(resolveRepoPath('docs/a.html', '#section')).toBeNull();
    expect(resolveRepoPath('docs/a.html', '../../outside.png')).toBeNull();
    expect(resolveRepoPath('docs/a.html', '')).toBeNull();
  });
});

const PATCH = [
  '@@ -1,9 +1,12 @@',
  ' # Discount codes',
  ' ',
  '-The API answers with the new total.',
  '+The API answers with the new total, or with a reason.',
  ' ',
  '-## Known limitations',
  '-',
  '-Only one code per order.',
  '-',
  ' ## Try it',
  ' ',
  '+## Refusal reasons',
  '+',
  '+One sentence per reason.',
  '+',
  ' Run the dev server.',
].join('\n');

const SOURCE = [
  '# Discount codes', // 1
  '', // 2
  'The API answers with the new total, or with a reason.', // 3
  '', // 4
  '## Try it', // 5
  '', // 6
  '## Refusal reasons', // 7
  '', // 8
  'One sentence per reason.', // 9
  '', // 10
  'Run the dev server.', // 11
].join('\n');

const BLOCKS = [
  { from: 1, to: 1 },
  { from: 3, to: 3 },
  { from: 5, to: 5 },
  { from: 7, to: 7 },
  { from: 9, to: 9 },
  { from: 11, to: 11 },
];

describe('patchLines', () => {
  it('numbers added lines as the file is now and keeps what was removed', () => {
    const patch = patchLines(parsePatch(PATCH));
    expect([...patch.added]).toEqual([3, 7, 8, 9, 10]);
    expect(patch.removed).toEqual([
      { before: 3, lines: ['The API answers with the new total.'], addedLines: [3] },
      {
        before: 5,
        lines: ['## Known limitations', '', 'Only one code per order.', ''],
        addedLines: [],
      },
    ]);
  });
});

describe('planChanges', () => {
  it('marks new blocks added, rewritten ones changed, and leaves a gap where text vanished', () => {
    const plan = planChanges(SOURCE, BLOCKS, patchLines(parsePatch(PATCH)));
    expect([...plan.marks]).toEqual([
      [1, { change: 'changed', commentLine: 3 }],
      [3, { change: 'added', commentLine: 7 }],
      [4, { change: 'added', commentLine: 9 }],
    ]);
    expect(plan.gaps).toEqual([
      {
        beforeBlock: 2,
        lines: ['## Known limitations', '', 'Only one code per order.'],
        title: 'Known limitations',
      },
    ]);
  });

  it('gives a section its marker when another section took its place', () => {
    const patch = patchLines(
      parsePatch(
        [
          '@@ -1,5 +1,5 @@',
          ' Intro.',
          ' ',
          '-## Known limitations',
          '-',
          '-Only one code per order.',
          '+## Refusal reasons',
          '+',
          '+The field shows a sentence for each.',
        ].join('\n'),
      ),
    );
    const source = 'Intro.\n\n## Refusal reasons\n\nThe field shows a sentence for each.';
    const plan = planChanges(
      source,
      [
        { from: 1, to: 1 },
        { from: 3, to: 3 },
        { from: 5, to: 5 },
      ],
      patch,
    );
    expect([...plan.marks]).toEqual([
      [1, { change: 'added', commentLine: 3 }],
      [2, { change: 'added', commentLine: 5 }],
    ]);
    expect(plan.gaps).toEqual([
      {
        beforeBlock: 1,
        lines: ['## Known limitations', '', 'Only one code per order.'],
        title: 'Known limitations',
      },
    ]);
  });

  it('finds the rewritten paragraph among new ones', () => {
    const patch = patchLines(
      parsePatch(
        [
          '@@ -1,3 +1,5 @@',
          ' Intro.',
          ' ',
          '-Codes are checked against active campaigns.',
          '+A brand new opening paragraph.',
          '+',
          '+Codes are checked against the active campaigns of this shop.',
        ].join('\n'),
      ),
    );
    const source =
      'Intro.\n\nA brand new opening paragraph.\n\nCodes are checked against the active campaigns of this shop.';
    const plan = planChanges(
      source,
      [
        { from: 1, to: 1 },
        { from: 3, to: 3 },
        { from: 5, to: 5 },
      ],
      patch,
    );
    expect([...plan.marks]).toEqual([
      [1, { change: 'added', commentLine: 3 }],
      [2, { change: 'changed', commentLine: 5 }],
    ]);
    expect(plan.gaps).toEqual([]);
  });

  it('marks a block changed when a line was only taken out of it', () => {
    const patch = patchLines(parsePatch('@@ -1,3 +1,2 @@\n - one\n-- two\n - three'));
    const plan = planChanges('- one\n- three', [{ from: 1, to: 2 }], patch);
    expect([...plan.marks]).toEqual([[0, { change: 'changed', commentLine: null }]]);
    expect(plan.gaps).toEqual([]);
  });

  it('puts text removed from the end after the last block', () => {
    const patch = patchLines(parsePatch('@@ -1,3 +1,1 @@\n Intro.\n-\n-Old closing words.'));
    const plan = planChanges('Intro.', [{ from: 1, to: 1 }], patch);
    expect(plan.gaps).toEqual([
      { beforeBlock: 1, lines: ['Old closing words.'], title: 'Old closing words.' },
    ]);
  });

  it('shortens a long removed line for the marker', () => {
    const long = `- ${'word '.repeat(30)}`;
    const patch = patchLines(parsePatch(`@@ -1,2 +1,1 @@\n Intro.\n-${long}`));
    const [gap] = planChanges('Intro.', [{ from: 1, to: 1 }], patch).gaps;
    expect(gap?.title.endsWith('…')).toBe(true);
    expect(gap?.title.length).toBeLessThanOrEqual(60);
    expect(gap?.title.startsWith('word')).toBe(true);
  });
});

describe('remarkChangeMarks', () => {
  const node = (
    type: string,
    from: number,
    to: number,
    children?: MarkdownNode[],
  ): MarkdownNode => ({
    type,
    position: { start: { line: from }, end: { line: to } },
    ...(children ? { children } : {}),
  });

  it('wraps touched blocks and puts a marker where text was removed', () => {
    const tree: MarkdownNode = {
      type: 'root',
      children: BLOCKS.map((block) => node('paragraph', block.from, block.to)),
    };
    remarkChangeMarks({ source: SOURCE, patch: patchLines(parsePatch(PATCH)) })(tree);
    const shape = (tree.children ?? []).map((child) => {
      const properties = child.data?.hProperties;
      if (properties?.dataRenderedRemoved)
        return `removed:${readRemovedMark(properties.dataRenderedRemoved)?.title}`;
      if (properties?.dataRenderedChange)
        return `${properties.dataRenderedChange}:${properties.dataRenderedLines}:${properties.dataRenderedComment}`;
      return child.type;
    });
    expect(shape).toEqual([
      'paragraph',
      'changed:3-3:3',
      'removed:Known limitations',
      'paragraph',
      'added:7-7:7',
      'added:9-9:9',
      'paragraph',
    ]);
  });

  it('marks the new rows of an edited list', () => {
    const source = '- one\n- two\n- three';
    const items = [node('listItem', 1, 1), node('listItem', 2, 2), node('listItem', 3, 3)];
    const tree: MarkdownNode = { type: 'root', children: [node('list', 1, 3, items)] };
    const patch = patchLines(parsePatch('@@ -1,2 +1,3 @@\n - one\n+- two\n - three'));
    remarkChangeMarks({ source, patch })(tree);
    const rows = items.map((item) => item.data?.hProperties?.dataRenderedRow);
    expect(rows).toEqual([undefined, 'added', undefined]);
  });

  it('leaves a page the diff did not touch as it is', () => {
    const children = [node('paragraph', 1, 1)];
    const tree: MarkdownNode = { type: 'root', children };
    remarkChangeMarks({ source: 'Hello.', patch: { added: new Set(), removed: [] } })(tree);
    expect(tree.children).toBe(children);
  });
});

describe('withFencedFrontMatter', () => {
  it('draws front matter as YAML without moving a line', () => {
    const source = '---\nname: release\ndescription: Ship it\n---\n\n# Release';
    const fenced = withFencedFrontMatter(source);
    expect(fenced).toBe('```yaml\nname: release\ndescription: Ship it\n```\n\n# Release');
    expect(fenced.split('\n')).toHaveLength(source.split('\n').length);
  });

  it('leaves a rule at the top of a page alone', () => {
    expect(withFencedFrontMatter('---\n\n# Title')).toBe('---\n\n# Title');
    expect(withFencedFrontMatter('# Title\n\n---\n\ntext\n\n---')).toBe(
      '# Title\n\n---\n\ntext\n\n---',
    );
  });
});

describe('draftOnRenderedBlock', () => {
  const patch = patchLines(parsePatch(PATCH));
  it('shows a draft on a written line the diff added', () => {
    expect(draftOnRenderedBlock({ line: 9, side: 'RIGHT' }, SOURCE, patch)).toBe(true);
  });
  it('lists the others under the page', () => {
    expect(draftOnRenderedBlock({ line: 8, side: 'RIGHT' }, SOURCE, patch)).toBe(false);
    expect(draftOnRenderedBlock({ line: 5, side: 'RIGHT' }, SOURCE, patch)).toBe(false);
    expect(draftOnRenderedBlock({ line: 3, side: 'LEFT' }, SOURCE, patch)).toBe(false);
  });
});

describe('readRemovedMark', () => {
  it('reads only a marker of the right shape', () => {
    expect(readRemovedMark(JSON.stringify({ title: 'T', lines: ['a'] }))).toEqual({
      title: 'T',
      lines: ['a'],
    });
    expect(readRemovedMark('{"lines":[1]}')).toBeNull();
    expect(readRemovedMark('not json')).toBeNull();
    expect(readRemovedMark(undefined)).toBeNull();
  });
});
