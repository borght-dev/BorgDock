import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FLIP_LEAVE_MS,
  flip,
  flipIfSmall,
  motionMs,
  motionOK,
  withViewTransition,
} from '../motion';

function mockReducedMotionQuery(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

function rect(top: number, left = 0): DOMRect {
  return {
    top,
    left,
    bottom: top + 20,
    right: left + 100,
    width: 100,
    height: 20,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/**
 * Builds a list whose rows report positions from `positions`, keyed by
 * data-key. Tests change `positions` inside `mutate` to simulate a reorder.
 */
function buildList(keys: string[], positions: Map<string, DOMRect>) {
  const container = document.createElement('div');
  const animate = vi.fn(
    () => ({ finished: Promise.resolve(), cancel: vi.fn() }) as unknown as Animation,
  );
  const addRow = (key: string) => {
    const row = document.createElement('div');
    row.setAttribute('data-key', key);
    row.getBoundingClientRect = () => positions.get(key) ?? rect(0);
    (row as unknown as { animate: typeof animate }).animate = animate;
    container.appendChild(row);
    return row;
  };
  for (const key of keys) addRow(key);
  document.body.appendChild(container);
  return { container, animate, addRow };
}

describe('motionOK', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('reduce-motion');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.classList.remove('reduce-motion');
  });

  it('allows motion when neither signal asks for reduction', () => {
    mockReducedMotionQuery(false);
    expect(motionOK()).toBe(true);
  });

  it('blocks motion when the OS prefers reduced motion', () => {
    mockReducedMotionQuery(true);
    expect(motionOK()).toBe(false);
  });

  it('blocks motion when <html> carries the reduce-motion class', () => {
    mockReducedMotionQuery(false);
    document.documentElement.classList.add('reduce-motion');
    expect(motionOK()).toBe(false);
  });
});

describe('motionMs', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--motion-move');
  });

  it('falls back when the token is not defined', () => {
    expect(motionMs('--motion-move', 320)).toBe(320);
  });

  it('parses ms and s values', () => {
    document.documentElement.style.setProperty('--motion-move', '0.01ms');
    expect(motionMs('--motion-move', 320)).toBe(0.01);
    document.documentElement.style.setProperty('--motion-move', '0.5s');
    expect(motionMs('--motion-move', 320)).toBe(500);
  });
});

