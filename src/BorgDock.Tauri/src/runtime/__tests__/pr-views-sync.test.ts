import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhonePrViews_Serialize, PhoneSavedPrView } from '@/generated/commands';
import { DEFAULT_DISPLAY } from '@/services/pr-list/display';
import { usePrStore } from '@/stores/pr-store';
import { usePrViewStore } from '@/stores/pr-view-store';
import { useSettingsStore } from '@/stores/settings-store';
import { PR_VIEWS_BASE_STORE_KEY, startPrViewsSync } from '../pr-views-sync';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  disk: new Map<string, unknown>(),
  linkChanged: undefined as
    | ((event: { payload: { linked: boolean; at: string } }) => void)
    | undefined,
}));

const ok = <T>(data: T) => Promise.resolve({ status: 'ok' as const, data });

vi.mock('@/generated/commands', () => ({
  commands: {
    phoneLinkPrViewsGet: mocks.get,
    phoneLinkPrViewsPut: mocks.put,
  },
  events: {
    phoneLinkChanged: {
      listen: vi.fn(async (handler: typeof mocks.linkChanged) => {
        mocks.linkChanged = handler;
        return () => {};
      }),
    },
  },
}));
vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(async (_store: string, key: string, value: unknown) => {
    mocks.disk.set(key, structuredClone(value));
  }),
  readFromTauriStore: vi.fn(async (_store: string, key: string) => mocks.disk.get(key)),
}));

const settle = () => vi.advanceTimersByTimeAsync(0);

const view = (id: string, patch: Partial<PhoneSavedPrView> = {}): PhoneSavedPrView => ({
  id,
  name: `View ${id}`,
  filter: 'all',
  query: '',
  display: { ...DEFAULT_DISPLAY, columns: [...DEFAULT_DISPLAY.columns] },
  ...patch,
});

const list = (revision: number, views: PhoneSavedPrView[]): PhonePrViews_Serialize => ({
  revision,
  views,
  updatedAt: null,
});

/** A fake server: compare and set over one list. */
function serve(initial: PhonePrViews_Serialize) {
  let current = initial;
  mocks.get.mockImplementation(() => ok(current));
  mocks.put.mockImplementation((baseRevision: number, views: PhoneSavedPrView[]) => {
    if (baseRevision !== current.revision) return ok({ status: 'conflict', current });
    current = list(current.revision + 1, structuredClone(views));
    return ok({ status: 'saved', saved: current });
  });
  return {
    get current() {
      return current;
    },
    /** Another device writes. */
    write(views: PhoneSavedPrView[]) {
      current = list(current.revision + 1, views);
    },
  };
}

const local = () => usePrViewStore.getState().savedViews;
const localIds = () => local().map((v) => v.id);

function restoreViews(views: PhoneSavedPrView[], activeViewId: string | null = null) {
  usePrViewStore.setState({
    savedViews: views.map((v) => ({ ...v, filter: 'all', display: { ...DEFAULT_DISPLAY } })),
    activeViewId,
    restored: true,
  });
}

