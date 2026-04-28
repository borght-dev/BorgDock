import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LabelBadge } from '../LabelBadge';

afterEach(cleanup);

describe('LabelBadge', () => {
  it('renders the label text inside a Pill', () => {
    const { container } = render(<LabelBadge label="bug" />);
    expect(screen.getByText('bug')).toBeInTheDocument();
    expect(container.querySelector('.bd-pill')).toBeInTheDocument();
  });

  it('uses neutral tone', () => {
    const { container } = render(<LabelBadge label="enhancement" />);
    expect(container.querySelector('.bd-pill--neutral')).toBeInTheDocument();
  });
});
