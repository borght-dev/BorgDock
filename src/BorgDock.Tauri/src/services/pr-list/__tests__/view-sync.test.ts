import { describe, expect, it } from 'vitest';
import { DEFAULT_DISPLAY } from '../display';
import { sanitizeSavedViews } from '../facets';
import {
  listAfterAnswer,
  mergeViews,
  planPull,
  planPush,
  type SharedView,
  sameView,
  sanitizeViewsBase,
} from '../view-sync';

const view = (id: string, patch: Partial<SharedView> = {}): SharedView => ({
  id,
  name: `View ${id}`,
  filter: 'all',
  query: '',
  display: { ...DEFAULT_DISPLAY, columns: [...DEFAULT_DISPLAY.columns] },
  ...patch,
});

const ids = (views: readonly SharedView[]) => views.map((v) => v.id);

describe('mergeViews', () => {
  const a = view('a');
  const b = view('b');
  const c = view('c');

  it('starts from theirs in its order', () => {
    expect(ids(mergeViews([a, b, c], [a, b, c], [c, a, b]))).toEqual(['c', 'a', 'b']);
  });

  it('appends a view added here', () => {
    const d = view('d');
    expect(mergeViews([a, b], [a, b, d], [b, a])).toEqual([b, a, d]);
  });

  it('keeps a view added there', () => {
    const e = view('e');
    expect(mergeViews([a], [a], [a, e])).toEqual([a, e]);
  });

  it('lets a view added here replace theirs with the same id in its place', () => {
    const mine = view('d', { name: 'Mine' });
    const theirs = view('d', { name: 'Theirs' });
    expect(mergeViews([a], [a, mine], [theirs, a])).toEqual([mine, a]);
  });

  it('drops a view deleted here', () => {
    expect(mergeViews([a, b, c], [a, c], [a, b, c])).toEqual([a, c]);
  });

  it('drops a view deleted here even when they edited it', () => {
    const edited = view('b', { query: 'repo:shop' });
    expect(mergeViews([a, b], [a], [a, edited])).toEqual([a]);
  });

  it('lets a view edited here replace their copy', () => {
    const renamed = view('b', { name: 'Renamed here' });
    expect(mergeViews([a, b, c], [a, renamed, c], [c, b, a])).toEqual([c, renamed, a]);
  });

  it('brings a view edited here back at the end when they deleted it', () => {
    const edited = view('a', { query: 'is:draft' });
    expect(mergeViews([a, b], [edited, b], [b, c])).toEqual([b, c, edited]);
  });

  it('takes their edit of a view not edited here', () => {
    const theirs = view('a', { filter: 'mine' });
    expect(mergeViews([a, b], [a, b], [theirs, b])).toEqual([theirs, b]);
  });

  it('drops a view they deleted and this side kept as it was', () => {
    expect(mergeViews([a, b], [a, b], [a])).toEqual([a]);
  });

  it('keeps both sides of concurrent edits to different views', () => {
    const mineA = view('a', { name: 'Mine A' });
    const theirsB = view('b', { query: 'author:alice' });
    expect(mergeViews([a, b], [mineA, b], [a, theirsB])).toEqual([mineA, theirsB]);
  });

  it('lets this side win when both edited the same view', () => {
    const mine = view('a', { name: 'Mine' });
    const theirs = view('a', { name: 'Theirs' });
    expect(mergeViews([a], [mine], [theirs])).toEqual([mine]);
  });
});

describe('sameView', () => {
  it('treats a server view kept here as the same view', () => {
    const fromServer = view('a', {
      name: '  Shop reviews ',
      display: { groupBy: 'author', phoneOnly: { pinned: true } },
    });
    const [kept] = sanitizeSavedViews([fromServer]);
    expect(kept).toBeDefined();
    expect(sameView(fromServer, kept!)).toBe(true);
  });

  it('keeps the fields it does not know when the view is read and compares them', () => {
    const fromServer = view('a', { display: { ...DEFAULT_DISPLAY, phoneOnly: 1 } });
    const [kept] = sanitizeSavedViews([fromServer]);
    expect(kept?.display).toMatchObject({ phoneOnly: 1 });
    expect(sameView(fromServer, view('a', { display: { ...DEFAULT_DISPLAY, phoneOnly: 2 } }))).toBe(
      false,
    );
  });

  it('ignores the order of fields', () => {
    const one = view('a', { display: { sortBy: 'title', groupBy: 'repo' } });
    const other = {
      display: { groupBy: 'repo', sortBy: 'title' },
      query: '',
      filter: 'all',
      name: 'View a',
      id: 'a',
    };
    expect(sameView(one, other)).toBe(true);
  });

  it('tells an edited view apart', () => {
    expect(sameView(view('a'), view('a', { query: 'is:draft' }))).toBe(false);
  });
});

