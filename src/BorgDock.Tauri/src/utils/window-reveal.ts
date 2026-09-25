/**
 * Tool-window entrance (plans/ui-overhaul-workbench.md, phase 6): a tool
 * window fades and scales in from 0.98 over `--motion-base` when it is
 * revealed. Most tool windows are built invisible and shown by the
 * `window_ready` command, so the entrance runs once that command resolves;
 * until then #root holds the entrance's first frame (`.bd-window-pending`)
 * so the window never shows a full frame and then jumps back to transparent.
 *
 * Under reduced motion nothing is added and the window appears as it is.
 * The CSS lives in styles/motion.css.
 */
import { invoke } from '@tauri-apps/api/core';
import { motionOK } from './motion';

export const WINDOW_ENTER_CLASS = 'bd-window-enter';
export const WINDOW_PENDING_CLASS = 'bd-window-pending';

/** Plays the entrance anyway when `window_ready` never settles. */
const REVEAL_FALLBACK_MS = 1500;

function appRoot(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById('root');
}

/** Plays the entrance on #root, once per window. */
export function playWindowEnter(): void {
  const root = appRoot();
  if (!root) return;
  root.classList.remove(WINDOW_PENDING_CLASS);
  if (root.dataset.windowEntered === 'true' || !motionOK()) return;
  root.dataset.windowEntered = 'true';
  root.classList.add(WINDOW_ENTER_CLASS);
  // Drop the class after its own animation (not a child's, animationend
  // bubbles) so the transform never lingers on the app root.
  const done = (e: AnimationEvent) => {
    if (e.target !== root) return;
    root.classList.remove(WINDOW_ENTER_CLASS);
    root.removeEventListener('animationend', done);
  };
  root.addEventListener('animationend', done);
}

/**
 * Invokes `window_ready` (Rust shows the invisible-built window) and plays the
 * entrance once it settles. A failed or missing command still plays it, so
 * the window never stays transparent.
 */
export function revealWindow(): Promise<void> {
  const root = appRoot();
  if (root && root.dataset.windowEntered !== 'true' && motionOK()) {
    root.classList.add(WINDOW_PENDING_CLASS);
  }
  let pending: unknown;
  try {
    pending = invoke('window_ready');
  } catch (err) {
    pending = Promise.reject(err);
  }
  const fallback = window.setTimeout(playWindowEnter, REVEAL_FALLBACK_MS);
  return Promise.resolve(pending)
    .then(
      () => undefined,
      () => undefined,
    )
    .finally(() => {
      window.clearTimeout(fallback);
      playWindowEnter();
    });
}
