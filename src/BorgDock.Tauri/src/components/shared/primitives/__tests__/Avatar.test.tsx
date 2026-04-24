import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Avatar } from '../Avatar';

describe('Avatar', () => {
  it('renders initials inside a bd-avatar span', () => {
    render(<Avatar initials="KV" />);
    const el = screen.getByText('KV');
    expect(el).toHaveClass('bd-avatar');
  });

  it.each([
    ['own', 'bd-avatar--own'],
    ['them', 'bd-avatar--them'],
    ['blue', 'bd-avatar--blue'],
    ['rose', 'bd-avatar--rose'],
  ] as const)('applies %s tone class', (tone, expected) => {
    render(<Avatar initials="X" tone={tone} />);
    expect(screen.getByText('X')).toHaveClass(expected);
  });

  it('defaults tone to "them" when no tone is passed', () => {
    render(<Avatar initials="Y" />);
    expect(screen.getByText('Y')).toHaveClass('bd-avatar--them');
  });

  it.each([
    ['sm', 'bd-avatar--sm'],
    ['lg', 'bd-avatar--lg'],
  ] as const)('applies %s size class', (size, expected) => {
    render(<Avatar initials="A" size={size} />);
    expect(screen.getByText('A')).toHaveClass(expected);
  });

  it('has no size class when size is md', () => {
    render(<Avatar initials="M" size="md" />);
    const cls = screen.getByText('M').className;
    expect(cls).not.toContain('bd-avatar--sm');
    expect(cls).not.toContain('bd-avatar--lg');
  });
});
