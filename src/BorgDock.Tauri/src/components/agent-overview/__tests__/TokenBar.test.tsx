import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TokenBar } from '../TokenBar';

describe('TokenBar', () => {
  it('shows the percent', () => {
    render(<TokenBar pct={42} />);
    expect(screen.getByText('42%')).toBeInTheDocument();
  });
});
