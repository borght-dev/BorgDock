import { describe, expect, it } from 'vitest';
import { captureLines, contextRef, withCapture } from '../capture';
import { dailyPath, isDailyPath } from '../paths';

describe('daily notes', () => {
  const today = new Date(2026, 9, 28, 9, 30);

  it('names the daily note by the local date', () => {
    expect(dailyPath(today)).toBe('Daily/2026-10-28.md');
    expect(isDailyPath('Daily/2026-10-28.md')).toBe(true);
    expect(isDailyPath('Daily/notes.md')).toBe(false);
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
