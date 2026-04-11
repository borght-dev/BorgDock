import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LogViewer } from '../LogViewer';

// tanstack/react-virtual needs scrollElement dimensions — jsdom returns 0.
// Mock useVirtualizer to render all items so we can test content logic.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 18,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        start: i * 18,
        size: 18,
        key: i,
      })),
    scrollToIndex: vi.fn(),
  }),
}));

describe('LogViewer', () => {
  it('renders log lines with line numbers', () => {
    render(<LogViewer log={'line one\nline two\nline three'} />);
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByText('line one')).toBeDefined();
    expect(screen.getByText('line two')).toBeDefined();
    expect(screen.getByText('line three')).toBeDefined();
  });

  it('renders empty log as a single empty line', () => {
    const { container } = render(<LogViewer log="" />);
    // Virtualized: each line is a div with flex layout
    const rows = container.querySelectorAll('[style*="translateY"]');
    expect(rows.length).toBe(1);
  });

  it('renders a search input', () => {
    render(<LogViewer log="test" />);
    expect(screen.getByPlaceholderText('Search log...')).toBeDefined();
  });

  it('highlights matching text in log lines', () => {
    render(<LogViewer log={'error: something failed\ninfo: all good'} />);
    const input = screen.getByPlaceholderText('Search log...');
    fireEvent.change(input, { target: { value: 'error' } });
    const marks = document.querySelectorAll('mark');
    expect(marks.length).toBe(1);
    expect(marks[0]!.textContent).toBe('error');
  });

  it('highlights case-insensitively', () => {
    render(<LogViewer log="ERROR: something failed" />);
    const input = screen.getByPlaceholderText('Search log...');
    fireEvent.change(input, { target: { value: 'error' } });
    const marks = document.querySelectorAll('mark');
    expect(marks.length).toBe(1);
    expect(marks[0]!.textContent).toBe('ERROR');
  });

  it('does not highlight when search is empty', () => {
    render(<LogViewer log="error: something failed" />);
    const marks = document.querySelectorAll('mark');
    expect(marks.length).toBe(0);
  });

  it('does not highlight when search does not match', () => {
    render(<LogViewer log="all good here" />);
    const input = screen.getByPlaceholderText('Search log...');
    fireEvent.change(input, { target: { value: 'zzz' } });
    const marks = document.querySelectorAll('mark');
    expect(marks.length).toBe(0);
  });

  it('renders auto-scroll checkbox checked by default', () => {
    render(<LogViewer log="test" />);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('can toggle auto-scroll off', () => {
    render(<LogViewer log="test" />);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
  });

  it('renders many log lines correctly', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n');
    const { container } = render(<LogViewer log={lines} />);
    const rows = container.querySelectorAll('[style*="translateY"]');
    expect(rows.length).toBe(100);
  });
});
