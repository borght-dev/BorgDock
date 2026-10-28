import {
  type Completion,
  CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  noteCompletionSources,
  tagCompletions,
  templateCompletions,
  wikilinkCompletions,
  workItemCompletions,
} from '../completions';
import { noteMarkdown } from '../live-preview';
import type { NoteCompletionSources } from '../NoteEditor';

const sources: NoteCompletionSources = {
  notes: () => [
    { title: 'Roadmap', path: 'Projects/Roadmap.md' },
    { title: 'Inbox', path: 'Inbox.md' },
  ],
  tags: () => ['idea', 'project/borgdock'],
  workItems: () => [
    { id: 48213, title: 'Login fails on SSO' },
    { id: 1200, title: 'Export to CSV' },
  ],
  threads: () => [{ label: 'Fix [login]', url: 't3code://threads/env/th1' }],
  workstreams: () => [{ label: 'Q4 plan', url: 'borgdock://workstreams/ws1' }],
  templates: () => [{ name: 'Meeting', text: '## Meeting\n- ' }],
};

function contextAt(doc: string, pos = doc.length, explicit = false) {
  const state = EditorState.create({ doc, selection: { anchor: pos } });
  return new CompletionContext(state, pos, explicit);
}

beforeAll(() => {
  // jsdom has no layout; CodeMirror measures text through ranges.
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const rects = Object.assign([], { item: () => null });
  Range.prototype.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect }) as DOMRect;
  Range.prototype.getClientRects = () => rects as unknown as DOMRectList;
});

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
});

/** Picks `option` in an editor holding `doc` with the cursor at `pos`, as CodeMirror would. */
function pick(doc: string, pos: number, result: CompletionResult, option: Completion): string {
  view = new EditorView({ state: EditorState.create({ doc, selection: { anchor: pos } }) });
  const apply = option.apply;
  if (typeof apply === 'function') apply(view, option, result.from, pos);
  else view.dispatch({ changes: { from: result.from, to: pos, insert: apply ?? option.label } });
  return view.state.doc.toString();
}

function labels(result: CompletionResult | null) {
  return result?.options.map((o) => o.label);
}

describe('[[ completions', () => {
  it('offers notes, then threads and workstreams, after [[', () => {
    const result = wikilinkCompletions(contextAt('See [[Ro'), sources)!;
    expect(result.from).toBe(6);
    expect(labels(result)).toEqual(['Roadmap', 'Inbox', 'Fix [login]', 'Q4 plan']);
    expect(result.options.map((o) => o.section)).toEqual([
      expect.objectContaining({ name: 'Notes', rank: 0 }),
      expect.objectContaining({ name: 'Notes', rank: 0 }),
      expect.objectContaining({ name: 'T3 threads', rank: 1 }),
      expect.objectContaining({ name: 'Workstreams', rank: 2 }),
    ]);
    expect(result.options[0]!.detail).toBe('Projects');
    expect(result.validFor).toBeInstanceOf(RegExp);
  });

  it('stays quiet outside [[ and after a label or heading separator', () => {
    expect(wikilinkCompletions(contextAt('See [Ro'), sources)).toBeNull();
    expect(wikilinkCompletions(contextAt('See [[Ro|'), sources)).toBeNull();
    expect(wikilinkCompletions(contextAt('See [[Ro#'), sources)).toBeNull();
  });

  it('closes the link when a note is picked, once', () => {
    const result = wikilinkCompletions(contextAt('See [[Ro'), sources)!;
    expect(pick('See [[Ro', 8, result, result.options[0]!)).toBe('See [[Roadmap]]');
    expect(pick('See [[Ro]] next', 8, result, result.options[0]!)).toBe('See [[Roadmap]] next');
  });

  it('writes a markdown link for a thread or a workstream', () => {
    const result = wikilinkCompletions(contextAt('Ask [[fix'), sources)!;
    expect(pick('Ask [[fix', 9, result, result.options[2]!)).toBe(
      'Ask [Fix login](t3code://threads/env/th1)',
    );
    expect(pick('Ask [[q4]]', 8, result, result.options[3]!)).toBe(
      'Ask [Q4 plan](borgdock://workstreams/ws1)',
    );
  });
});

