import { describe, expect, it, vi } from 'vitest';
import type { PhoneActivityTarget } from '@/generated/commands';
import { FIXTURE_NOW, questionEntry } from '@/services/activity/__fixtures__/entries';
import type { ActivityEntry } from '@/services/activity/types';
import {
  type CursorStore,
  forgetCursors,
  type PhoneLinkPort,
  RECEIVED_CURSOR,
  SENT_CURSOR,
  SHARE_BATCH,
  shareReads,
  takeReads,
} from '../sync';

const NOW = FIXTURE_NOW.toISOString();

function cursors(
  initial: Record<string, string> = {},
): CursorStore & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get: (key) => values.get(key) ?? null,
    set: (key, value) => void values.set(key, value),
    remove: (key) => void values.delete(key),
  };
}

function read(id: string, threadId: string, readAt: string): ActivityEntry {
  return {
    ...questionEntry,
    id,
    entity: { kind: 'thread', key: `t3:local:thread:${threadId}`, title: 't', url: null },
    read: 'read',
    readReason: 'user',
    readAt,
  };
}

function port(overrides: Partial<PhoneLinkPort> = {}): PhoneLinkPort {
  return {
    readSince: vi.fn(async () => []),
    sendReads: vi.fn(async () => {}),
    readsSince: vi.fn(async () => ({ until: NOW, targets: [] })),
    markRead: vi.fn(async () => {}),
    ...overrides,
  };
}

const sentCursor = (readAt: string, id = '') => JSON.stringify({ readAt, id });

describe('shareReads', () => {
  it('starts at now the first time, so linking never uploads history', async () => {
    const store = cursors();
    const link = port();
    expect(await shareReads(link, store, NOW)).toBe(0);
    expect(link.readSince).not.toHaveBeenCalled();
    expect(store.values.get(SENT_CURSOR)).toBe(sentCursor(NOW));
  });

  it('sends the targets read since the cursor, before the last read, and moves the cursor', async () => {
    const store = cursors({ [SENT_CURSOR]: sentCursor('2026-10-27T15:00:00.000Z') });
    const entries = [
      read('e1', 'a', '2026-10-27T15:01:00.000Z'),
      read('e2', 'a', '2026-10-27T15:02:00.000Z'),
      read('e3', 'b', '2026-10-27T15:03:00.000Z'),
    ];
    const link = port({ readSince: vi.fn(async () => entries) });
    expect(await shareReads(link, store, NOW)).toBe(2);
    expect(link.readSince).toHaveBeenCalledWith(
      { readAt: '2026-10-27T15:00:00.000Z', id: '' },
      SHARE_BATCH,
    );
    expect(link.sendReads).toHaveBeenCalledWith(
      [
        { kind: 'thread', id: 'a', itemId: 41250 },
        { kind: 'thread', id: 'b', itemId: 41250 },
      ],
      '2026-10-27T15:03:00.000Z',
    );
    expect(store.values.get(SENT_CURSOR)).toBe(sentCursor('2026-10-27T15:03:00.000Z', 'e3'));
  });

  it('keeps reading while a batch comes back full', async () => {
    const store = cursors({ [SENT_CURSOR]: sentCursor('2026-10-27T15:00:00.000Z') });
    const full = Array.from({ length: SHARE_BATCH }, (_, i) =>
      read(`e${i}`, `t${i}`, '2026-10-27T15:01:00.000Z'),
    );
    const readSince = vi
      .fn()
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([read('last', 'z', '2026-10-27T15:02:00.000Z')]);
    const link = port({ readSince });
    await shareReads(link, store, NOW);
    expect(readSince).toHaveBeenCalledTimes(2);
    expect(readSince.mock.calls[1]![0]).toEqual({
      readAt: '2026-10-27T15:01:00.000Z',
      id: `e${SHARE_BATCH - 1}`,
    });
    expect(store.values.get(SENT_CURSOR)).toBe(sentCursor('2026-10-27T15:02:00.000Z', 'last'));
  });

  it('keeps the cursor when the server refuses, so the reads go next time', async () => {
    const before = sentCursor('2026-10-27T15:00:00.000Z');
    const store = cursors({ [SENT_CURSOR]: before });
    const link = port({
      readSince: vi.fn(async () => [read('e1', 'a', '2026-10-27T15:01:00.000Z')]),
      sendReads: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    await expect(shareReads(link, store, NOW)).rejects.toThrow('offline');
    expect(store.values.get(SENT_CURSOR)).toBe(before);
  });
});

describe('takeReads', () => {
  const scope = { ado: { organization: 'Gomocha', project: 'FSP' }, hostIds: ['local'] };

  it('starts at now the first time', async () => {
    const store = cursors();
    const link = port();
    expect(await takeReads(link, store, scope, NOW)).toBe(0);
    expect(link.readsSince).not.toHaveBeenCalled();
    expect(store.values.get(RECEIVED_CURSOR)).toBe(NOW);
  });

  it('marks what the phone read here, up to the server time', async () => {
    const store = cursors({ [RECEIVED_CURSOR]: '2026-10-27T15:00:00.000Z' });
    const targets: PhoneActivityTarget[] = [
      { kind: 'pr', key: 'borght-dev/BorgDock#12' },
      { kind: 'item', id: 5 },
      { kind: 'thread', id: 'th', itemId: 5 },
      { kind: 'ci', groupId: 'g' },
      { kind: 'none' },
    ];
    const link = port({
      readsSince: vi.fn(async () => ({ until: '2026-10-27T15:29:00.000Z', targets })),
    });
    expect(await takeReads(link, store, scope, NOW)).toBe(4);
    expect(link.readsSince).toHaveBeenCalledWith('2026-10-27T15:00:00.000Z');
    expect(link.markRead).toHaveBeenCalledWith(
      ['gh:borght-dev/borgdock#12', 'ado:gomocha/fsp:5', 't3:local:thread:th', 'ci:g'],
      '2026-10-27T15:29:00.000Z',
    );
    expect(store.values.get(RECEIVED_CURSOR)).toBe('2026-10-27T15:29:00.000Z');
  });

  it('moves the cursor without marking when nothing was read', async () => {
    const store = cursors({ [RECEIVED_CURSOR]: '2026-10-27T15:00:00.000Z' });
    const link = port();
    await takeReads(link, store, scope, NOW);
    expect(link.markRead).not.toHaveBeenCalled();
    expect(store.values.get(RECEIVED_CURSOR)).toBe(NOW);
  });
});

it('forgetCursors starts both directions over', () => {
  const store = cursors({ [SENT_CURSOR]: 'x', [RECEIVED_CURSOR]: 'y' });
  forgetCursors(store);
  expect(store.values.size).toBe(0);
});
