import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusIndicator } from '../StatusIndicator';

afterEach(cleanup);

describe('StatusIndicator', () => {
  it.each(['red', 'yellow', 'green', 'gray'] as const)(
    'renders Dot with tone=%s',
    (status) => {
      const { container } = render(<StatusIndicator status={status} />);
      expect(container.querySelector(`.bd-dot--${status}`)).toBeInTheDocument();
    },
  );

  it('marks yellow as pulsing', () => {
    const { container } = render(<StatusIndicator status="yellow" />);
    const dot = container.querySelector('.bd-dot--yellow') as HTMLElement;
    expect(dot.style.animation).toContain('bd-pulse-dot');
  });

  it('exposes accessible label', () => {
    const { container } = render(<StatusIndicator status="red" />);
    expect(container.querySelector('[aria-label="Status: red"]')).toBeInTheDocument();
  });
});
