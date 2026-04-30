import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WindowStatusBar } from '../WindowStatusBar';

describe('WindowStatusBar', () => {
  it('renders the left and right slots', () => {
    render(<WindowStatusBar left={<span>L</span>} right={<span>R</span>} />);
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('R')).toBeInTheDocument();
  });

  it('applies the bd-statusbar class to the root', () => {
    const { container } = render(<WindowStatusBar left={<span>x</span>} />);
    const root = container.firstElementChild;
    expect(root?.className).toContain('bd-statusbar');
  });

  it('renders without a right slot', () => {
    render(<WindowStatusBar left={<span>alone</span>} />);
    expect(screen.getByText('alone')).toBeInTheDocument();
  });

  it('renders without a left slot', () => {
    render(<WindowStatusBar right={<span>lone-right</span>} />);
    expect(screen.getByText('lone-right')).toBeInTheDocument();
  });

  it('passes through additional className', () => {
    const { container } = render(<WindowStatusBar className="custom-bar" left={<span>x</span>} />);
    expect(container.firstElementChild?.className).toContain('custom-bar');
  });
});
