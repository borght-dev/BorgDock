import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeJournal } from './fake-journal';

const journal = vi.hoisted(() => ({ current: null as unknown as FakeJournal }));

vi.mock('@/services/activity/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/activity/api')>();
  return {
    ...actual,
    openSource: (request: Parameters<FakeJournal['openSource']>[0]) =>
      journal.current.openSource(request),
    commit: (request: Parameters<FakeJournal['commit']>[0]) => journal.current.commit(request),
    listSources: () => journal.current.listSources(),
    retireSource: (sourceId: string) => journal.current.retireSource(sourceId),
  };
});

import { useActivityStore } from '@/stores/activity-store';
import { makeEntry } from '../derive/shared';
import { type Deriver, ingest, resetActivityIngest, type SourceDescriptor } from '../ingest';
import type { ActivitySourceKind } from '../types';

/**
 * One account reads a repository at a time: the source it was read under
 * before is retired, which ends what that source left needing me. This is
 * what kept review requests and failures open for weeks after the active
 * `gh` account changed.
 */

function scoped(
  kind: ActivitySourceKind,
  account: string,
  repository = 'acme/app',
): SourceDescriptor {
  const scope = `github.com|${account}|${repository}`;
  return {
    sourceId: `${kind}:${scope}`,
    kind,
    label: `${repository} (${account})`,
    configKey: scope,
  };
}

/** Whatever the number observed: after the seed, one entry that needs me per new number. */
const needing: Deriver<number, number> = (ctx, baseline, observed) => ({
  baseline: observed,
  entries:
    ctx.seed || baseline === observed
      ? []
      : [
          makeEntry(ctx, {
            nativeKey: `#${observed}:review-request`,
            entity: {
              kind: 'pr',
              key: `gh:acme/app#${observed}`,
              title: 'Faster login',
              url: null,
            },
            category: 'pr.review-request',
            severity: 'warning',
            needsYou: true,
            sourceAt: null,
            summary: `ann asks for your review on #${observed}`,
          }),
        ],
  enrichments: [],
  resolutions: [],
  seen: [],
});

let time = 0;
const read = (source: SourceDescriptor, observed: number) =>
  ingest(source, { time: ++time }, needing, observed);

const open = () =>
  [...journal.current.entries.values()].filter((entry) => entry.status === 'open').map((e) => e.id);

beforeEach(() => {
  journal.current = new FakeJournal();
  resetActivityIngest();
  useActivityStore.setState({ commitErrors: {}, readOnly: false });
  time = 0;
});

describe('one account reads a repository at a time', () => {
  it('retires the source another account read the repository under, with what it left open', async () => {
    const work = scoped('gh', 'koen-work');
    const personal = scoped('gh', 'koen');
    await read(work, 1);
    await read(work, 412);
    expect(open()).toEqual([`${work.sourceId}|#412:review-request`]);

    // `gh auth switch`: the same repository, read as another account.
    await read(personal, 1);
    expect(journal.current.retired).toEqual(new Set([work.sourceId]));
    expect(open()).toEqual([]);
  });

  it('brings a source back when its account reads the repository again', async () => {
    const work = scoped('gh', 'koen-work');
    const personal = scoped('gh', 'koen');
    await read(work, 1);
    await read(personal, 1);
    expect(journal.current.retired).toEqual(new Set([work.sourceId]));

    await read(work, 2);
    expect(journal.current.retired).toEqual(new Set([personal.sourceId]));
    // It continues from its own baseline instead of seeding again.
    expect(journal.current.sources.get(work.sourceId)?.generation).toBe(1);
    expect(open()).toEqual([`${work.sourceId}|#2:review-request`]);
  });

  it('asks the journal once per change of reader, not on every read', async () => {
    const listed = vi.spyOn(journal.current, 'listSources');
    const personal = scoped('gh', 'koen');
    await read(personal, 1);
    await read(personal, 2);
    await read(personal, 3);
    expect(listed).toHaveBeenCalledTimes(1);
  });

  it('leaves other repositories, other kinds and T3 hosts alone', async () => {
    const sources = [
      scoped('gh', 'koen-work'),
      scoped('gh', 'koen', 'acme/api'),
      scoped('ci', 'koen'),
      scoped('deploy', 'koen'),
      { sourceId: 't3:local', kind: 't3' as const, label: 'This laptop', configKey: 'env-1' },
      { sourceId: 't3:mini', kind: 't3' as const, label: 'Mac mini', configKey: 'env-2' },
    ];
    for (const source of sources) await read(source, 1);
    expect(journal.current.retired).toEqual(new Set());

    await read(scoped('ci', 'koen-work'), 1);
    expect(journal.current.retired).toEqual(new Set(['ci:github.com|koen|acme/app']));
  });

  it('keeps reading when the journal cannot list its sources', async () => {
    vi.spyOn(journal.current, 'listSources').mockRejectedValueOnce(new Error('busy'));
    const personal = scoped('gh', 'koen');
    expect(await read(personal, 1)).toBe('committed');
    expect(await read(personal, 2)).toBe('committed');
  });
});
