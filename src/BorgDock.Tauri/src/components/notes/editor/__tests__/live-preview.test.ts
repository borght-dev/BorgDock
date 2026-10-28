import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  flipTask,
  type PreviewRange,
  previewRanges,
  toggleTask,
  toggleTaskEdit,
} from '../live-preview';

beforeAll(() => {
  // jsdom has no layout; CodeMirror measures text through ranges.
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const rects = Object.assign([], { item: () => null });
  Range.prototype.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect }) as DOMRect;
  Range.prototype.getClientRects = () => rects as unknown as DOMRectList;
});

const at = (pos: number) => ({ from: pos, to: pos });

function only<K extends PreviewRange['kind']>(ranges: PreviewRange[], kind: K) {
  return ranges.filter((r): r is Extract<PreviewRange, { kind: K }> => r.kind === kind);
}

function spans(ranges: PreviewRange[], kind: PreviewRange['kind']) {
  return ranges.filter((r) => r.kind === kind).map((r) => [r.from, r.to]);
}

function lineClass(ranges: PreviewRange[], from: number): string | undefined {
  return only(ranges, 'line').find((r) => r.from === from)?.className;
}

describe('previewRanges: syntax', () => {
  const heading = '# Title\nbody';

  it('hides a heading mark off the cursor line', () => {
    const ranges = previewRanges(heading, at(10));
    expect(spans(ranges, 'hide')).toEqual([[0, 2]]);
    expect(lineClass(ranges, 0)).toBe('bd-note-heading bd-note-heading-1');
  });

  it('shows the heading raw on the cursor line but keeps its size', () => {
    const ranges = previewRanges(heading, at(3));
    expect(spans(ranges, 'hide')).toEqual([]);
    expect(lineClass(ranges, 0)).toBe('bd-note-heading bd-note-heading-1');
  });

  it('hides emphasis and inline code marks', () => {
    const doc = '**bold** and *it* and `code`\nnext';
    expect(spans(previewRanges(doc, at(30)), 'hide')).toEqual([
      [0, 2],
      [6, 8],
      [13, 14],
      [16, 17],
      [22, 23],
      [27, 28],
    ]);
    expect(spans(previewRanges(doc, at(4)), 'hide')).toEqual([]);
  });

  it('hides a markdown link down to its label', () => {
    const ranges = previewRanges('[site](https://x.dev) end\nx', at(27));
    expect(spans(ranges, 'hide')).toEqual([
      [0, 1],
      [5, 21],
    ]);
    expect(only(ranges, 'link')).toEqual([
      { kind: 'link', from: 1, to: 5, url: 'https://x.dev', raw: false },
    ]);
  });

  it('keeps a raw link clickable through its URL on the cursor line', () => {
    const ranges = previewRanges('[site](https://x.dev) end\nx', at(2));
    expect(only(ranges, 'link')).toEqual([
      { kind: 'link', from: 7, to: 20, url: 'https://x.dev', raw: true },
    ]);
  });

  it('draws bullets, and quotes without their marker', () => {
    const ranges = previewRanges('- item\n  - nested\n> quoted\nx', at(28));
    expect(spans(ranges, 'bullet')).toEqual([
      [0, 1],
      [9, 10],
    ]);
    expect(lineClass(ranges, 18)).toBe('bd-note-quote');
    expect(spans(ranges, 'hide')).toEqual([[18, 20]]);
  });

  it('treats every line as raw for a selection across lines', () => {
    const ranges = previewRanges('# A\n# B\n# C', { from: 1, to: 5 });
    expect(spans(ranges, 'hide')).toEqual([[8, 10]]);
  });

  it('previews every line for an empty selection list', () => {
    expect(spans(previewRanges('# A\n# B', []), 'hide')).toEqual([
      [0, 2],
      [4, 6],
    ]);
  });
});

