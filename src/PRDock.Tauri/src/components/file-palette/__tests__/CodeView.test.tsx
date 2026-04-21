import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeView } from '../CodeView';

vi.mock('@/services/syntax-highlighter', () => ({
  highlightLines: vi.fn(() => Promise.resolve(null)),
  getHighlightClass: vi.fn(() => 'hl-keyword'),
}));

describe('CodeView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders one row per line with 1-based line numbers', () => {
    render(<CodeView path="test.ts" content={'a\nb\nc'} />);
    const numbers = screen.getAllByTestId('code-line-number');
    expect(numbers.map((n) => n.textContent)).toEqual(['1', '2', '3']);
  });

  it('applies the highlightedLines class to the requested rows', () => {
    render(<CodeView path="t.ts" content={'a\nb\nc\nd'} highlightedLines={[2, 4]} />);
    const rows = screen.getAllByTestId('code-line-row');
    expect(rows[0].className).not.toContain('code-line-row--hit');
    expect(rows[1].className).toContain('code-line-row--hit');
    expect(rows[2].className).not.toContain('code-line-row--hit');
    expect(rows[3].className).toContain('code-line-row--hit');
  });

  it('calls onIdentifierJump on F12 when a word is under the cursor', () => {
    const onJump = vi.fn();
    render(
      <CodeView
        path="t.ts"
        content={'const handleLogin = () => {}'}
        onIdentifierJump={onJump}
      />,
    );
    const lineText = screen.getAllByTestId('code-line-text')[0];
    // Simulate selecting the word handleLogin via native Range.
    const range = document.createRange();
    range.selectNodeContents(lineText);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    fireEvent.keyDown(lineText, { key: 'F12' });
    expect(onJump).toHaveBeenCalledWith(expect.stringContaining('handleLogin'));
  });

  it('writes full content to clipboard on Ctrl+Shift+C', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CodeView path="t.ts" content="hello" />);
    const root = screen.getByTestId('code-view-root');
    await act(async () => {
      fireEvent.keyDown(root, { key: 'C', ctrlKey: true, shiftKey: true });
    });
    expect(writeText).toHaveBeenCalledWith('hello');
  });
});
