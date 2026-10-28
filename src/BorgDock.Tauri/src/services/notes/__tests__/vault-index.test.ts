import { describe, expect, it } from 'vitest';
import { parseNote } from '../parse';
import { buildIndex, type RefContext, resolveLink, workstreamKey } from '../vault-index';

const context: RefContext = {
  adoOrganization: 'acme',
  adoProject: 'FSP',
  repos: [
    { owner: 'acme', name: 'planner' },
    { owner: 'acme', name: 'api' },
    { owner: 'other', name: 'api' },
  ],
};

function index(notes: Record<string, string>) {
  return buildIndex(
    Object.entries(notes).map(([path, text]) => parseNote(path, text)),
    context,
  );
}

describe('resolveLink', () => {
  const vault = index({
    'Plan.md': '',
    'Projects/Plan.md': '',
    'Projects/Deep/Spec.md': '',
  });

  it('matches titles case-insensitively and prefers the shortest path', () => {
    expect(resolveLink(vault, 'plan')).toBe('Plan.md');
    expect(resolveLink(vault, 'Spec')).toBe('Projects/Deep/Spec.md');
  });

  it('matches a vault path when the target holds a folder', () => {
    expect(resolveLink(vault, 'Projects/Plan')).toBe('Projects/Plan.md');
    expect(resolveLink(vault, 'Missing')).toBeNull();
  });
});

describe('buildIndex', () => {
  const vault = index({
    'Daily/2026-10-28.md': 'Waiting on [[Plan]] and [[Plan|again]]; see planner#1412 and AB#48213',
    'Plan.md': [
      '[Run](t3code://threads/env-1/t-1) for [Speed](borgdock://workstreams/ws-1)',
      'api#3 is ambiguous; acme/api#3 is not. #perf',
      '- [ ] Ship it',
    ].join('\n'),
  });

  it('records one backlink per linking note', () => {
    expect(vault.backlinks.get('Plan.md')).toEqual([{ path: 'Daily/2026-10-28.md', line: 0 }]);
  });

  it('records mentions by RefKey, resolving short refs with the configured repos and project', () => {
    expect(vault.mentions.get('gh:github.com/acme/planner#1412')).toEqual([
      { path: 'Daily/2026-10-28.md', line: 0 },
    ]);
    expect(vault.mentions.get('ado:acme#48213')).toHaveLength(1);
    expect(vault.mentions.get('t3:env-1/t-1')).toEqual([{ path: 'Plan.md', line: 0 }]);
    expect(vault.mentions.get(workstreamKey('ws-1'))).toHaveLength(1);
    expect(vault.mentions.get('gh:github.com/acme/api#3')).toEqual([{ path: 'Plan.md', line: 1 }]);
    expect(vault.mentions.has('gh:github.com/other/api#3')).toBe(false);
  });

  it('collects tags and tasks', () => {
    expect(vault.tags.get('perf')).toEqual(['Plan.md']);
    expect(vault.tasks).toEqual([{ line: 2, done: false, text: 'Ship it', path: 'Plan.md' }]);
  });

  it('leaves AB# unresolved without a configured project', () => {
    const bare = buildIndex([parseNote('A.md', 'AB#1')], { ...context, adoProject: null });
    expect(bare.mentions.size).toBe(0);
  });
});
