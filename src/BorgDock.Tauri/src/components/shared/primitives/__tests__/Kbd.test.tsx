import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Kbd } from '../Kbd';

describe('Kbd', () => {
  it('renders children inside a <kbd class="bd-kbd">', () => {
    render(<Kbd>Ctrl</Kbd>);
    const el = screen.getByText('Ctrl');
    expect(el.tagName).toBe('KBD');
    expect(el).toHaveClass('bd-kbd');
  });

  it('forwards className', () => {
    render(<Kbd className="extra">Enter</Kbd>);
    expect(screen.getByText('Enter')).toHaveClass('extra');
  });
});
