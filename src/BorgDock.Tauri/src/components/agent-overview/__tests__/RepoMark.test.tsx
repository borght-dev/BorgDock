import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RepoMark } from '../RepoMark';

describe('RepoMark', () => {
  it('shows BD for BorgDock and FH for FSP-Horizon', () => {
    const { rerender } = render(<RepoMark repo="BorgDock" />);
    expect(screen.getByText('BD')).toBeInTheDocument();
    rerender(<RepoMark repo="FSP-Horizon" />);
    expect(screen.getByText('FH')).toBeInTheDocument();
  });
});
