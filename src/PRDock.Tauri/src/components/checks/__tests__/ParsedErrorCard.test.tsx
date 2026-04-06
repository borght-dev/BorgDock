import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ParsedErrorCard } from '../ParsedErrorCard';
import type { ParsedError } from '@/types';

const makeError = (overrides: Partial<ParsedError> = {}): ParsedError => ({
  filePath: 'src/app.ts',
  lineNumber: 10,
  columnNumber: 5,
  message: 'Type error occurred',
  errorCode: 'TS2322',
  category: 'error',
  isIntroducedByPr: false,
  ...overrides,
});

describe('ParsedErrorCard', () => {
  it('renders file path with line and column numbers', () => {
    render(<ParsedErrorCard error={makeError()} />);
    expect(screen.getByText('src/app.ts:10:5')).toBeDefined();
  });

  it('renders file path without line number when undefined', () => {
    render(<ParsedErrorCard error={makeError({ lineNumber: undefined, columnNumber: undefined })} />);
    expect(screen.getByText('src/app.ts')).toBeDefined();
  });

  it('renders file path with line number but no column', () => {
    render(<ParsedErrorCard error={makeError({ columnNumber: undefined })} />);
    expect(screen.getByText('src/app.ts:10')).toBeDefined();
  });

  it('renders error message', () => {
    render(<ParsedErrorCard error={makeError()} />);
    expect(screen.getByText('Type error occurred')).toBeDefined();
  });

  it('renders error code when present', () => {
    render(<ParsedErrorCard error={makeError({ errorCode: 'TS2322' })} />);
    expect(screen.getByText('TS2322:')).toBeDefined();
  });

  it('does not render error code when empty', () => {
    render(<ParsedErrorCard error={makeError({ errorCode: '' })} />);
    expect(screen.queryByText(':')).toBeNull();
  });

  it('shows "Error" badge for error category', () => {
    render(<ParsedErrorCard error={makeError({ category: 'error' })} />);
    expect(screen.getByText('Error')).toBeDefined();
  });

  it('shows "Error" badge for failure category', () => {
    render(<ParsedErrorCard error={makeError({ category: 'build failure' })} />);
    expect(screen.getByText('Error')).toBeDefined();
  });

  it('shows "Warning" badge for warning category', () => {
    render(<ParsedErrorCard error={makeError({ category: 'warning' })} />);
    expect(screen.getByText('Warning')).toBeDefined();
  });

  it('shows "Info" badge for unknown category', () => {
    render(<ParsedErrorCard error={makeError({ category: 'note' })} />);
    expect(screen.getByText('Info')).toBeDefined();
  });

  it('shows "Introduced by this PR" badge when isIntroducedByPr is true', () => {
    render(<ParsedErrorCard error={makeError({ isIntroducedByPr: true })} />);
    expect(screen.getByText('Introduced by this PR')).toBeDefined();
  });

  it('does not show "Introduced by this PR" badge when isIntroducedByPr is false', () => {
    render(<ParsedErrorCard error={makeError({ isIntroducedByPr: false })} />);
    expect(screen.queryByText('Introduced by this PR')).toBeNull();
  });
});