describe('AB# completions', () => {
  it('matches ids by prefix and titles by text, and inserts the id', () => {
    const byId = workItemCompletions(contextAt('AB#48'), sources)!;
    expect(byId.from).toBe(3);
    expect(byId.filter).toBe(false);
    expect(labels(byId)).toEqual(['48213']);
    expect(byId.options[0]).toMatchObject({ detail: 'Login fails on SSO', apply: '48213' });
    expect(labels(workItemCompletions(contextAt('see AB#csv'), sources))).toEqual(['1200']);
    expect(labels(workItemCompletions(contextAt('AB#'), sources))).toEqual(['48213', '1200']);
  });

  it('ranks id matches before title matches', () => {
    const items = {
      ...sources,
      workItems: () => [
        { id: 9, title: 'Step 12' },
        { id: 12, title: 'x' },
      ],
    };
    expect(labels(workItemCompletions(contextAt('AB#12'), items))).toEqual(['12', '9']);
  });

  it('needs AB# at the start of a word', () => {
    expect(workItemCompletions(contextAt('xAB#1'), sources)).toBeNull();
    expect(workItemCompletions(contextAt('AB#zzz'), sources)).toBeNull();
  });
});

describe('# completions', () => {
  it('offers tags after # at the start of a word', () => {
    const result = tagCompletions(contextAt('a #pro'), sources)!;
    expect(result.from).toBe(3);
    expect(labels(result)).toEqual(['idea', 'project/borgdock']);
    expect(labels(tagCompletions(contextAt('text #'), sources))).toEqual([
      'idea',
      'project/borgdock',
    ]);
  });

  it('leaves a bare # at the start of a line to headings unless asked', () => {
    expect(tagCompletions(contextAt('#'), sources)).toBeNull();
    expect(tagCompletions(contextAt('#', 1, true), sources)).not.toBeNull();
    expect(tagCompletions(contextAt('#id'), sources)).not.toBeNull();
  });

  it('ignores # inside a word, a reference or a heading run', () => {
    expect(tagCompletions(contextAt('AB#'), sources)).toBeNull();
    expect(tagCompletions(contextAt('repo#1'), sources)).toBeNull();
    expect(tagCompletions(contextAt('## '), sources)).toBeNull();
  });
});

describe('/ completions', () => {
  it('offers templates after / at the start of a line or a space', () => {
    expect(templateCompletions(contextAt('/me'), sources)?.from).toBe(1);
    expect(labels(templateCompletions(contextAt('text /'), sources))).toEqual(['Meeting']);
    expect(templateCompletions(contextAt('a/b'), sources)).toBeNull();
    expect(templateCompletions(contextAt('https://x'), sources)).toBeNull();
  });

  it('replaces the /query with the template text', () => {
    const result = templateCompletions(contextAt('x\n/me'), sources)!;
    expect(pick('x\n/me', 5, result, result.options[0]!)).toBe('x\n## Meeting\n- ');
  });
});

describe('noteCompletionSources', () => {
  it('reads the current lists and stays quiet inside code', () => {
    let notes = [{ title: 'First', path: 'First.md' }];
    const [wikilinks] = noteCompletionSources(() => ({ ...sources, notes: () => notes }));
    const complete = (doc: string, pos = doc.length) => {
      const state = EditorState.create({ doc, extensions: noteMarkdown() });
      return wikilinks!(new CompletionContext(state, pos, false)) as CompletionResult | null;
    };
    expect(labels(complete('[['))?.[0]).toBe('First');
    notes = [{ title: 'Second', path: 'Second.md' }];
    expect(labels(complete('[['))?.[0]).toBe('Second');
    expect(complete('```\n[[')).toBeNull();
    expect(complete('`[[a` after', 4)).toBeNull();
  });
});
