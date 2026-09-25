import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SlidingHighlight } from '../SlidingHighlight';

const WIDTH: Record<string, number> = { all: 60, mine: 70, failing: 80, 'needs-you': 90 };

/**
 * Fake flex-row layout: every `[data-highlight-key]` item sits right after
 * the items before it in DOM order, so inserting a sibling shifts the rest.
 */
function mockLayout() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const key = this.getAttribute('data-highlight-key');
    let left = 0;
    let width = 300;
    if (key !== null) {
      width = WIDTH[key] ?? 50;
      const items = this.parentElement?.querySelectorAll<HTMLElement>('[data-highlight-key]') ?? [];
      for (const item of items) {
        if (item === this) break;
        left += WIDTH[item.getAttribute('data-highlight-key') ?? ''] ?? 50;
      }
    }
    return {
      left,
      top: 0,
      right: left + width,
      bottom: 24,
      width,
      height: 24,
      x: left,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

function Items({
  active,
  keys = ['all', 'mine', 'failing'],
}: {
  active: string | null;
  keys?: string[];
}) {
  return (
    <SlidingHighlight activeKey={active}>
      {keys.map((key) => (
        <button key={key} type="button" data-highlight-key={key}>
          {key}
        </button>
      ))}
    </SlidingHighlight>
  );
}

function highlight(container: HTMLElement) {
  const hl = container.querySelector<HTMLElement>('.bd-slide__hl');
  if (!hl) throw new Error('highlight not rendered');
  return hl;
}

describe('SlidingHighlight', () => {
  beforeEach(mockLayout);
  afterEach(() => vi.restoreAllMocks());

  it('places the highlight over the active item without animating the first placement', () => {
    const { container } = render(<Items active="mine" />);
    const hl = highlight(container);
    expect(hl.style.transform).toBe('translate(60px, 0px)');
    expect(hl.style.width).toBe('70px');
    expect(hl.style.height).toBe('24px');
    expect(hl).toHaveAttribute('aria-hidden', 'true');
    expect(hl).toHaveClass('bd-slide__hl--instant');
    expect(hl).not.toHaveClass('bd-slide__hl--hidden');
  });

  it('turns the transition on after the first placement', async () => {
    const { container } = render(<Items active="mine" />);
    await waitFor(() => expect(highlight(container)).not.toHaveClass('bd-slide__hl--instant'));
  });

  it('moves the highlight when the active key changes', () => {
    const { container, rerender } = render(<Items active="all" />);
    rerender(<Items active="failing" />);
    const hl = highlight(container);
    expect(hl.style.transform).toBe('translate(130px, 0px)');
    expect(hl.style.width).toBe('80px');
  });

  it('hides the highlight when no item matches', () => {
    const { container } = render(<Items active={null} />);
    expect(highlight(container)).toHaveClass('bd-slide__hl--hidden');
  });

  it('stays hidden until the matching item mounts, then appears in place', async () => {
    const { container, rerender } = render(<Items active="failing" keys={['all', 'mine']} />);
    expect(highlight(container)).toHaveClass('bd-slide__hl--hidden');

    // Same activeKey, so only the MutationObserver can notice the new item.
    rerender(<Items active="failing" keys={['all', 'mine', 'failing']} />);

    await waitFor(() => expect(highlight(container)).not.toHaveClass('bd-slide__hl--hidden'));
    const hl = highlight(container);
    expect(hl.style.transform).toBe('translate(130px, 0px)');
    expect(hl.style.width).toBe('80px');
    expect(hl).toHaveClass('bd-slide__hl--instant');
  });

  it('reappears in place, without sliding, after its item unmounts and remounts', async () => {
    const { container, rerender } = render(<Items active="mine" />);
    await waitFor(() => expect(highlight(container)).not.toHaveClass('bd-slide__hl--instant'));

    rerender(<Items active="mine" keys={['all', 'failing']} />);
    await waitFor(() => expect(highlight(container)).toHaveClass('bd-slide__hl--hidden'));

    rerender(<Items active="mine" keys={['all', 'failing', 'mine']} />);
    await waitFor(() => expect(highlight(container)).not.toHaveClass('bd-slide__hl--hidden'));
    expect(highlight(container)).toHaveClass('bd-slide__hl--instant');
    expect(highlight(container).style.transform).toBe('translate(140px, 0px)');
  });

  it('follows the active item when a sibling is inserted before it', async () => {
    const { container, rerender } = render(<Items active="mine" keys={['all', 'mine']} />);
    expect(highlight(container).style.transform).toBe('translate(60px, 0px)');

    rerender(<Items active="mine" keys={['all', 'needs-you', 'mine']} />);

    await waitFor(() => expect(highlight(container).style.transform).toBe('translate(150px, 0px)'));
    expect(highlight(container).style.width).toBe('70px');
  });

  it('underline variant only sets width and horizontal offset', () => {
    const { container } = render(
      <SlidingHighlight activeKey="mine" variant="underline">
        <button type="button" data-highlight-key="all">
          All
        </button>
        <button type="button" data-highlight-key="mine">
          Mine
        </button>
      </SlidingHighlight>,
    );
    const hl = highlight(container);
    expect(hl).toHaveClass('bd-slide__hl--underline');
    expect(hl.style.transform).toBe('translateX(60px)');
    expect(hl.style.height).toBe('');
  });

  it('measures on change only, never per frame (no layout reads while idle or re-rendered)', async () => {
    const rect = vi.mocked(HTMLElement.prototype.getBoundingClientRect);
    const { container, rerender } = render(<Items active="mine" />);
    // Settle: the one-frame instant placement flips off.
    await waitFor(() => expect(highlight(container)).not.toHaveClass('bd-slide__hl--instant'));
    const settled = rect.mock.calls.length;
    expect(settled).toBeGreaterThan(0);

    // Twenty animation frames of nothing happening read no layout.
    for (let i = 0; i < 20; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    expect(rect.mock.calls.length).toBe(settled);

    // A parent re-render with the same active key does not measure either.
    rerender(<Items active="mine" />);
    rerender(<Items active="mine" />);
    expect(rect.mock.calls.length).toBe(settled);

    // A real change measures once more (container and the active item).
    rerender(<Items active="failing" />);
    expect(rect.mock.calls.length).toBeGreaterThan(settled);
    expect(rect.mock.calls.length - settled).toBeLessThanOrEqual(2);
  });
});
