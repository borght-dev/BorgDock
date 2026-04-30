import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatePill } from '../StatePill';

describe('StatePill', () => {
  it('shows the human label', () => {
    render(<StatePill state="awaiting" />);
    expect(screen.getByText('Awaiting input')).toBeInTheDocument();
  });
});
