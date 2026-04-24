import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { IconButton } from '../IconButton';

describe('IconButton', () => {
  it('renders the icon inside a <button class="bd-icon-btn">', () => {
    render(<IconButton icon={<span data-testid="icon" />} aria-label="Close" />);
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('bd-icon-btn');
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('applies the bd-icon-btn--active class when active', () => {
    render(<IconButton icon={<span />} active aria-label="Pin" />);
    expect(screen.getByRole('button')).toHaveClass('bd-icon-btn--active');
  });

  it('does NOT apply the active class by default', () => {
    render(<IconButton icon={<span />} aria-label="Pin" />);
    expect(screen.getByRole('button').className).not.toContain('bd-icon-btn--active');
  });

  it.each([
    [22, 'bd-icon-btn--sm'],
    [30, 'bd-icon-btn--lg'],
  ] as const)('applies size class for size %s', (size, expected) => {
    render(<IconButton icon={<span />} size={size} aria-label="x" />);
    expect(screen.getByRole('button')).toHaveClass(expected);
  });

  it('uses default 26 size when size prop is omitted', () => {
    render(<IconButton icon={<span />} aria-label="x" />);
    const cls = screen.getByRole('button').className;
    expect(cls).not.toContain('bd-icon-btn--sm');
    expect(cls).not.toContain('bd-icon-btn--lg');
  });

  it('surfaces the tooltip prop as the title attribute', () => {
    render(<IconButton icon={<span />} tooltip="Settings" aria-label="Settings" />);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Settings');
  });

  it('fires onClick', () => {
    const onClick = vi.fn();
    render(<IconButton icon={<span />} aria-label="x" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('defaults type to button', () => {
    render(<IconButton icon={<span />} aria-label="x" />);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});
