import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LabelBadge } from '../LabelBadge';

afterEach(cleanup);

describe('LabelBadge', () => {
  it('renders the label text', () => {
    render(<LabelBadge label="bug" />);
    expect(screen.getByText('bug')).toBeInTheDocument();
  });

  it('renders with default styling when no color is provided', () => {
    const { container } = render(<LabelBadge label="enhancement" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('rounded-full');
    // Should not have inline style for backgroundColor
    expect(span?.style.backgroundColor).toBe('');
  });

  it('applies color styling when hex color with # is provided', () => {
    const { container } = render(<LabelBadge label="urgent" color="#ff0000" />);
    const span = container.querySelector('span');
    // JSDOM normalizes hex+alpha to rgba
    expect(span?.style.backgroundColor).toBe('rgba(255, 0, 0, 0.2)');
  });

  it('applies color styling when hex color without # is provided', () => {
    const { container } = render(<LabelBadge label="docs" color="00ff00" />);
    const span = container.querySelector('span');
    expect(span?.style.backgroundColor).toBe('rgba(0, 255, 0, 0.2)');
  });

  it('uses dark text on light background colors', () => {
    const { container } = render(<LabelBadge label="light" color="#ffffff" />);
    const span = container.querySelector('span');
    // luminance > 0.5 -> dark text (JSDOM normalizes to rgb)
    expect(span?.style.color).toBe('rgb(26, 29, 38)');
  });

  it('uses white text on dark background colors', () => {
    const { container } = render(<LabelBadge label="dark" color="#000000" />);
    const span = container.querySelector('span');
    expect(span?.style.color).toBe('rgb(255, 255, 255)');
  });
});