describe('flip', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('reduce-motion');
    mockReducedMotionQuery(false);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    document.documentElement.classList.remove('reduce-motion');
  });

  it('runs mutate and animates nothing when nothing moved', async () => {
    const positions = new Map([
      ['a', rect(0)],
      ['b', rect(20)],
    ]);
    const { container, animate } = buildList(['a', 'b'], positions);
    const mutate = vi.fn();

    const result = flip(container, mutate);

    // Without leaving rows the list changes before flip returns.
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(animate).not.toHaveBeenCalled();
    expect(await result).toEqual([]);
  });

  it('animates rows that moved from their old slot to the new one', async () => {
    const positions = new Map([
      ['a', rect(0)],
      ['b', rect(20)],
    ]);
    const { container, animate } = buildList(['a', 'b'], positions);

    const result = await flip(container, () => {
      positions.set('a', rect(20));
      positions.set('b', rect(0));
    });

    expect(result).toHaveLength(2);
    expect(animate).toHaveBeenCalledTimes(2);
    const [keyframes, options] = animate.mock.calls[0] as unknown as [
      Keyframe[],
      KeyframeAnimationOptions,
    ];
    // Row "a" moved down 20px, so it starts 20px up and slides to 0.
    expect(keyframes[0]).toEqual({ transform: 'translate(0px, -20px)' });
    expect(keyframes[1]).toEqual({ transform: 'translate(0, 0)' });
    expect(options.duration).toBe(300);
  });

  it('fades in rows that were not there before', () => {
    const positions = new Map([['a', rect(0)]]);
    const { container, animate, addRow } = buildList(['a'], positions);

    flip(container, () => {
      positions.set('b', rect(20));
      addRow('b');
    });

    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes] = animate.mock.calls[0] as unknown as [Keyframe[]];
    expect(keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  });

  it('only measures elements that match the selector', () => {
    const positions = new Map([
      ['a', rect(0)],
      ['b', rect(20)],
    ]);
    const { container, animate } = buildList(['a', 'b'], positions);
    container.querySelector('[data-key="a"]')?.classList.add('row');

    flip(
      container,
      () => {
        positions.set('a', rect(20));
        positions.set('b', rect(0));
      },
      '.row',
    );

    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('fades a row that would cross its neighbours instead of sliding it', async () => {
    // a, b, c → b, c, a: b and c keep their order (they slide up); a would
    // have to pass through both, so it fades in at its new slot.
    const positions = new Map([
      ['a', rect(0)],
      ['b', rect(20)],
      ['c', rect(40)],
    ]);
    const { container, animate } = buildList(['a', 'b', 'c'], positions);
    const a = container.querySelector('[data-key="a"]') as HTMLElement;

    await flip(container, () => {
      container.appendChild(a);
      positions.set('b', rect(0));
      positions.set('c', rect(20));
      positions.set('a', rect(40));
    });

    const calls = animate.mock.calls as unknown as Array<[Keyframe[], KeyframeAnimationOptions]>;
    const slides = calls.filter(([k]) => 'transform' in (k[0] ?? {}));
    const fades = calls.filter(([k]) => 'opacity' in (k[0] ?? {}));
    expect(slides).toHaveLength(2);
    expect(fades).toHaveLength(1);
    // The crossing row waits until the slides have mostly cleared its slot.
    expect(fades[0]?.[1]?.delay).toBe(150);
    expect(fades[0]?.[1]?.fill).toBe('backwards');
  });

  it('shows newcomers at once when nothing slides', () => {
    const positions = new Map([['a', rect(0)]]);
    const { container, animate, addRow } = buildList(['a'], positions);

    flip(container, () => {
      positions.set('b', rect(20));
      addRow('b');
    });

    const options = (animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions])[1];
    expect(options.delay).toBe(0);
  });

  it('delays newcomers until the surviving rows have mostly slid into place', () => {
    const positions = new Map([
      ['a', rect(0)],
      ['b', rect(20)],
    ]);
    const { container, animate, addRow } = buildList(['a', 'b'], positions);
    const b = container.querySelector('[data-key="b"]') as HTMLElement;

    flip(container, () => {
      // A new heading appears above b and pushes it down.
      positions.set('b', rect(40));
      const heading = addRow('h');
      container.insertBefore(heading, b);
      positions.set('h', rect(20));
    });

    const calls = animate.mock.calls as unknown as Array<[Keyframe[], KeyframeAnimationOptions]>;
    const fade = calls.find(([k]) => 'opacity' in (k[0] ?? {}));
    const slide = calls.find(([k]) => 'transform' in (k[0] ?? {}));
    expect(slide).toBeDefined();
    expect(fade?.[1]?.delay).toBe(150);
  });

  it('does not delay a newcomer that no slider passes over', () => {
    const positions = new Map([
      ['a', rect(0)],
      ['b', rect(20)],
    ]);
    const { container, animate, addRow } = buildList(['a', 'b'], positions);

    flip(container, () => {
      // a leaves, b slides up into a's slot; c appears far below, off b's path.
      container.querySelector('[data-key="a"]')?.remove();
      positions.set('b', rect(0));
      addRow('c');
      positions.set('c', rect(200));
    });

    const calls = animate.mock.calls as unknown as Array<[Keyframe[], KeyframeAnimationOptions]>;
    const fade = calls.find(([k]) => 'opacity' in (k[0] ?? {}));
    expect(fade?.[1]?.delay).toBe(0);
  });

  it('crossfades instead of sliding when newcomers outnumber survivors', () => {
    const positions = new Map([['a', rect(0)]]);
    const { container, animate, addRow } = buildList(['a'], positions);

    flip(container, () => {
      // a slides far down while three new rows appear above it.
      for (const [key, top] of [
        ['b', 0],
        ['c', 20],
        ['d', 40],
      ] as const) {
        const row = addRow(key);
        container.insertBefore(row, container.firstChild);
        positions.set(key, rect(top));
      }
      positions.set('a', rect(60));
    });

    const calls = animate.mock.calls as unknown as Array<[Keyframe[], KeyframeAnimationOptions]>;
    expect(calls).toHaveLength(4);
    expect(calls.every(([k]) => 'opacity' in (k[0] ?? {}))).toBe(true);
    expect(calls.every(([, o]) => !o.delay)).toBe(true);
  });

  it('is a no-op under reduced motion but still mutates', async () => {
    document.documentElement.classList.add('reduce-motion');
    const positions = new Map([
      ['a', rect(0)],
      ['b', rect(20)],
    ]);
    const { container, animate } = buildList(['a', 'b'], positions);
    const mutate = vi.fn(() => {
      positions.set('a', rect(20));
      positions.set('b', rect(0));
    });

    const result = flip(container, mutate, '[data-key]', { leaving: ['b'] });

    // Reduced motion skips the leave fade too: the list changes at once.
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(animate).not.toHaveBeenCalled();
    expect(await result).toEqual([]);
  });

  it('still mutates when the container is missing', async () => {
    const mutate = vi.fn();
    expect(await flip(null, mutate)).toEqual([]);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('cancels running animations before measuring the final positions', async () => {
    const positions = new Map([
      ['a', rect(0)],
      ['b', rect(20)],
    ]);
    const { container } = buildList(['a', 'b'], positions);
    const running = { cancel: vi.fn() };
    for (const row of container.querySelectorAll<HTMLElement>('[data-key]')) {
      (row as unknown as { getAnimations: () => unknown[] }).getAnimations = () => [running];
    }

    await flip(container, () => {
      positions.set('a', rect(20));
      positions.set('b', rect(0));
    });

    expect(running.cancel).toHaveBeenCalledTimes(2);
  });

  it('fades leaving rows out before mutating, then FLIPs the survivors', async () => {
    const positions = new Map([
      ['a', rect(0)],
      ['b', rect(20)],
      ['c', rect(40)],
    ]);
    const { container, animate } = buildList(['a', 'b', 'c'], positions);
    const leavingRow = container.querySelector('[data-key="b"]');
    const mutate = vi.fn(() => {
      leavingRow?.remove();
      positions.set('c', rect(20));
    });

    const result = flip(container, mutate, '[data-key]', { leaving: ['b'] });

    // The fade has started; the list has not changed yet.
    expect(mutate).not.toHaveBeenCalled();
    expect(animate).toHaveBeenCalledTimes(1);
    const [fadeFrames, fadeOptions] = animate.mock.calls[0] as unknown as [
      Keyframe[],
      KeyframeAnimationOptions,
    ];
    expect(fadeFrames).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(fadeOptions.duration).toBe(FLIP_LEAVE_MS);

    const played = await result;

    expect(mutate).toHaveBeenCalledTimes(1);
    // Only "c" moved (from 40 to 20).
    expect(played).toHaveLength(1);
    const [moveFrames] = animate.mock.calls[1] as unknown as [Keyframe[]];
    expect(moveFrames[0]).toEqual({ transform: 'translate(0px, 20px)' });
  });

  it('still mutates when a leave fade is cancelled', async () => {
    const positions = new Map([
      ['a', rect(0)],
      ['b', rect(20)],
    ]);
    const { container, animate } = buildList(['a', 'b'], positions);
    animate.mockImplementationOnce(
      () =>
        ({
          finished: Promise.reject(new DOMException('cancelled', 'AbortError')),
          cancel: vi.fn(),
        }) as unknown as Animation,
    );
    const mutate = vi.fn();

    await flip(container, mutate, '[data-key]', { leaving: ['a'] });

    expect(mutate).toHaveBeenCalledTimes(1);
  });
});

describe('withViewTransition', () => {
  const doc = document as unknown as { startViewTransition?: unknown };

  beforeEach(() => {
    document.documentElement.classList.remove('reduce-motion');
    mockReducedMotionQuery(false);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete doc.startViewTransition;
    document.documentElement.classList.remove('reduce-motion');
  });

  it('runs fn directly when the API is missing', async () => {
    const fn = vi.fn();
    const done = withViewTransition(fn);
    // Runs synchronously so callers see the new state immediately.
    expect(fn).toHaveBeenCalledTimes(1);
    await done;
  });

  it('uses startViewTransition when available and motion is allowed', async () => {
    const start = vi.fn((cb: () => void) => {
      cb();
      return { updateCallbackDone: Promise.resolve(), finished: Promise.resolve() };
    });
    doc.startViewTransition = start;
    const fn = vi.fn();

    await withViewTransition(fn);

    expect(start).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns a rejected promise instead of throwing when fn throws', async () => {
    const boom = new Error('boom');
    let result: Promise<void> | undefined;
    expect(() => {
      result = withViewTransition(() => {
        throw boom;
      });
    }).not.toThrow();
    await expect(result).rejects.toBe(boom);
  });

  it('swallows rejections from a skipped transition', async () => {
    const skipped = () => Promise.reject(new DOMException('skipped', 'AbortError'));
    doc.startViewTransition = vi.fn((cb: () => void) => {
      cb();
      return { updateCallbackDone: Promise.resolve(), ready: skipped(), finished: skipped() };
    });

    await expect(withViewTransition(vi.fn())).resolves.toBeUndefined();
    // Let the swallowed rejections settle; vitest fails the run on unhandled ones.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('calls onFinished after the transition finishes, not before', async () => {
    let finish: () => void = () => {};
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    doc.startViewTransition = vi.fn((cb: () => void) => {
      cb();
      return { updateCallbackDone: Promise.resolve(), finished };
    });
    const onFinished = vi.fn();

    await withViewTransition(vi.fn(), { onFinished });
    expect(onFinished).not.toHaveBeenCalled();

    finish();
    await finished;
    await Promise.resolve();
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('calls onFinished for a skipped transition', async () => {
    const skipped = () => Promise.reject(new DOMException('skipped', 'AbortError'));
    doc.startViewTransition = vi.fn((cb: () => void) => {
      cb();
      return { updateCallbackDone: Promise.resolve(), ready: skipped(), finished: skipped() };
    });
    const onFinished = vi.fn();
    await withViewTransition(vi.fn(), { onFinished });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('calls onFinished right after fn when no transition runs, even if fn throws', async () => {
    const onFinished = vi.fn();
    await withViewTransition(vi.fn(), { onFinished });
    expect(onFinished).toHaveBeenCalledTimes(1);

    const failed = withViewTransition(
      () => {
        throw new Error('boom');
      },
      { onFinished },
    );
    await expect(failed).rejects.toThrow('boom');
    await Promise.resolve();
    expect(onFinished).toHaveBeenCalledTimes(2);
  });

  it('skips the transition under reduced motion', async () => {
    const start = vi.fn();
    doc.startViewTransition = start;
    document.documentElement.classList.add('reduce-motion');
    const fn = vi.fn();

    await withViewTransition(fn);

    expect(start).not.toHaveBeenCalled();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('flipIfSmall', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('reduce-motion');
    mockReducedMotionQuery(false);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('animates a short list like flip', async () => {
    const positions = new Map([
      ['a', rect(0)],
      ['b', rect(20)],
    ]);
    const { container, animate } = buildList(['a', 'b'], positions);
    await flipIfSmall(container, () => {
      positions.set('a', rect(20));
      positions.set('b', rect(0));
    });
    expect(animate).toHaveBeenCalledTimes(2);
  });

  it('changes a long list without measuring or animating', async () => {
    const positions = new Map([
      ['a', rect(0)],
      ['b', rect(20)],
      ['c', rect(40)],
    ]);
    const { container, animate } = buildList(['a', 'b', 'c'], positions);
    const mutate = vi.fn();
    const plain = vi.fn(() => {
      positions.set('a', rect(40));
      positions.set('c', rect(0));
    });
    expect(await flipIfSmall(container, mutate, { maxRows: 2, plain })).toEqual([]);
    // The long list takes the plain update, not the flushSync one.
    expect(plain).toHaveBeenCalledTimes(1);
    expect(mutate).not.toHaveBeenCalled();
    expect(animate).not.toHaveBeenCalled();
  });
});
