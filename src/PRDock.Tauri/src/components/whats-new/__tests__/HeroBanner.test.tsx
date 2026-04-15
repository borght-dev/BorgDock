import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeroBanner } from '../HeroBanner';

describe('HeroBanner', () => {
  it('renders an <img> when hero.src is provided', () => {
    render(<HeroBanner hero={{ src: '/whats-new/1.0.11/a.png', alt: 'alt' }} kind="new" />);
    const img = screen.getByAltText('alt') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain('/whats-new/1.0.11/a.png');
  });

  it('renders a gradient fallback when hero is null', () => {
    const { container } = render(<HeroBanner hero={null} kind="improved" />);
    expect(container.querySelector('[data-fallback="improved"]')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('falls back to gradient on img onError', () => {
    const { container } = render(
      <HeroBanner hero={{ src: '/whats-new/1.0.11/a.png', alt: 'alt' }} kind="fixed" />,
    );
    const img = container.querySelector('img') as HTMLImageElement;
    img.dispatchEvent(new Event('error'));
    expect(container.querySelector('[data-fallback="fixed"]')).toBeTruthy();
  });
});
