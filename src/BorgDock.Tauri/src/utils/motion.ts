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

interface FirstSlot {
  rect: DOMRect;
  /** Position in document order before `mutate`; decides who may slide. */
  index: number;
}

function measure(container: HTMLElement, selector: string): Map<string, FirstSlot> {
  const slots = new Map<string, FirstSlot>();
  let index = 0;
  for (const el of container.querySelectorAll(selector)) {
    const key = keyOf(el);
    if (key !== null) slots.set(key, { rect: el.getBoundingClientRect(), index: index++ });
  }
  return slots;
}

/**
 * The largest set of survivors whose document order is the same before and
 * after `mutate` (a longest increasing subsequence of their old indexes, taken
 * in new order). Those rows can slide without ever crossing each other: when
 * two rows keep their order at both ends, a linear interpolation of their
 * positions keeps it at every frame. Every other survivor would have to pass
 * through a neighbour, so it fades in at its new slot instead.
 */
function orderKeepers(oldIndexesInNewOrder: number[]): Set<number> {
  const n = oldIndexesInNewOrder.length;
  const tailIndex: number[] = []; // index (into the input) of the smallest tail of each LIS length
  const prev = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const value = oldIndexesInNewOrder[i] ?? 0;
    let lo = 0;
    let hi = tailIndex.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((oldIndexesInNewOrder[tailIndex[mid] ?? 0] ?? 0) < value) lo = mid + 1;
      else hi = mid;
    }
    prev[i] = lo > 0 ? (tailIndex[lo - 1] ?? -1) : -1;
    tailIndex[lo] = i;
  }
  const keep = new Set<number>();
  let at = tailIndex.length > 0 ? (tailIndex[tailIndex.length - 1] ?? -1) : -1;
  while (at !== -1) {
    keep.add(at);
    at = prev[at] ?? -1;
  }
  return keep;
}

/** First, mutate, last, invert, play — for the rows that survive `mutate`. */
/** The area a sliding row sweeps: the box around where it was and where it ends. */
function union(a: DOMRect, b: DOMRect): DOMRect {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  const right = Math.max(a.right, b.right);
  const bottom = Math.max(a.bottom, b.bottom);
  return new DOMRect(left, top, right - left, bottom - top);
}

function intersects(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function play(container: HTMLElement, mutate: () => void, selector: string): Animation[] {
  // "First" includes any transform still in flight, so an interrupted
  // reorder continues from where the row is on screen.
  const before = measure(container, selector);
  mutate();

  const duration = motionMs('--motion-move', 320);
  const fadeDuration = motionMs('--motion-base', 260);
  const animations: Animation[] = [];

  // Choreography (plan section 4): rows that keep their relative order slide;
  // rows that would cross a neighbour, and rows that are new, fade in at
  // their final slot once the slides have finished. Nothing overlaps.
  const rows = [...container.querySelectorAll<HTMLElement>(selector)].filter(
    (el) => typeof el.animate === 'function' && keyOf(el) !== null,
  );
  const survivors = rows.filter((el) => before.has(keyOf(el) as string));
  // When most of the list is new it is a different list, not a reorder: the
  // few survivors would sweep across everything that is appearing. Fade the
  // whole list in at once instead of sliding anything.
  if (rows.length - survivors.length > survivors.length) {
    for (const el of rows) {
      cancelRunning(el);
      animations.push(
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fadeDuration, easing: EASE_OUT }),
      );
    }
    return animations;
  }
  const keepers = orderKeepers(
    survivors.map((el) => (before.get(keyOf(el) as string) as FirstSlot).index),
  );
  const sliders = new Set(survivors.filter((_, i) => keepers.has(i)));

  const moves: Array<{ el: HTMLElement; dx: number; dy: number; path: DOMRect }> = [];
  const faders: HTMLElement[] = [];
  for (const el of rows) {
    // Drop an earlier FLIP (or a leave fade React kept the node for) so
    // "last" is the resting position, not a mid-animation one.
    cancelRunning(el);
    if (!sliders.has(el)) {
      faders.push(el);
      continue;
    }
    const first = (before.get(keyOf(el) as string) as FirstSlot).rect;
    const last = el.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (dx !== 0 || dy !== 0) moves.push({ el, dx, dy, path: union(first, last) });
  }

  for (const { el, dx, dy } of moves) {
    animations.push(
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
        duration,
        easing: EASE_STD,
      }),
    );
  }
  // A newcomer (or crossing row) whose slot lies on a slider's path appears
  // after the slides, so nothing is ever drawn over it; the others appear at
  // once. `fill: 'backwards'` keeps a delayed row invisible until its turn.
  for (const el of faders) {
    const slot = el.getBoundingClientRect();
    const crossed = moves.some(({ path }) => intersects(path, slot));
    animations.push(
      el.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: fadeDuration,
        delay: crossed ? duration : 0,
        easing: EASE_OUT,
        fill: 'backwards',
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

/**
 * Lists longer than this skip FLIP and just change, the same way a virtualized
 * list crossfades instead: measuring and animating hundreds of rows on every
 * keystroke costs more than the motion is worth.
 */
export const FLIP_MAX_ROWS = 150;

/**
 * `flip` for a list whose rows can number in the hundreds (palette results).
 * When the list holds more than `maxRows` rows before the change it neither
 * measures nor animates: it runs `plain` (default `mutate`) instead. Pass the
 * bare state update as `plain` so a long list skips the `flushSync` that
 * `mutate` needs for FLIP and React batches the change as usual.
 */
export function flipIfSmall(
  container: HTMLElement | null,
  mutate: () => void,
  options: { selector?: string; maxRows?: number; plain?: () => void } = {},
): Promise<Animation[]> {
  const { selector = DEFAULT_FLIP_SELECTOR, maxRows = FLIP_MAX_ROWS, plain = mutate } = options;
  if (container && container.querySelectorAll(selector).length > maxRows) {
    plain();
    return Promise.resolve([]);
  }
  return flip(container, mutate, selector);
}

interface ViewTransitionLike {
  updateCallbackDone: Promise<void>;
  ready?: Promise<void>;
  finished: Promise<void>;
}

type StartViewTransition = (callback: () => void | Promise<void>) => ViewTransitionLike;

export interface ViewTransitionOptions {
  /**
   * Runs once the transition is over: after its animations (or when it was
   * skipped), or right after `fn` when no transition ran. Use it to undo
   * state set up for the transition, e.g. a direction attribute on <html>.
   */
  onFinished?: () => void;
}

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
export function withViewTransition(
  fn: () => void | Promise<void>,
  options: ViewTransitionOptions = {},
): Promise<void> {
  const start =
    typeof document === 'undefined'
      ? undefined
      : (document as unknown as { startViewTransition?: StartViewTransition }).startViewTransition;

  if (typeof start !== 'function' || !motionOK()) {
    const done = new Promise<void>((resolve) => resolve(fn()));
    done.then(
      () => options.onFinished?.(),
      () => options.onFinished?.(),
    );
    return done;
  }

  const transition = start.call(document, fn);
  transition.ready?.catch(() => undefined);
  transition.finished.catch(() => undefined).then(() => options.onFinished?.());
  return transition.updateCallbackDone;
}
