import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CheckBar, checkBarSummary } from '../CheckBar';

function segments(container: HTMLElement) {
  const get = (tone: string) =>
    container.querySelector<HTMLElement>(`.bd-checkbar__seg--${tone}`)?.style.width;
  return { ok: get('ok'), fail: get('fail'), run: get('run') };
}

describe('checkBarSummary', () => {
  it('reports failures first, in red', () => {
    expect(checkBarSummary({ ok: 3, fail: 2, run: 1, total: 6 })).toEqual({
      state: 'fail',
      label: '2 failing',
    });
  });

  it('reports running checks as done of total when nothing failed', () => {
    expect(checkBarSummary({ ok: 9, fail: 0, run: 3, total: 12 })).toEqual({
      state: 'run',
      label: '9 of 12, running',
    });
  });

  it('counts skipped checks as done while others run', () => {
    // 70 passed, 2 skipped, 8 running → 72 of 80 finished.
    expect(checkBarSummary({ ok: 70, fail: 0, run: 8, total: 80 }).label).toBe('72 of 80, running');
  });

  it('reports every check passing', () => {
    expect(checkBarSummary({ ok: 80, fail: 0, run: 0, total: 80 })).toEqual({
      state: 'ok',
      label: '80 passing',
    });
  });

  it('leaves skipped checks out of the passing count', () => {
    // 10 passed, 2 skipped.
    expect(checkBarSummary({ ok: 10, fail: 0, run: 0, total: 12 })).toEqual({
      state: 'ok',
      label: '10 passing',
    });
  });

  it('says there are no checks when total is zero', () => {
    expect(checkBarSummary({ ok: 0, fail: 0, run: 0, total: 0 })).toEqual({
      state: 'none',
      label: 'No checks',
    });
  });
});

describe('CheckBar', () => {
  it('renders the failing label with the fail tone', () => {
    render(<CheckBar ok={4} fail={2} run={0} total={6} data-testid="cb" />);
    const el = screen.getByTestId('cb');
    expect(el).toHaveClass('bd-checkbar', 'bd-checkbar--fail');
    expect(el).toHaveTextContent('2 failing');
  });

  it('renders the running label with the run tone', () => {
    render(<CheckBar ok={4} fail={0} run={2} total={6} data-testid="cb" />);
    const el = screen.getByTestId('cb');
    expect(el).toHaveClass('bd-checkbar--run');
    expect(el).toHaveTextContent('4 of 6, running');
  });

  it('renders the passing label with the ok tone', () => {
    render(<CheckBar ok={6} fail={0} run={0} total={6} data-testid="cb" />);
    const el = screen.getByTestId('cb');
    expect(el).toHaveClass('bd-checkbar--ok');
    expect(el).toHaveTextContent('6 passing');
  });

  it('sizes each segment in proportion to the total', () => {
    const { container } = render(<CheckBar ok={2} fail={1} run={1} total={8} />);
    // Four skipped checks leave half the track empty.
    expect(segments(container)).toEqual({ ok: '25%', fail: '12.5%', run: '12.5%' });
  });

  it('draws empty segments when there are no checks', () => {
    const { container } = render(<CheckBar ok={0} fail={0} run={0} total={0} />);
    expect(segments(container)).toEqual({ ok: '0%', fail: '0%', run: '0%' });
  });

  it('hides the bar from assistive technology and keeps the label readable', () => {
    const { container } = render(<CheckBar ok={1} fail={0} run={0} total={1} />);
    expect(container.querySelector('.bd-checkbar__bar')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('1 passing')).toBeInTheDocument();
  });
});