describe('previewRanges: links and references', () => {
  it('shows only the label of [[target|label]] and the target of [[target]]', () => {
    const ranges = previewRanges('See [[Target|Label]] and [[Note]]\nx', at(34));
    expect(spans(ranges, 'hide')).toEqual([
      [4, 13],
      [18, 20],
      [25, 27],
      [31, 33],
    ]);
    expect(only(ranges, 'wikilink')).toEqual([
      { kind: 'wikilink', from: 13, to: 18, target: 'Target', raw: false },
      { kind: 'wikilink', from: 27, to: 31, target: 'Note', raw: false },
    ]);
  });

  it('keeps wikilinks raw but clickable on the cursor line', () => {
    const ranges = previewRanges('See [[Target|Label]]\nx', at(1));
    expect(spans(ranges, 'hide')).toEqual([]);
    expect(only(ranges, 'wikilink')).toEqual([
      { kind: 'wikilink', from: 4, to: 20, target: 'Target', raw: true },
    ]);
  });

  it('never hides emphasis inside a wikilink', () => {
    expect(spans(previewRanges('[[a *b* c]]\nx', at(12)), 'hide')).toEqual([
      [0, 2],
      [9, 11],
    ]);
  });

  it('makes chips of short refs, not of pull request addresses', () => {
    const ranges = previewRanges(
      'AB#123 and planner#12 and https://github.com/o/r/pull/5\nx',
      at(57),
    );
    const chips = only(ranges, 'chip');
    expect(chips.map((c) => [c.from, c.to, c.token.kind])).toEqual([
      [0, 6, 'ado'],
      [11, 21, 'pr'],
    ]);
    expect(chips.every((c) => c.url === null && c.label === null)).toBe(true);
    expect(only(ranges, 'link')).toEqual([
      {
        kind: 'link',
        from: 26,
        to: 55,
        url: 'https://github.com/o/r/pull/5',
        raw: false,
      },
    ]);
  });

  it('makes a chip of a thread link, with its address and label', () => {
    const ranges = previewRanges('Ask [Fix login](t3code://threads/env-1/th-9) now\nx', at(50));
    const [chip] = only(ranges, 'chip');
    expect(chip).toMatchObject({
      from: 4,
      to: 44,
      url: 't3code://threads/env-1/th-9',
      label: { from: 5, to: 14 },
      token: { kind: 't3', environmentId: 'env-1', threadId: 'th-9' },
    });
    expect(only(ranges, 'link')).toEqual([]);
    expect(spans(ranges, 'hide')).toEqual([]);
  });

  it('makes a chip of a workstream link', () => {
    const [chip] = only(previewRanges('[Plan](borgdock://workstreams/ws1)\nx', at(36)), 'chip');
    expect(chip).toMatchObject({
      url: 'borgdock://workstreams/ws1',
      token: { kind: 'workstream', id: 'ws1', label: 'Plan' },
    });
  });

  it('styles references on the cursor line instead of replacing them', () => {
    const ranges = previewRanges('AB#7 [T](t3code://threads/e/t)', at(0));
    expect(only(ranges, 'chip')).toEqual([]);
    expect(only(ranges, 'ref').map((r) => [r.from, r.to, r.url])).toEqual([
      [0, 4, null],
      [5, 30, 't3code://threads/e/t'],
    ]);
  });

  it('marks tags on every line', () => {
    const doc = 'Some #idea here\nx';
    const expected = [{ kind: 'tag', from: 5, to: 10, tag: 'idea' }];
    expect(only(previewRanges(doc, at(17)), 'tag')).toEqual(expected);
    expect(only(previewRanges(doc, at(2)), 'tag')).toEqual(expected);
  });

  it('never reads a heading mark as a tag', () => {
    expect(only(previewRanges('## Plan #q4\nx', at(12)), 'tag')).toEqual([
      { kind: 'tag', from: 8, to: 11, tag: 'q4' },
    ]);
  });
});

