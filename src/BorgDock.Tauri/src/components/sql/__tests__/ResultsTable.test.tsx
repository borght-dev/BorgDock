import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResultsTable } from '../ResultsTable';

describe('ResultsTable', () => {
  const defaultProps = {
    columns: ['id', 'name', 'email'],
    rows: [
      ['1', 'Alice', 'alice@example.com'],
      ['2', 'Bob', 'bob@example.com'],
      ['3', 'Charlie', null],
    ],
    selectedRows: new Set<number>(),
    onSelectionChange: vi.fn(),
  };

  it('renders nothing when columns are empty', () => {
    const { container } = render(
      <ResultsTable columns={[]} rows={[]} selectedRows={new Set()} onSelectionChange={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders column headers', () => {
    render(<ResultsTable {...defaultProps} />);
    expect(screen.getByText('id')).toBeTruthy();
    expect(screen.getByText('name')).toBeTruthy();
    expect(screen.getByText('email')).toBeTruthy();
  });

  it('renders row numbers starting at 1', () => {
    const { container } = render(<ResultsTable {...defaultProps} />);
    const rowNums = container.querySelectorAll('.sql-row-num');
    expect(rowNums.length).toBe(3);
    expect(rowNums[0]!.textContent).toBe('1');
    expect(rowNums[1]!.textContent).toBe('2');
    expect(rowNums[2]!.textContent).toBe('3');
  });

  it('renders cell data', () => {
    render(<ResultsTable {...defaultProps} />);
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('alice@example.com')).toBeTruthy();
  });

  it('renders NULL for null cells', () => {
    render(<ResultsTable {...defaultProps} />);
    expect(screen.getByText('NULL')).toBeTruthy();
  });

  it('calls onSelectionChange with clicked row on simple click', () => {
    const onSelectionChange = vi.fn();
    render(<ResultsTable {...defaultProps} onSelectionChange={onSelectionChange} />);

    fireEvent.click(screen.getByText('Alice'));
    expect(onSelectionChange).toHaveBeenCalled();

    const sel = onSelectionChange.mock.calls[0]![0] as Set<number>;
    expect(sel.has(0)).toBe(true);
    expect(sel.size).toBe(1);
  });

  it('supports Ctrl+click to toggle individual rows', () => {
    const onSelectionChange = vi.fn();
    render(
      <ResultsTable
        {...defaultProps}
        selectedRows={new Set([0])}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getByText('Bob'), { ctrlKey: true });
    const sel = onSelectionChange.mock.calls[0]![0] as Set<number>;
    expect(sel.has(0)).toBe(true);
    expect(sel.has(1)).toBe(true);
  });

  it('supports Ctrl+click to deselect a row', () => {
    const onSelectionChange = vi.fn();
    render(
      <ResultsTable
        {...defaultProps}
        selectedRows={new Set([0, 1])}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getByText('Alice'), { ctrlKey: true });
    const sel = onSelectionChange.mock.calls[0]![0] as Set<number>;
    expect(sel.has(0)).toBe(false);
    expect(sel.has(1)).toBe(true);
  });

  it('supports metaKey+click (Cmd on Mac) for toggle', () => {
    const onSelectionChange = vi.fn();
    render(
      <ResultsTable
        {...defaultProps}
        selectedRows={new Set()}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getByText('Bob'), { metaKey: true });
    const sel = onSelectionChange.mock.calls[0]![0] as Set<number>;
    expect(sel.has(1)).toBe(true);
  });

  it('supports Shift+click for range selection', () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <ResultsTable
        {...defaultProps}
        selectedRows={new Set()}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getByText('Alice'));
    const firstSel = onSelectionChange.mock.calls[0]![0] as Set<number>;
    expect(firstSel.has(0)).toBe(true);

    rerender(
      <ResultsTable
        {...defaultProps}
        selectedRows={firstSel}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getByText('Charlie'), { shiftKey: true });
    const rangeSel = onSelectionChange.mock.calls[1]![0] as Set<number>;
    expect(rangeSel.has(0)).toBe(true);
    expect(rangeSel.has(1)).toBe(true);
    expect(rangeSel.has(2)).toBe(true);
  });

  it('renders the # header for row numbers', () => {
    render(<ResultsTable {...defaultProps} />);
    expect(screen.getByText('#')).toBeTruthy();
  });

  it('applies selected styling to selected rows', () => {
    const { container } = render(
      <ResultsTable {...defaultProps} selectedRows={new Set([1])} onSelectionChange={vi.fn()} />,
    );
    const selectedRows = container.querySelectorAll('.sql-data-row--selected');
    expect(selectedRows.length).toBe(1);
  });

  it('applies null styling to null cells', () => {
    const { container } = render(<ResultsTable {...defaultProps} />);
    const nullCells = container.querySelectorAll('.sql-cell--null');
    expect(nullCells.length).toBe(1);
  });

  it('exposes [data-sql-results-table] and one tbody row per data row', () => {
    const { container } = render(
      <ResultsTable
        columns={['a', 'b']}
        rows={[
          ['1', '2'],
          ['3', null],
        ]}
        selectedRows={new Set()}
        onSelectionChange={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-sql-results-table]')).not.toBeNull();
    expect(container.querySelectorAll('tbody tr').length).toBe(2);
  });
});
