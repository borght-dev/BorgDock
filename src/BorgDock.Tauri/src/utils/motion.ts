/**
 * Motion helpers for the Workbench UI (plans/ui-overhaul-workbench.md, section 4).
 *
 * The CSS side lives in src/styles/motion.css. These helpers read the same two
 * reduced-motion signals — the OS preference and the `.reduce-motion` class the
 * Appearance setting puts on <html> — so FLIP and View Transitions collapse to
 * an instant change exactly when the CSS transitions do.
 */

const REDUCE_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
export const REDUCE_MOTION_CLASS = 'reduce-motion';

/** True when animations are allowed: neither the OS nor the app setting asks for reduced motion. */
export function motionOK(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.classList.contains(REDUCE_MOTION_CLASS)) return false;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    if (window.matchMedia(REDUCE_MOTION_QUERY).matches) return false;
  }
  return true;
}

/**
 * Reads a `--motion-*` token from <html> in milliseconds. Falls back when the
 * stylesheet is not loaded (unit tests) or the value does not parse.
 */
export function motionMs(token: string, fallback: number): number {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (!raw) return fallback;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  return raw.endsWith('ms') ? value : raw.endsWith('s') ? value * 1000 : value;
}

/** Easing curves matching the CSS tokens, for the Web Animations API. */
export const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
export const EASE_STD = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
export const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';

const DEFAULT_FLIP_SELECTOR = '[data-key]';

/** Rows that leave a list fade out over this long before the list changes (plan section 4). */
export const FLIP_LEAVE_MS = 140;

export interface FlipOptions {
  /**
   * `data-key`s of the rows that `mutate` will remove. They fade out over
   * `FLIP_LEAVE_MS` first; `mutate` runs once the fade has finished.
   */
  leaving?: Iterable<string>;
}

function keyOf(el: Element): string | null {
  return el.getAttribute('data-key');
}

function cancelRunning(el: HTMLElement) {
  if (typeof el.getAnimations !== 'function') return;
  for (const animation of el.getAnimations()) animation.cancel();
}

function measure(container: HTMLElement, selector: string): Map<string, DOMRect> {
  const rects = new Map<string, DOMRect>();
  for (const el of container.querySelectorAll(selector)) {
    const key = keyOf(el);
    if (key !== null) rects.set(key, el.getBoundingClientRect());
  }
  return rects;
}

/** First, mutate, last, invert, play — for the rows that survive `mutate`. */
function play(container: HTMLElement, mutate: () => void, selector: string): Animation[] {
  // "First" includes any transform still in flight, so an interrupted
  // reorder continues from where the row is on screen.
  const before = measure(container, selector);
  mutate();

  const duration = motionMs('--motion-move', 320);
  const fadeDuration = motionMs('--motion-base', 260);
  const animations: Animation[] = [];

  for (const el of container.querySelectorAll<HTMLElement>(selector)) {
    if (typeof el.animate !== 'function') continue;
    const key = keyOf(el);
    if (key === null) continue;
    // Drop an earlier FLIP (or a leave fade React kept the node for) so
    // "last" is the resting position, not a mid-animation one.
    cancelRunning(el);
    const first = before.get(key);
    if (!first) {
      animations.push(
        el.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: fadeDuration,
          easing: EASE_OUT,
        }),
      );
      continue;
    }
    const last = el.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (dx === 0 && dy === 0) continue;
    animations.push(
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
        duration,
        easing: EASE_STD,
      }),
    );
  }

  return animations;
}

/**
 * FLIP reorder: records where every `selector` child of `container` sits, runs
 * `mutate`, then animates each surviving child from its old slot to its new one
 * and fades in children that were not there before. Children are matched by
 * their `data-key` attribute, never by element identity, so React is free to
 * recreate nodes.
 *
 * Rows listed in `options.leaving` fade out first (`FLIP_LEAVE_MS`); `mutate`
 * runs after that fade. Without leaving rows `mutate` runs before `flip`
 * returns.
 *
 * `mutate` must update the DOM synchronously. For a React state change wrap it
 * in `flushSync`.
 *
 * Resolves to the started animations (empty under reduced motion, when the
 * container is missing, or when nothing moved).
 */
export function flip(
  container: HTMLElement | null,
  mutate: () => void,
  selector: string = DEFAULT_FLIP_SELECTOR,
  options: FlipOptions = {},
): Promise<Animation[]> {
  if (!container || !motionOK()) {
    mutate();
    return Promise.resolve([]);
  }

  const leavingKeys = new Set(options.leaving ?? []);
  const leaving =
    leavingKeys.size === 0
      ? []
      : [...container.querySelectorAll<HTMLElement>(selector)].filter((el) => {
          const key = keyOf(el);
          return key !== null && leavingKeys.has(key) && typeof el.animate === 'function';
        });

  if (leaving.length === 0) {
    return Promise.resolve(play(container, mutate, selector));
  }

  const fades = leaving.map((el) =>
    el.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: FLIP_LEAVE_MS,
      easing: EASE_IN,
      fill: 'forwards',
    }),
  );
  // A cancelled fade rejects `finished`; the list still has to change.
  return Promise.all(fades.map((fade) => fade.finished.catch(() => undefined))).then(() =>
    play(container, mutate, selector),
  );
}

interface ViewTransitionLike {
  updateCallbackDone: Promise<void>;
  ready?: Promise<void>;
  finished: Promise<void>;
}

type StartViewTransition = (callback: () => void | Promise<void>) => ViewTransitionLike;

/**
 * Runs `fn` inside `document.startViewTransition` when the API exists and
 * motion is allowed; otherwise runs it directly (synchronously). Either way
 * the result is a promise that settles once `fn` has updated the DOM and
 * rejects if `fn` throws. A skipped or interrupted transition does not
 * reject: those rejections on `ready` and `finished` are swallowed.
 *
 * Like `flip`, a React state change inside `fn` should be wrapped in
 * `flushSync` so the browser captures the new state.
 */
export function withViewTransition(fn: () => void | Promise<void>): Promise<void> {
  const start =
    typeof document === 'undefined'
      ? undefined
      : (document as unknown as { startViewTransition?: StartViewTransition }).startViewTransition;

  if (typeof start !== 'function' || !motionOK()) {
    return new Promise<void>((resolve) => resolve(fn()));
  }

  const transition = start.call(document, fn);
  transition.ready?.catch(() => undefined);
  transition.finished.catch(() => undefined);
  return transition.updateCallbackDone;
}