describe('previewRanges: tasks', () => {
  const doc = '- [ ] todo\n- [x] done\nplain';

  it('draws checkboxes over the bullet and box, and strikes done tasks', () => {
    const ranges = previewRanges(doc, at(24));
    expect(only(ranges, 'task')).toEqual([
      { kind: 'task', from: 0, to: 5, done: false },
      { kind: 'task', from: 11, to: 16, done: true },
    ]);
    expect(only(ranges, 'bullet')).toEqual([]);
    expect(lineClass(ranges, 0)).toBe('bd-note-task');
    expect(lineClass(ranges, 11)).toBe('bd-note-task bd-note-task-done');
  });

  it('keeps the task on the cursor line raw', () => {
    const ranges = previewRanges(doc, at(2));
    expect(only(ranges, 'task').map((t) => t.from)).toEqual([11]);
  });

  it('keeps the number of an ordered task', () => {
    expect(only(previewRanges('1. [ ] a\nx', at(9)), 'task')).toEqual([
      { kind: 'task', from: 3, to: 6, done: false },
    ]);
  });
});

describe('previewRanges: blocks', () => {
  const frontmatter = '---\ntitle: Plan\ntags: [a, b]\nlink: AB#12\n---\n# Heading\n';

  it('styles frontmatter as properties, with its references as chips', () => {
    const ranges = previewRanges(frontmatter, at(frontmatter.length));
    expect(lineClass(ranges, 0)).toBe('bd-note-frontmatter bd-note-frontmatter-fence');
    expect(lineClass(ranges, 4)).toBe('bd-note-frontmatter');
    expect(lineClass(ranges, 16)).toBe('bd-note-frontmatter');
    expect(lineClass(ranges, 41)).toBe('bd-note-frontmatter bd-note-frontmatter-fence');
    expect(lineClass(ranges, 45)).toBe('bd-note-heading bd-note-heading-1');
    expect(spans(ranges, 'hide')).toEqual([[45, 47]]);
    expect(spans(ranges, 'chip')).toEqual([[35, 40]]);
  });

  it('renders a quoted thread or workstream link and a wikilink in a frontmatter value', () => {
    const doc = [
      '---',
      'workstream: "[Q4 auth](borgdock://workstreams/ws1)"',
      'related: [[Roadmap]]',
      'note: about #idea',
      '---',
      'body',
    ].join('\n');
    const ranges = previewRanges(doc, at(doc.length));
    expect(only(ranges, 'chip')).toEqual([
      expect.objectContaining({
        from: 17,
        to: 54,
        url: 'borgdock://workstreams/ws1',
        token: expect.objectContaining({ kind: 'workstream', id: 'ws1' }),
      }),
    ]);
    expect(spans(ranges, 'hide')).toEqual([
      [16, 17],
      [54, 55],
      [65, 67],
      [74, 76],
    ]);
    expect(only(ranges, 'wikilink')).toEqual([
      { kind: 'wikilink', from: 67, to: 74, target: 'Roadmap', raw: false },
    ]);
    expect(only(ranges, 'tag')).toEqual([]);
    expect(lineClass(ranges, 4)).toBe('bd-note-frontmatter');

    const editing = previewRanges(doc, at(20));
    expect(only(editing, 'chip')).toEqual([]);
    expect(only(editing, 'ref').map((r) => [r.from, r.to, r.url])).toEqual([
      [17, 54, 'borgdock://workstreams/ws1'],
    ]);
    expect(spans(editing, 'hide')).toEqual([
      [65, 67],
      [74, 76],
    ]);
  });

  it('never reads the last property as a setext heading', () => {
    const ranges = previewRanges('---\ntitle: x\n---\nbody', at(0));
    expect(only(ranges, 'line').some((r) => r.className.includes('heading'))).toBe(false);
  });

  it('leaves an unclosed frontmatter unstyled', () => {
    const ranges = previewRanges('---\ntitle: x', at(0));
    expect(only(ranges, 'line')).toEqual([]);
  });

  it('shows a BorgDock block marker as a label and hides the closing marker', () => {
    const doc = [
      '<!-- borgdock:since 2026-10-28 -->',
      '- merged x',
      '<!-- /borgdock:since 2026-10-28 -->',
      'end',
    ].join('\n');
    const ranges = previewRanges(doc, at(84));
    expect(only(ranges, 'marker')).toEqual([
      { kind: 'marker', from: 0, to: 34, label: 'BorgDock' },
    ]);
    expect(spans(ranges, 'hide')).toEqual([[46, 81]]);
    expect(lineClass(ranges, 46)).toBe('bd-note-marker-end');

    const editing = previewRanges(doc, at(2));
    expect(only(editing, 'marker')).toEqual([]);
    expect(spans(editing, 'hide')).toEqual([[46, 81]]);
  });

  it('labels any other whole-line comment, and leaves inline or fenced comments raw', () => {
    const ranges = previewRanges('<!-- todo -->\n\ntext <!-- x -->\n\n```\n<!-- y -->\n```', []);
    expect(only(ranges, 'marker')).toEqual([{ kind: 'marker', from: 0, to: 13, label: 'Comment' }]);
    expect(spans(ranges, 'hide')).toEqual([]);
  });

  it('decorates nothing inside a code block', () => {
    const ranges = previewRanges('```\nAB#1 #tag **x** [[N]]\n```\nafter', at(31));
    expect(ranges.filter((r) => r.kind !== 'line')).toEqual([]);
    expect(lineClass(ranges, 0)).toBe('bd-note-codeblock bd-note-codeblock-fence');
    expect(lineClass(ranges, 4)).toBe('bd-note-codeblock');
    expect(lineClass(ranges, 26)).toBe('bd-note-codeblock bd-note-codeblock-fence');
  });

  it('decorates only the given ranges', () => {
    const doc = 'AB#1\nAB#2\nAB#3';
    const ranges = previewRanges(doc, [], { ranges: [{ from: 5, to: 5 }] });
    expect(only(ranges, 'chip').map((c) => c.from)).toEqual([5]);
  });

  it('handles a long note', () => {
    const doc = Array.from({ length: 5000 }, (_, i) => `- [ ] task ${i} AB#${i}`).join('\n');
    const ranges = previewRanges(doc, at(0), { ranges: [{ from: 1000, to: 2000 }] });
    expect(only(ranges, 'task').length).toBeGreaterThan(20);
    expect(only(ranges, 'task').length).toBeLessThan(60);
  });
});

