import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StateDot } from '../StateDot';

describe('StateDot', () => {
  it.each([
    ['awaiting', 'bd-dot--yellow'],
    ['working', 'bd-dot--violet'],
    ['tool', 'bd-dot--violet'],
    ['finished', 'bd-dot--green'],
    ['idle', 'bd-dot--gray'],
    ['ended', 'bd-dot--gray'],
  ] as const)('renders %s with class %s', (state, cls) => {
    const { container } = render(<StateDot state={state} />);
    expect(container.querySelector(`.${cls}`)).toBeTruthy();
  });

  it('applies pulse animation only for awaiting', () => {
    const { container } = render(<StateDot state="awaiting" />);
    const span = container.querySelector('.bd-dot') as HTMLSpanElement;
    expect(span.style.animation).toContain('bd-pulse-halo');
  });
});
