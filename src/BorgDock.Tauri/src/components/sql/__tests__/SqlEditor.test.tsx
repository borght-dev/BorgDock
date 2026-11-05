import { render } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SqlEditor } from '../SqlEditor';

beforeAll(() => {
  // jsdom has no layout; CodeMirror measures text through ranges.
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const rects = Object.assign([], { item: () => null });
  Range.prototype.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect }) as DOMRect;
  Range.prototype.getClientRects = () => rects as unknown as DOMRectList;
});

function tokenClass(container: HTMLElement, text: string): string {
  const token = [...container.querySelectorAll('.cm-line span')].find(
    (span) => span.textContent === text,
  );
  return token?.className ?? '';
}

describe('SqlEditor', () => {
  it('colours keywords and strings', () => {
    const { container } = render(
      <SqlEditor
        value="SELECT * FROM Settings WHERE Component LIKE '%Mail%'"
        onChange={vi.fn()}
        onRunQuery={vi.fn()}
        schema={null}
        height={200}
      />,
    );

    const keyword = tokenClass(container, 'SELECT');
    const string = tokenClass(container, "'%Mail%'");
    expect(keyword).not.toBe('');
    expect(string).not.toBe('');
    expect(keyword).not.toBe(string);
  });
});