describe('startPrViewsSync', () => {
  let stop: () => void = () => {};

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.disk.clear();
    mocks.get.mockReset();
    mocks.put.mockReset();
    useSettingsStore.setState({ hasLoaded: true });
    usePrViewStore.setState({
      savedViews: [],
      activeViewId: null,
      restored: false,
      display: DEFAULT_DISPLAY,
    });
    usePrStore.setState({ filter: 'all', searchQuery: '' });
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it('reads nothing before the saved views are restored from disk', async () => {
    serve(list(1, [view('a')]));
    stop = startPrViewsSync();
    await settle();
    expect(mocks.get).not.toHaveBeenCalled();

    restoreViews([]);
    await settle();
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it('reads nothing before settings load', async () => {
    serve(list(1, [view('a')]));
    useSettingsStore.setState({ hasLoaded: false });
    restoreViews([]);
    stop = startPrViewsSync();
    await settle();
    expect(mocks.get).not.toHaveBeenCalled();

    useSettingsStore.setState({ hasLoaded: true });
    await settle();
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it('takes the server list when nothing changed here, without writing it back', async () => {
    mocks.disk.set(PR_VIEWS_BASE_STORE_KEY, list(1, [view('a')]));
    restoreViews([view('a')]);
    const server = serve(list(2, [view('a', { name: 'Renamed on the phone' }), view('b')]));
    stop = startPrViewsSync();
    await settle();

    expect(local().map((v) => v.name)).toEqual(['Renamed on the phone', 'View b']);
    expect(mocks.disk.get(PR_VIEWS_BASE_STORE_KEY)).toEqual({
      revision: 2,
      views: server.current.views,
    });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('pulls every minute', async () => {
    restoreViews([]);
    const server = serve(list(0, []));
    stop = startPrViewsSync();
    await settle();
    server.write([view('p')]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(localIds()).toEqual(['p']);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('merges both lists on a new link, so neither side loses a view', async () => {
    mocks.disk.set(PR_VIEWS_BASE_STORE_KEY, list(9, [view('stale')]));
    restoreViews([view('desk')]);
    mocks.get.mockImplementation(() => ok(null));
    stop = startPrViewsSync();
    await settle();
    expect(mocks.disk.get(PR_VIEWS_BASE_STORE_KEY)).toBeNull();

    const server = serve(list(4, [view('phone')]));
    mocks.linkChanged?.({ payload: { linked: true, at: '2026-11-22T10:00:00.000Z' } });
    await settle();

    expect(mocks.put).toHaveBeenCalledWith(4, [
      expect.objectContaining({ id: 'phone' }),
      expect.objectContaining({ id: 'desk' }),
    ]);
    expect(server.current.revision).toBe(5);
    expect(localIds()).toEqual(['phone', 'desk']);
    expect(mocks.disk.get(PR_VIEWS_BASE_STORE_KEY)).toMatchObject({ revision: 5 });
  });

  it('pushes a change here after a moment, over the base revision', async () => {
    restoreViews([]);
    const server = serve(list(3, [view('a')]));
    stop = startPrViewsSync();
    await settle();

    usePrStore.setState({ filter: 'mine', searchQuery: 'repo:shop' });
    usePrViewStore.getState().saveView('Shop');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mocks.put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(mocks.put).toHaveBeenCalledTimes(1);
    expect(mocks.put.mock.calls[0]?.[0]).toBe(3);
    expect(server.current.views.map((v) => [v.name, v.filter, v.query])).toEqual([
      ['View a', 'all', ''],
      ['Shop', 'mine', 'repo:shop'],
    ]);
    expect(mocks.disk.get(PR_VIEWS_BASE_STORE_KEY)).toMatchObject({ revision: 4 });
  });

  it('merges with the list that won when another device wrote first, and writes again', async () => {
    restoreViews([]);
    const server = serve(list(1, [view('a'), view('b')]));
    stop = startPrViewsSync();
    await settle();

    server.write([view('a'), view('b', { query: 'author:alice' }), view('phone')]);
    usePrViewStore.getState().renameView('a', 'Renamed here');
    await vi.advanceTimersByTimeAsync(2_000);

    expect(mocks.put.mock.calls.map((call) => call[0])).toEqual([1, 2]);
    expect(server.current.views.map((v) => [v.id, v.name, v.query])).toEqual([
      ['a', 'Renamed here', ''],
      ['b', 'View b', 'author:alice'],
      ['phone', 'View phone', ''],
    ]);
    expect(localIds()).toEqual(['a', 'b', 'phone']);
    expect(local()[1]?.query).toBe('author:alice');
    expect(mocks.disk.get(PR_VIEWS_BASE_STORE_KEY)).toMatchObject({ revision: 3 });
  });

  it("keeps display fields it doesn't know when it writes a view back", async () => {
    const phoneView = view('a', { display: { ...DEFAULT_DISPLAY, phoneOnly: { pinned: true } } });
    restoreViews([]);
    const server = serve(list(1, [phoneView]));
    stop = startPrViewsSync();
    await settle();
    expect(mocks.put).not.toHaveBeenCalled();

    usePrViewStore.getState().renameView('a', 'Renamed');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(server.current.views[0]?.display).toMatchObject({ phoneOnly: { pinned: true } });
  });

  it('goes back to All when the view on screen is deleted elsewhere', async () => {
    restoreViews([]);
    const server = serve(list(1, [view('a', { query: 'is:draft' })]));
    stop = startPrViewsSync();
    await settle();
    usePrViewStore.getState().showSavedView('a');
    expect(usePrStore.getState().searchQuery).toBe('is:draft');

    server.write([]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(usePrViewStore.getState().activeViewId).toBeNull();
    expect(usePrStore.getState().searchQuery).toBe('');
    expect(usePrStore.getState().filter).toBe('all');
  });

  it('shows the new version of the view on screen when it was not edited here', async () => {
    restoreViews([]);
    const server = serve(list(1, [view('a', { query: 'is:draft' })]));
    stop = startPrViewsSync();
    await settle();
    usePrViewStore.getState().showSavedView('a');

    server.write([view('a', { query: 'repo:shop' })]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(usePrViewStore.getState().activeViewId).toBe('a');
    expect(usePrStore.getState().searchQuery).toBe('repo:shop');
  });

  it('keeps the list on screen when it differs from the view that changed elsewhere', async () => {
    restoreViews([]);
    const server = serve(list(1, [view('a', { query: 'is:draft' })]));
    stop = startPrViewsSync();
    await settle();
    usePrViewStore.getState().showSavedView('a');
    usePrStore.getState().setSearchQuery('is:draft author:bob');

    server.write([view('a', { query: 'repo:shop' })]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(local()[0]?.query).toBe('repo:shop');
    expect(usePrStore.getState().searchQuery).toBe('is:draft author:bob');
  });

  it('forgets the base and sends nothing while unlinked', async () => {
    mocks.disk.set(PR_VIEWS_BASE_STORE_KEY, list(2, [view('a')]));
    restoreViews([view('a')]);
    mocks.get.mockImplementation(() => ok(null));
    stop = startPrViewsSync();
    await settle();
    expect(mocks.disk.get(PR_VIEWS_BASE_STORE_KEY)).toBeNull();

    usePrViewStore.getState().renameView('a', 'Renamed');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(mocks.put).not.toHaveBeenCalled();
  });
});
