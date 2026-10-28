import { describe, expect, it } from 'vitest';
import { parseFrontmatter, parseNote, scanLine, titleOf } from '../parse';

const kinds = (line: string) => scanLine(line).map((t) => t.kind);

describe('scanLine', () => {
  it('reads wikilinks with a heading and a label', () => {
    const [link] = scanLine('See [[SQL plan regressions#Fix|the fix]] now');
    expect(link).toMatchObject({
      kind: 'wikilink',
      target: 'SQL plan regressions',
      heading: 'Fix',
      label: 'the fix',
      from: 4,
    });
  });

  it('reads AB# items and repo#n pull requests', () => {
    const tokens = scanLine('Tracked in AB#48213, fix in planner#1412 and acme/api#7.');
    expect(tokens).toMatchObject([
      { kind: 'ado', id: 48213, organization: null },
      { kind: 'pr', owner: null, repo: 'planner', number: 1412 },
      { kind: 'pr', owner: 'acme', repo: 'api', number: 7 },
    ]);
  });

  it('never reads AB#123 as a pull request in a repository named AB', () => {
    expect(kinds('AB#123')).toEqual(['ado']);
  });

  it('reads T3 thread and workstream links', () => {
    const tokens = scanLine(
      '[Profile planner query](t3code://threads/env-1/8f2c) for [Planner speed](borgdock://workstreams/ws-1)',
    );
    expect(tokens).toMatchObject([
      { kind: 't3', label: 'Profile planner query', environmentId: 'env-1', threadId: '8f2c' },
      { kind: 'workstream', label: 'Planner speed', id: 'ws-1' },
    ]);
  });

  it('reads pull request and work item addresses', () => {
    const tokens = scanLine(
      'https://github.com/acme/planner/pull/1412 and https://dev.azure.com/acme/FSP/_workitems/edit/48213',
    );
    expect(tokens).toMatchObject([
      { kind: 'pr', owner: 'acme', repo: 'planner', number: 1412, url: true },
      { kind: 'ado', id: 48213, organization: 'acme', project: 'FSP', url: true },
    ]);
  });

  it('reads tags but not numbers, anchors or headings', () => {
    expect(
      scanLine('#perf and #team/planner, not #123 or page#section').map((t) => t.kind),
    ).toEqual(['tag', 'tag']);
    expect(scanLine('#Perf')[0]).toMatchObject({ tag: 'perf' });
  });

  it('skips inline code', () => {
    expect(kinds('run `git log AB#12` then [[Plan]]')).toEqual(['wikilink']);
  });
});

describe('parseFrontmatter', () => {
  it('reads values, inline lists and block lists', () => {
    const lines = [
      '---',
      'title: "Plan"',
      'tags: [perf, planner]',
      'aliases:',
      '  - Plan A',
      '---',
      'body',
    ];
    expect(parseFrontmatter(lines)).toEqual({
      frontmatter: { title: 'Plan', tags: ['perf', 'planner'], aliases: ['Plan A'] },
      body: 6,
    });
  });

  it('is empty without a closing line', () => {
    expect(parseFrontmatter(['---', 'a: b'])).toEqual({ frontmatter: {}, body: 0 });
  });
});

describe('parseNote', () => {
  const text = [
    '---',
    'tags: [perf]',
    'workstream: "[Planner speed](borgdock://workstreams/ws-1)"',
    '---',
    '# Planner slow-load',
    'Tracked in AB#48213. #planner',
    '```',
    '[[Not a link]] AB#1',
    '```',
    '- [ ] Rerun the load test',
    '- [x] Capture the slow query',
  ].join('\n');

  it('collects headings, tasks, tags and tokens, skipping code fences', () => {
    const note = parseNote('Projects/Planner slow-load.md', text);
    expect(note.title).toBe('Planner slow-load');
    expect(note.headings).toEqual([{ level: 1, text: 'Planner slow-load', line: 4 }]);
    expect(note.tasks).toEqual([
      { line: 9, done: false, text: 'Rerun the load test' },
      { line: 10, done: true, text: 'Capture the slow query' },
    ]);
    expect(note.tags).toEqual(['perf', 'planner']);
    expect(note.tokens.map((t) => [t.kind, t.line])).toEqual([
      ['workstream', 2],
      ['ado', 5],
      ['tag', 5],
    ]);
  });

  it('names a note by its file name', () => {
    expect(titleOf('Daily/2026-10-28.md')).toBe('2026-10-28');
  });
});
