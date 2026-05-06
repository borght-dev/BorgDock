import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBar } from '../StatusBar';

describe('StatusBar', () => {
  it('renders the left and right copy passed in', () => {
    render(<StatusBar left="synced 5s ago" right="Press R for Quick Review" />);
    expect(screen.getByText('synced 5s ago')).toBeInTheDocument();
    expect(screen.getByText('Press R for Quick Review')).toBeInTheDocument();
  });

  it('uses the bd-statusbar container class', () => {
    const { container } = render(<StatusBar left="L" right="R" />);
    expect(container.querySelector('.bd-statusbar')).not.toBeNull();
  });
});
