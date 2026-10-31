import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECEIVED_CURSOR, SENT_CURSOR } from '@/services/phone-link/sync';
import { useSettingsStore } from '@/stores/settings-store';
import { DEFAULT_PHONE_LINK } from '@/types/settings';
import { startPhoneLinkSync } from '../phone-link-sync';

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  readsSince: vi.fn(),
  sendReads: vi.fn(),
  readSince: vi.fn(),
  mark: vi.fn(),
  changed: undefined as (() => void) | undefined,
  linkChanged: undefined as
    | ((event: { payload: { linked: boolean; at: string } }) => void)
    | undefined,
}));

const ok = <T>(data: T) => Promise.resolve({ status: 'ok' as const, data });

vi.mock('@/generated/commands', () => ({
  commands: {
    phoneLinkState: mocks.state,
    phoneLinkReadsSince: mocks.readsSince,
    phoneLinkSendReads: mocks.sendReads,
    activityReadSince: mocks.readSince,
  },
  events: {
    activityChanged: {
      listen: vi.fn(async (handler: () => void) => {
        mocks.changed = handler;
        return () => {};
      }),
    },
    phoneLinkChanged: {
      listen: vi.fn(async (handler: typeof mocks.linkChanged) => {
        mocks.linkChanged = handler;
        return () => {};
      }),
    },
  },
}));
vi.mock('@/services/activity/api', () => ({
  mark: mocks.mark,
  toEntry: (row: unknown) => row,
}));

const settle = () => vi.advanceTimersByTimeAsync(0);

function setPhoneLink(phoneLink: typeof DEFAULT_PHONE_LINK, hasLoaded = true) {
  const settings = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    hasLoaded,
    settings: {
      ...settings,
      azureDevOps: { ...settings.azureDevOps, organization: 'Gomocha', project: 'FSP' },
      notifications: {
        ...settings.notifications,
        activity: { ...settings.notifications.activity!, phoneLink },
      },
    },
  });
}

describe('startPhoneLinkSync', () => {
  let stop: () => void = () => {};

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    setPhoneLink(DEFAULT_PHONE_LINK);
    mocks.state.mockImplementation(() => ok({ linked: true, server: 'x', serverName: 'Mac mini' }));
    mocks.readsSince.mockImplementation(() =>
      ok({ until: '2026-10-31T10:01:00.000Z', targets: [{ kind: 'item', id: 5 }] }),
    );
    mocks.sendReads.mockImplementation(() => ok(null));
    mocks.readSince.mockImplementation(() => ok([]));
    mocks.mark.mockResolvedValue({ previous: [], changed: 1, revision: 1 });
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('starts both cursors at now on the first tick, then marks what the phone read', async () => {
    stop = startPhoneLinkSync();
    await settle();
    expect(localStorage.getItem(RECEIVED_CURSOR)).toBeTruthy();
    expect(localStorage.getItem(SENT_CURSOR)).toBeTruthy();
    expect(mocks.readsSince).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.readsSince).toHaveBeenCalled();
    expect(mocks.mark).toHaveBeenCalledWith({
      ids: [],
      entityKeys: ['ado:gomocha/fsp:5'],
      before: '2026-10-31T10:01:00.000Z',
      read: 'read',
      reason: 'phone',
    });
  });

  it('shares reads a moment after the journal changes', async () => {
    stop = startPhoneLinkSync();
    await settle();
    mocks.readSince.mockImplementation(() =>
      ok([
        {
          id: 'e1',
          entity: { kind: 'workitem', key: 'ado:gomocha/fsp:9', title: 't', url: null },
          links: { itemIds: [], prUrls: [], workstreamIds: [], ciGroupIds: [] },
          readAt: '2099-01-01T00:00:00.000Z',
        },
      ]),
    );
    mocks.changed?.();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(mocks.sendReads).toHaveBeenCalledWith(
      [{ kind: 'item', id: 9 }],
      '2099-01-01T00:00:00.000Z',
    );
  });

  it('does nothing and forgets the cursors while reads are not shared', async () => {
    localStorage.setItem(SENT_CURSOR, 'x');
    setPhoneLink({ ...DEFAULT_PHONE_LINK, shareReads: false });
    stop = startPhoneLinkSync();
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(localStorage.getItem(SENT_CURSOR)).toBeNull();
    expect(mocks.readsSince).not.toHaveBeenCalled();
  });

  it('starts both cursors when the phone approves, not at the next tick', async () => {
    mocks.state.mockImplementation(() => ok({ linked: false, server: null, serverName: null }));
    stop = startPhoneLinkSync();
    await settle();
    mocks.state.mockImplementation(() => ok({ linked: true, server: 'x', serverName: 'Mac mini' }));
    mocks.linkChanged?.({ payload: { linked: true, at: '2026-10-31T09:00:00.000Z' } });
    await settle();
    expect(mocks.readsSince).toHaveBeenCalledWith('2026-10-31T09:00:00.000Z');
    expect(mocks.readSince).toHaveBeenCalledWith('2026-10-31T09:00:00.000Z', '', 200);
  });

  it('waits for settings to load before it shares or takes reads', async () => {
    localStorage.setItem(
      SENT_CURSOR,
      JSON.stringify({ readAt: '2026-10-31T08:00:00.000Z', id: '' }),
    );
    localStorage.setItem(RECEIVED_CURSOR, '2026-10-31T08:00:00.000Z');
    setPhoneLink(DEFAULT_PHONE_LINK, false);
    stop = startPhoneLinkSync();
    await settle();
    mocks.changed?.();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.state).not.toHaveBeenCalled();
    expect(mocks.readSince).not.toHaveBeenCalled();
    expect(mocks.readsSince).not.toHaveBeenCalled();

    setPhoneLink({ ...DEFAULT_PHONE_LINK, shareReads: false });
    await settle();
    expect(mocks.readsSince).not.toHaveBeenCalled();
    expect(localStorage.getItem(SENT_CURSOR)).toBeNull();
    expect(localStorage.getItem(RECEIVED_CURSOR)).toBeNull();
  });

  it('ticks as soon as settings load', async () => {
    localStorage.setItem(RECEIVED_CURSOR, '2026-10-31T08:00:00.000Z');
    setPhoneLink(DEFAULT_PHONE_LINK, false);
    stop = startPhoneLinkSync();
    await settle();
    useSettingsStore.setState({ hasLoaded: true });
    await settle();
    expect(mocks.readsSince).toHaveBeenCalledWith('2026-10-31T08:00:00.000Z');
  });

  it('does nothing while unlinked', async () => {
    mocks.state.mockImplementation(() => ok({ linked: false, server: null, serverName: null }));
    stop = startPhoneLinkSync();
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.readsSince).not.toHaveBeenCalled();
    expect(localStorage.getItem(RECEIVED_CURSOR)).toBeNull();
  });
});
