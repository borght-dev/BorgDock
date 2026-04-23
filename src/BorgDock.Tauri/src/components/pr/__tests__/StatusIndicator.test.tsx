import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusIndicator } from '../StatusIndicator';

afterEach(cleanup);

describe('StatusIndicator', () => {
  it('renders a green dot with correct aria-label', () => {
    render(<StatusIndicator status="green" />);
    expect(screen.getByLabelText('Status: green')).toBeInTheDocument();
  });

  it('renders a red dot with correct aria-label', () => {
    render(<StatusIndicator status="red" />);
    expect(screen.getByLabelText('Status: red')).toBeInTheDocument();
  });

  it('renders a gray dot with correct aria-label', () => {
    render(<StatusIndicator status="gray" />);
    expect(screen.getByLabelText('Status: gray')).toBeInTheDocument();
  });

  it('renders a spinning arc for yellow (in-progress) status', () => {
    render(<StatusIndicator status="yellow" />);
    const el = screen.getByLabelText('Status: in progress');
    expect(el).toBeInTheDocument();
    // The yellow variant uses an SVG spinner, not a plain dot
    expect(el.querySelector('svg')).toBeInTheDocument();
  });

  it('applies rounded-full class for non-yellow statuses', () => {
    const { container } = render(<StatusIndicator status="green" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('rounded-full');
  });

  it('does not use rounded-full class for yellow status', () => {
    const { container } = render(<StatusIndicator status="yellow" />);
    const span = container.querySelector('span');
    expect(span?.className).not.toContain('rounded-full');
  });
});
