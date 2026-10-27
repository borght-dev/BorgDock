import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  outbox: [] as unknown[],
  acks: [] as unknown[],
  sent: [] as { title: string; body: string; actions?: { action: string; url?: string }[] }[],
}));

vi.mock('@/services/activity/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/activity/api')>();
  return {
    ...actual,
    outboxTake: () => Promise.resolve(mocks.outbox.splice(0)),
    outboxAck: (acks: unknown[]) => {
      mocks.acks.push(...acks);
      return Promise.resolve(acks.length);
    },
  };
});
vi.mock('@/services/notification', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/notification')>();
  return {
    ...actual,
    sendOsNotification: (options: (typeof mocks.sent)[number]) => {
      mocks.sent.push(options);
      return Promise.resolve();
    },
  };
});

import { celebrateMerge } from '@/services/merge-celebration';
import { FIXTURE_ENTRIES, questionEntry, turnEntry } from '../__fixtures__/entries';
import { drainPopups } from '../policy';
import type { ActivityEntry } from '../types';

const NOW = Date.parse('2026-10-27T15:30:00.000Z');

function item(entry: ActivityEntry, createdAgoMs = 1000) {
  return {
    entry,
    channel: 'popup',
    attempts: 0,
    createdAt: new Date(NOW - createdAgoMs).toISOString(),
  };
}

const unread = (entry: ActivityEntry, overrides: Partial<ActivityEntry> = {}): ActivityEntry => ({
  ...entry,
  read: 'unread',
  status: 'open',
  coverage: 'live',
  ...overrides,
});

beforeEach(() => {
  mocks.outbox = [];
  mocks.acks = [];
  mocks.sent = [];
});

describe('drainPopups', () => {
  it('sends nothing when nothing was committed, as after a restart with unchanged sources', async () => {
    await drainPopups(NOW, NOW - 60_000);
    expect(mocks.sent).toEqual([]);
  });

  it('turns rows left from before the restart into one summary', async () => {
    mocks.outbox = FIXTURE_ENTRIES.slice(0, 3).map((entry) => item(unread(entry), 10 * 60_000));
    await drainPopups(NOW, NOW - 60_000);
    expect(mocks.sent).toHaveLength(1);
    expect(mocks.sent[0]?.title).toBe('While you were away');
    expect(mocks.acks).toHaveLength(3);
  });

  it('pops live entries up one by one with their action', async () => {
    mocks.outbox = [item(unread(questionEntry)), item(unread(turnEntry))];
    await drainPopups(NOW, NOW - 60_000);
    expect(mocks.sent.map((popup) => popup.title)).toEqual([
      questionEntry.summary,
      turnEntry.summary,
    ]);
    expect(mocks.sent[0]?.actions?.[0]).toMatchObject({
      action: 'activity-act',
      url: questionEntry.id,
    });
  });

  it('folds a catch-up commit, and a burst of more than four, into one summary', async () => {
    mocks.outbox = [item(unread(questionEntry, { coverage: 'catch-up' }))];
    await drainPopups(NOW, NOW - 60_000);
    expect(mocks.sent[0]?.title).toBe('While you were away');

    mocks.sent = [];
    mocks.outbox = FIXTURE_ENTRIES.slice(0, 6).map((entry) => item(unread(entry)));
    await drainPopups(NOW, NOW - 60_000);
    expect(mocks.sent).toHaveLength(1);
    expect(mocks.sent[0]?.title).toBe('6 updates');
  });

  it('sends nothing for an entry read in the meantime, as one watched in T3', async () => {
    mocks.outbox = [
      item({ ...questionEntry, read: 'read', readReason: 'seen-in-t3' }),
      item(unread(questionEntry, { id: 'answered', status: 'resolved' })),
    ];
    await drainPopups(NOW, NOW - 60_000);
    expect(mocks.sent).toEqual([]);
    expect(mocks.acks).toEqual([
      expect.objectContaining({ outcome: 'skipped' }),
      expect.objectContaining({ outcome: 'skipped' }),
    ]);
  });

  it('leaves a merge done from BorgDock to the celebration it already had', async () => {
    celebrateMerge({ number: 77, title: 'x', repoOwner: 'acme', repoName: 'app', htmlUrl: 'u' });
    mocks.sent = [];
    const merged = unread(turnEntry, {
      id: 'merged',
      category: 'pr.merged',
      action: { kind: 'open-pr', owner: 'acme', repo: 'app', number: 77 },
    });
    mocks.outbox = [item(merged)];
    await drainPopups(NOW, NOW - 60_000);
    expect(mocks.sent).toEqual([]);
  });
});

describe('the popup paths', () => {
  it('leaves no notification for activity events outside policy.ts', () => {
    const root = join(__dirname, '..', '..', '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (!['__tests__', '__fixtures__', 'generated'].includes(name)) walk(path);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(name) || name.includes('.stories.')) continue;
        const text = readFileSync(path, 'utf8');
        if (
          /sendOsNotification\(/.test(text) &&
          /(notifyNew|notifyWorkstreams|followCiNotifications|detectStateTransitions)/.test(text)
        ) {
          offenders.push(path);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  }, 30_000);
});
