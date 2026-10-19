import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PrDescription } from '../PrDescription';

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));

describe('PR description', () => {
  it('shows the full description and proof images without expanding', () => {
    render(
      <PrDescription
        body={
          '## Summary\n\nFirst paragraph.\n\nSecond paragraph.\n\n## Verification\n\n![After](https://example.com/after.png)'
        }
      />,
    );
    expect(screen.getByRole('heading', { name: 'Verification' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'After' })).toHaveAttribute(
      'src',
      'https://example.com/after.png',
    );
    expect(screen.queryByRole('button', { name: 'Read full description' })).not.toBeInTheDocument();
  });

  it('renders HTML proof images and provides a fallback when an image fails', () => {
    render(
      <PrDescription body={'<img src="https://example.com/proof.png" alt="Browser proof">'} />,
    );
    fireEvent.error(screen.getByRole('img', { name: 'Browser proof' }));
    expect(
      screen.getByRole('button', { name: 'Open image in browser: Browser proof' }),
    ).toHaveTextContent('Image could not load. Open image in browser.');
  });

  it('sanitizes raw HTML while retaining disclosure sections', () => {
    const { container } = render(
      <PrDescription
        body={
          '<details><summary>Full size</summary><img src="https://example.com/proof.png" onerror="alert(1)"></details><script>alert(1)</script>'
        }
      />,
    );
    expect(container.querySelector('details summary')).toHaveTextContent('Full size');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).not.toHaveAttribute('onerror');
  });
});