describe('tasks', () => {
  it('flips the box of a task', () => {
    expect(flipTask('- [ ] a')).toEqual({ from: 3, to: 4, insert: 'x' });
    expect(flipTask('  * [x] b')).toEqual({ from: 5, to: 6, insert: ' ' });
    expect(flipTask('1. [X] c')).toEqual({ from: 4, to: 5, insert: ' ' });
    expect(flipTask('- [ ]')).toEqual({ from: 3, to: 4, insert: 'x' });
    expect(flipTask('plain [ ] text')).toBeNull();
  });

  it('turns a list item or a plain line into a task', () => {
    expect(toggleTaskEdit('plain')).toEqual({ from: 0, to: 0, insert: '- [ ] ' });
    expect(toggleTaskEdit('  text')).toEqual({ from: 2, to: 2, insert: '- [ ] ' });
    expect(toggleTaskEdit('- item')).toEqual({ from: 2, to: 2, insert: '[ ] ' });
    expect(toggleTaskEdit('-')).toEqual({ from: 1, to: 1, insert: ' [ ] ' });
    expect(toggleTaskEdit('- [x] a')).toEqual({ from: 3, to: 4, insert: ' ' });
  });

  it('toggles every selected line and keeps the cursor after a new box', () => {
    const view = new EditorView({
      state: EditorState.create({ doc: 'a\n- [ ] b', selection: { anchor: 0, head: 5 } }),
    });
    expect(toggleTask(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('- [ ] a\n- [x] b');
    view.dispatch({ selection: { anchor: 0 } });
    toggleTask(view);
    expect(view.state.doc.toString()).toBe('- [x] a\n- [x] b');
    view.setState(EditorState.create({ doc: 'note' }));
    toggleTask(view);
    expect(view.state.selection.main.head).toBe(6);
    view.destroy();
  });

  it('does nothing in a read-only note', () => {
    const view = new EditorView({
      state: EditorState.create({ doc: 'a', extensions: EditorState.readOnly.of(true) }),
    });
    expect(toggleTask(view)).toBe(false);
    expect(view.state.doc.toString()).toBe('a');
    view.destroy();
  });
});