describe('planPull', () => {
  const a = view('a');
  const b = view('b');

  it('takes theirs when nothing changed here', () => {
    const theirs = { revision: 4, views: [a, view('c')] };
    expect(planPull({ revision: 3, views: [a, b] }, [a, b], theirs)).toEqual({ kind: 'adopt' });
  });

  it('is a no-op on an unchanged list on both sides', () => {
    expect(planPull({ revision: 3, views: [a] }, [a], { revision: 3, views: [a] })).toEqual({
      kind: 'adopt',
    });
  });

  it('takes theirs when a view kept here is the same view in this version', () => {
    const fromServer = view('a', {
      name: ' Spaced ',
      display: { layout: 'board', phoneOnly: true },
    });
    const kept = sanitizeSavedViews([fromServer]);
    expect(
      planPull({ revision: 1, views: [fromServer] }, kept, { revision: 1, views: [fromServer] }),
    ).toEqual({
      kind: 'adopt',
    });
  });

  it('merges a change here and writes over their revision', () => {
    const d = view('d');
    expect(planPull({ revision: 3, views: [a] }, [a, d], { revision: 5, views: [a, b] })).toEqual({
      kind: 'put',
      views: [a, b, d],
      over: 5,
    });
  });

  it('takes theirs when they already hold the change made here', () => {
    const renamed = view('a', { name: 'Renamed' });
    expect(
      planPull({ revision: 3, views: [a] }, [renamed], { revision: 4, views: [renamed] }),
    ).toEqual({
      kind: 'adopt',
    });
  });

  it('merges both lists after a new link, so neither side loses a view', () => {
    const mine = view('m');
    expect(
      planPull(null, [mine, a], { revision: 2, views: [b, view('a', { name: 'Theirs' })] }),
    ).toEqual({
      kind: 'put',
      views: [b, a, mine],
      over: 2,
    });
  });

  it('takes theirs after a new link when there are no views here', () => {
    expect(planPull(null, [], { revision: 2, views: [a] })).toEqual({ kind: 'adopt' });
  });

  it('writes a delete here as a delete', () => {
    expect(planPull({ revision: 1, views: [a, b] }, [a], { revision: 1, views: [a, b] })).toEqual({
      kind: 'put',
      views: [a],
      over: 1,
    });
  });
});

describe('planPush', () => {
  const a = view('a', { display: { ...DEFAULT_DISPLAY, phoneOnly: 'kept' } });
  const b = view('b');

  it('sends nothing when nothing changed since the base', () => {
    expect(planPush({ revision: 2, views: [a, b] }, sanitizeSavedViews([a, b]))).toBeNull();
  });

  it('sends the base with the change, over the base revision', () => {
    const c = view('c');
    const plan = planPush({ revision: 2, views: [a, b] }, [...sanitizeSavedViews([a]), c]);
    expect(plan).toEqual({ views: [a, c], over: 2 });
  });

  it('sends views not changed here as the server sent them', () => {
    const plan = planPush({ revision: 2, views: [a, b] }, sanitizeSavedViews([a]));
    expect(plan?.views[0]).toBe(a);
  });
});

describe('listAfterAnswer', () => {
  const a = view('a');
  const b = view('b');

  it('is the answer when nothing changed here meanwhile', () => {
    expect(listAfterAnswer([a], [a], [a, b])).toEqual([a, b]);
  });

  it('keeps a change made here while the write was on its way', () => {
    const c = view('c');
    expect(listAfterAnswer([a], [a, c], [a, b])).toEqual([a, b, c]);
  });
});

describe('sanitizeViewsBase', () => {
  it('reads a stored base', () => {
    const a = view('a');
    expect(sanitizeViewsBase({ revision: 3, views: [a, null, { id: 4 }] })).toEqual({
      revision: 3,
      views: [a],
    });
  });

  it('reads anything else as no base', () => {
    expect(sanitizeViewsBase(null)).toBeNull();
    expect(sanitizeViewsBase(undefined)).toBeNull();
    expect(sanitizeViewsBase({ revision: '3', views: [] })).toBeNull();
    expect(sanitizeViewsBase({ revision: 1.5, views: [] })).toBeNull();
    expect(sanitizeViewsBase({ revision: 1 })).toBeNull();
  });
});
