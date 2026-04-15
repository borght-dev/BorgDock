import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Highlight } from '@/types/whats-new';
import { HighlightCard } from '../HighlightCard';

const base: Highlight = {
  kind: 'new',
  title: 'Close PRs',
  description: 'Stop hopping to the browser.',
  hero: null,
  keyboard: null,
};

describe('HighlightCard', () => {
  it('renders the title, description, and kind badge', () => {
    render(<HighlightCard highlight={base} />);
    expect(screen.getByText('Close PRs')).toBeTruthy();
    expect(screen.getByText(/stop hopping/i)).toBeTruthy();
    expect(screen.getByText('New')).toBeTruthy();
  });

  it('renders the keyboard chip when present', () => {
    render(<HighlightCard highlight={{ ...base, keyboard: 'Ctrl+Shift+W' }} />);
    expect(screen.getByText('Ctrl+Shift+W')).toBeTruthy();
  });

  it('labels the kind badge as "Improved" for improved', () => {
    render(<HighlightCard highlight={{ ...base, kind: 'improved' }} />);
    expect(screen.getByText('Improved')).toBeTruthy();
  });

  it('labels the kind badge as "Fixed" for fixed', () => {
    render(<HighlightCard highlight={{ ...base, kind: 'fixed' }} />);
    expect(screen.getByText('Fixed')).toBeTruthy();
  });
});
