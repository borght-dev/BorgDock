import { describe, expect, it } from 'vitest';
import { safeTitle, uniquePath } from '../paths';
import {
  appendUnderHeading,
  fillTemplate,
  hasMarkerBlock,
  markerBlock,
  renameLinks,
  setTask,
} from '../text-edits';

describe('appendUnderHeading', () => {
  it('adds the heading at the end when it is missing', () => {
    expect(appendUnderHeading('# Today\nStandup\n\n', 'Captured', ['- 09:12 idea'])).toBe(
      '# Today\nStandup\n\n## Captured\n- 09:12 idea\n',
    );
  });

  it('appends at the end of the section, before the next heading', () => {
    const text = '## Captured\n- 08:00 first\n\n## Notes\nbody\n';
    expect(appendUnderHeading(text, 'captured', ['- 09:00 second'])).toBe(
      '## Captured\n- 08:00 first\n- 09:00 second\n\n## Notes\nbody\n',
    );
  });

  it('keeps CRLF line endings', () => {
    expect(appendUnderHeading('## A\r\nx', 'A', ['y'])).toBe('## A\r\nx\r\ny');
  });

  it('works on an empty note', () => {
    expect(appendUnderHeading('', 'Threads', ['- one'])).toBe('## Threads\n- one\n');
  });
});

describe('setTask', () => {
  it('ticks and unticks the task on its line', () => {
    expect(setTask('a\n- [ ] ship', 1, 'ship', true)).toBe('a\n- [x] ship');
    expect(setTask('  * [X] done', 0, 'done', false)).toBe('  * [ ] done');
  });

  it('finds the task by its text when the lines moved', () => {
    const moved = '- [ ] added elsewhere\n- [ ] First\n- [ ] Second';
    expect(setTask(moved, 1, 'Second', true)).toBe(
      '- [ ] added elsewhere\n- [ ] First\n- [x] Second',
    );
  });

  it('changes nothing when the task is gone or already in that state', () => {
    expect(setTask('just text', 0, 'ship', true)).toBeNull();
    expect(setTask('- [x] ship', 0, 'ship', true)).toBeNull();
    expect(setTask('x', 4, 'x', true)).toBeNull();
  });
});

describe('markers', () => {
  it('wraps a block and finds it again', () => {
    const block = markerBlock('agent t-1 m-2', ['said this']);
    expect(block).toEqual([
      '<!-- borgdock:agent t-1 m-2 -->',
      'said this',
      '<!-- /borgdock:agent t-1 m-2 -->',
    ]);
    expect(hasMarkerBlock(block.join('\n'), 'agent t-1 m-2')).toBe(true);
    expect(hasMarkerBlock(block.join('\n'), 'agent t-1 m-3')).toBe(false);
  });
});

describe('renameLinks', () => {
  it('points links, headings and labels at the new title and leaves others alone', () => {
    const text = 'See [[Plan]], [[plan#Risks|risks]], [[Projects/Plan]] and [[Planner]].';
    expect(renameLinks(text, ['Plan', 'Projects/Plan'], 'Launch plan')).toBe(
      'See [[Launch plan]], [[Launch plan#Risks|risks]], [[Launch plan]] and [[Planner]].',
    );
  });
});

describe('templates and titles', () => {
  it('fills placeholders', () => {
    expect(
      fillTemplate('# {{title}} — {{ date }} {{time}}', { title: 'T', date: 'D', time: '09:00' }),
    ).toBe('# T — D 09:00');
  });

  it('makes titles safe file names and numbers duplicates', () => {
    expect(safeTitle('  What: is #this? ')).toBe('What is this');
    expect(safeTitle('...')).toBe('Untitled');
    expect(
      uniquePath('Projects', 'Plan', new Set(['Projects/plan.md', 'Projects/Plan 2.md'])),
    ).toBe('Projects/Plan 3.md');
  });
});
