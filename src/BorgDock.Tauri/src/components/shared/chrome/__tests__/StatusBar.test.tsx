import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBar } from '../StatusBar';

describe('StatusBar', () => {
  it('renders the left and right slots', () => {
    render(<StatusBar left={<span>L</span>} right={<span>R</span>} />);
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('R')).toBeInTheDocument();
  });

  it('applies the bd-statusbar class to the root', () => {
    const { container } = render(<StatusBar left={<span>x</span>} />);
    const root = container.firstElementChild;
    expect(root?.className).toContain('bd-statusbar');
  });

  it('renders without a right slot', () => {
    render(<StatusBar left={<span>alone</span>} />);
    expect(screen.getByText('alone')).toBeInTheDocument();
  });

  it('renders without a left slot', () => {
    render(<StatusBar right={<span>lone-right</span>} />);
    expect(screen.getByText('lone-right')).toBeInTheDocument();
  });

  it('passes through additional className', () => {
    const { container } = render(<StatusBar className="custom-bar" left={<span>x</span>} />);
    expect(container.firstElementChild?.className).toContain('custom-bar');
  });
});
