import { describe, expect, it } from 'vitest';
import { captureLines, contextRef, withCapture } from '../capture';
import { digestLine, digestSince, sinceBlock } from '../daily';
import { dailyPath, isDailyPath } from '../paths';

describe('daily notes', () => {
  const today = new Date(2026, 9, 28, 9, 30);

  it('names the daily note by the local date', () => {
    expect(dailyPath(today)).toBe('Daily/2026-10-28.md');
    expect(isDailyPath('Daily/2026-10-28.md')).toBe(true);
    expect(isDailyPath('Daily/notes.md')).toBe(false);
  });

  it('starts the digest at the previous daily note, at most a week back', () => {
    expect(digestSince(['Daily/2026-10-27.md', 'Plan.md'], today)).toEqual(new Date(2026, 9, 27));
    expect(digestSince(['Daily/2026-10-01.md'], today)).toEqual(
      new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
    );
    expect(digestSince([], today)).toEqual(new Date(today.getTime() - 24 * 60 * 60 * 1000));
    // Today's own note never counts as the previous one.
    expect(digestSince(['Daily/2026-10-28.md', 'Daily/2026-10-26.md'], today)).toEqual(
      new Date(2026, 9, 26),
    );
  });

  it('writes events with a short ref so their chips draw', () => {
    expect(
      digestLine({
        summary: 'Merged into main',
        entity: { kind: 'pr', key: 'gh:acme/planner#1412', title: 'Fix', url: null },
      } as never),
    ).toBe('- acme/planner#1412 · Merged into main');
    expect(
      digestLine({
        summary: 'AB#7 moved to Code Review',
        entity: { kind: 'ado', key: 'ado:acme/FSP:7', title: 'Bug', url: null },
      } as never),
    ).toBe('- AB#7 moved to Code Review');
    expect(
      digestLine({
        summary: 'Thread finished',
        entity: { kind: 't3', key: 't3:local:thread:1', title: 'T', url: null },
      } as never),
    ).toBe('- Thread finished');
  });

  it('wraps the digest in markers, and writes nothing without events', () => {
    const block = sinceBlock([{ summary: 'One', entity: { key: 'x' } } as never], '2026-10-28');
    expect(block).toEqual([
      '## Since yesterday',
      '<!-- borgdock:since 2026-10-28 -->',
      '- One',
      '<!-- /borgdock:since 2026-10-28 -->',
      '',
    ]);
    expect(sinceBlock([], '2026-10-28')).toEqual([]);
  });
});

describe('quick capture', () => {
  const at = new Date(2026, 9, 28, 14, 5);

  it('times the first line, links the open PR and indents the rest', () => {
    const context = {
      kind: 'pr' as const,
      owner: 'acme',
      repo: 'planner',
      number: 1412,
      title: 'Fix',
      at: 0,
    };
    expect(contextRef(context)).toBe('acme/planner#1412');
    expect(captureLines('Load test passes\nwith the hint', at, context)).toEqual([
      '- 14:05 Load test passes · acme/planner#1412',
      '  with the hint',
    ]);
    expect(captureLines('  idea  ', at, null)).toEqual(['- 14:05 idea']);
  });

  it('appends under Captured in today’s note', () => {
    expect(withCapture('# Wednesday\n', ['- 14:05 idea'])).toBe(
      '# Wednesday\n\n## Captured\n- 14:05 idea\n',
    );
  });
});
