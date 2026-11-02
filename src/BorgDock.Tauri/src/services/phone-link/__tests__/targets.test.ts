import { describe, expect, it } from 'vitest';
import type { ActivityEntity } from '@/services/activity/types';
import { entityKeysOf, type LocalScope, targetOf, targetsOf } from '../targets';

const NO_LINKS = { itemIds: [], prUrls: [], workstreamIds: [], ciGroupIds: [] };

const about = (
  entity: Partial<ActivityEntity> & Pick<ActivityEntity, 'kind' | 'key'>,
  itemIds: number[] = [],
) => ({
  entity: { title: 't', url: null, ...entity },
  links: { ...NO_LINKS, itemIds },
});

const scope: LocalScope = {
  ado: { organization: 'Gomocha', project: 'FSP' },
  hostIds: ['local', 'mini'],
};

describe('targetOf', () => {
  it('takes a PR from its address, which keeps GitHub spelling', () => {
    expect(
      targetOf(
        about({
          kind: 'pr',
          key: 'gh:borght-dev/borgdock#12',
          url: 'https://github.com/borght-dev/BorgDock/pull/12',
        }),
      ),
    ).toEqual({ kind: 'pr', key: 'borght-dev/BorgDock#12' });
  });

  it('falls back to the key for a PR without an address', () => {
    expect(targetOf(about({ kind: 'pr', key: 'gh:o/r#3' }))).toEqual({ kind: 'pr', key: 'o/r#3' });
  });

  it('maps a work item to its id', () => {
    expect(targetOf(about({ kind: 'workitem', key: 'ado:gomocha/fsp:41250' }))).toEqual({
      kind: 'item',
      id: 41250,
    });
  });

  it('maps a thread to its raw T3 id and its first linked item', () => {
    expect(targetOf(about({ kind: 'thread', key: 't3:mini:thread:th-1' }, [41250, 7]))).toEqual({
      kind: 'thread',
      id: 'th-1',
      itemId: 41250,
    });
    expect(targetOf(about({ kind: 'thread', key: 't3:local:thread:th-2' }))).toEqual({
      kind: 'thread',
      id: 'th-2',
      itemId: null,
    });
  });

  it('maps a CI failure group to its id', () => {
    expect(targetOf(about({ kind: 'ci-group', key: 'ci:g-9' }))).toEqual({
      kind: 'ci',
      groupId: 'g-9',
    });
  });

  it('leaves out what the server has no counterpart for', () => {
    expect(targetOf(about({ kind: 'workstream', key: 'workstream:w' }))).toBeNull();
    expect(targetOf(about({ kind: 'deployment', key: 'deploy:o/r:1' }))).toBeNull();
    expect(targetOf(about({ kind: 'source', key: 'ci:o/r' }))).toBeNull();
  });
});

describe('targetsOf', () => {
  it('sends one target per thing', () => {
    expect(
      targetsOf([
        about({ kind: 'pr', key: 'gh:o/r#1', url: 'https://github.com/O/R/pull/1' }),
        about({ kind: 'pr', key: 'gh:o/r#1' }),
        about({ kind: 'workstream', key: 'workstream:w' }),
        about({ kind: 'workitem', key: 'ado:gomocha/fsp:5' }),
      ]),
    ).toEqual([
      { kind: 'pr', key: 'O/R#1' },
      { kind: 'item', id: 5 },
    ]);
  });
});

describe('entityKeysOf', () => {
  it('finds a PR whatever its spelling', () => {
    expect(entityKeysOf({ kind: 'pr', key: 'borght-dev/BorgDock#12' }, scope)).toEqual([
      'gh:borght-dev/borgdock#12',
    ]);
  });

  it('finds an item in the configured ADO project', () => {
    expect(entityKeysOf({ kind: 'item', id: 5 }, scope)).toEqual(['ado:gomocha/fsp:5']);
    expect(entityKeysOf({ kind: 'item', id: 5 }, { ...scope, ado: null })).toEqual([]);
  });

  it('finds a thread on every host', () => {
    expect(entityKeysOf({ kind: 'thread', id: 'th', itemId: null }, scope)).toEqual([
      't3:local:thread:th',
      't3:mini:thread:th',
    ]);
  });

  it('round-trips with targetOf', () => {
    const entity = about({ kind: 'ci-group', key: 'ci:g-9' });
    const target = targetOf(entity);
    expect(target && entityKeysOf(target, scope)).toEqual(['ci:g-9']);
    expect(entityKeysOf({ kind: 'none' }, scope)).toEqual([]);
  });
});
