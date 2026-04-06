import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CheckDetailPanel } from '../CheckDetailPanel';
import type { CheckRun, ParsedError } from '@/types';

// Mock child components so we isolate CheckDetailPanel logic
vi.mock('../LogViewer', () => ({
  LogViewer: ({ log }: { log: string }) => <div data-testid="log-viewer">{log}</div>,
}));

vi.mock('../ParsedErrorCard', () => ({
  ParsedErrorCard: ({ error }: { error: ParsedError }) => (
    <div data-testid="parsed-error-card">{error.message}</div>
  ),
}));

const makeCheckRun = (overrides: Partial<CheckRun> = {}): CheckRun => ({
  id: 1,
  name: 'build',
  status: 'completed',
  conclusion: 'success',
  htmlUrl: 'https://github.com/runs/1',
  checkSuiteId: 100,
  ...overrides,
});

const makeError = (overrides: Partial<ParsedError> = {}): ParsedError => ({
  filePath: 'src/app.ts',
  lineNumber: 10,
  columnNumber: 5,
  message: 'Type error',
  errorCode: 'TS2322',
  category: 'error',
  isIntroducedByPr: false,
  ...overrides,
});

describe('CheckDetailPanel', () => {
  it('renders a select with all check runs', () => {
    const runs = [
      makeCheckRun({ id: 1, name: 'build', conclusion: 'success' }),
      makeCheckRun({ id: 2, name: 'lint', conclusion: 'failure' }),
    ];
    render(<CheckDetailPanel checkRuns={runs} />);
    const select = screen.getByRole('combobox');
    expect(select).toBeDefined();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]!.textContent).toContain('build');
    expect(options[1]!.textContent).toContain('lint');
  });

  it('selects the first run by default when no selectedRunId is provided', () => {
    const runs = [
      makeCheckRun({ id: 1, name: 'build' }),
      makeCheckRun({ id: 2, name: 'lint' }),
    ];
    render(<CheckDetailPanel checkRuns={runs} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('1');
  });

  it('selects the specified run via selectedRunId', () => {
    const runs = [
      makeCheckRun({ id: 1, name: 'build' }),
      makeCheckRun({ id: 2, name: 'lint' }),
    ];
    render(<CheckDetailPanel checkRuns={runs} selectedRunId={2} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('2');
  });

  it('displays the selected run name in the toggle header', () => {
    const runs = [makeCheckRun({ id: 1, name: 'build' })];
    render(<CheckDetailPanel checkRuns={runs} />);
    expect(screen.getByText('build')).toBeDefined();
  });

  it('shows "No parsed errors" message when parsedErrors is empty', () => {
    const runs = [makeCheckRun()];
    render(<CheckDetailPanel checkRuns={runs} parsedErrors={[]} />);
    expect(screen.getByText('No parsed errors for this check run.')).toBeDefined();
  });

  it('renders ParsedErrorCard for each error', () => {
    const runs = [makeCheckRun()];
    const errors = [
      makeError({ message: 'Error one' }),
      makeError({ message: 'Error two' }),
    ];
    render(<CheckDetailPanel checkRuns={runs} parsedErrors={errors} />);
    expect(screen.getAllByTestId('parsed-error-card')).toHaveLength(2);
    expect(screen.getByText('Error one')).toBeDefined();
    expect(screen.getByText('Error two')).toBeDefined();
  });

  it('toggles between errors and raw log on button click', () => {
    const runs = [makeCheckRun()];
    const errors = [makeError()];
    render(<CheckDetailPanel checkRuns={runs} parsedErrors={errors} rawLog="raw log content" />);

    // Initially shows errors
    expect(screen.getByTestId('parsed-error-card')).toBeDefined();
    expect(screen.queryByTestId('log-viewer')).toBeNull();

    // Click "Show Raw Log"
    fireEvent.click(screen.getByText('Show Raw Log'));
    expect(screen.getByTestId('log-viewer')).toBeDefined();
    expect(screen.getByText('raw log content')).toBeDefined();
    expect(screen.queryByTestId('parsed-error-card')).toBeNull();

    // Click "Show Errors" to toggle back
    fireEvent.click(screen.getByText('Show Errors'));
    expect(screen.getByTestId('parsed-error-card')).toBeDefined();
    expect(screen.queryByTestId('log-viewer')).toBeNull();
  });

  it('allows changing the selected run via the dropdown', () => {
    const runs = [
      makeCheckRun({ id: 1, name: 'build' }),
      makeCheckRun({ id: 2, name: 'lint' }),
    ];
    render(<CheckDetailPanel checkRuns={runs} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '2' } });
    expect(select.value).toBe('2');
    expect(screen.getByText('lint')).toBeDefined();
  });

  it('shows "Check Details" when no run is selected/found', () => {
    const runs = [makeCheckRun({ id: 1, name: 'build' })];
    // Force selectedRunId that does not match any run
    render(<CheckDetailPanel checkRuns={runs} selectedRunId={999} />);
    expect(screen.getByText('Check Details')).toBeDefined();
  });

  it('shows status when conclusion is null', () => {
    const runs = [makeCheckRun({ id: 1, name: 'deploy', status: 'in_progress', conclusion: undefined })];
    render(<CheckDetailPanel checkRuns={runs} />);
    const option = screen.getByRole('option') as HTMLOptionElement;
    expect(option.textContent).toContain('in_progress');
  });
});
