// .storybook/anim-cursor.ts
//
// Synthetic cursor + click-ripple helpers for animation stories. Storybook's
// play function exercises the UI via @testing-library/userEvent, which fires
// real DOM events but never moves a visible cursor. Without something to
// follow, the resulting GIFs read like the UI animates itself for no reason.
//
// installCursor() injects a position:fixed SVG arrow into the document body.
// moveCursorTo(el) tweens the cursor to the element's center. clickRipple(el)
// emits a brief radial pulse at the element's center to visually confirm a
// click landed.
//
// Usage in a story play function:
//
//   import { installCursor, moveCursorTo, clickRipple } from '../../../.storybook/anim-cursor';
//
//   play: async ({ canvasElement }) => {
//     installCursor();
//     const card = await within(canvasElement).findByText(/storybook phase 12/i);
//     await moveCursorTo(card, 600);
//     clickRipple(card);
//     await userEvent.click(card);
//     await pause(800);
//   }
//
// Removed automatically when the iframe unloads — no per-story teardown needed
// since each Storybook story navigation is a fresh page.

const CURSOR_ID = '__borgdock_anim_cursor';
const CURSOR_SVG = `
<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">
  <path d="M3 2 L3 16 L7.4 12.4 L9.7 16.8 L11.6 15.7 L9.4 11.4 L15 11 Z"
        fill="#1a1a2e" stroke="#fff" stroke-width="1.4" stroke-linejoin="round" />
</svg>
`;

const RIPPLE_KEYFRAME_ID = '__borgdock_anim_ripple_kf';

function ensureRippleKeyframes(): void {
  if (document.getElementById(RIPPLE_KEYFRAME_ID)) return;
  const style = document.createElement('style');
  style.id = RIPPLE_KEYFRAME_ID;
  style.textContent = `
    @keyframes __borgdock_anim_ripple {
      0%   { transform: translate(-50%, -50%) scale(0.55); opacity: 0.85; }
      100% { transform: translate(-50%, -50%) scale(2.4); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

export function installCursor(initialX = -100, initialY = -100): HTMLElement {
  const existing = document.getElementById(CURSOR_ID);
  if (existing) return existing;
  const cursor = document.createElement('div');
  cursor.id = CURSOR_ID;
  cursor.innerHTML = CURSOR_SVG;
  cursor.style.cssText = [
    'position: fixed',
    `top: ${initialY}px`,
    `left: ${initialX}px`,
    'pointer-events: none',
    'z-index: 99999',
    'transform: translate(-2px, -2px)',
    'transition: top 600ms cubic-bezier(0.2, 0.8, 0.2, 1), left 600ms cubic-bezier(0.2, 0.8, 0.2, 1)',
    'filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.35))',
  ].join('; ');
  document.body.appendChild(cursor);
  ensureRippleKeyframes();
  return cursor;
}

function rectCenter(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export async function moveCursorTo(target: Element, durationMs = 600): Promise<void> {
  const cursor = installCursor();
  const { x, y } = rectCenter(target);
  // Match the transition duration set on installCursor; if a caller wants a
  // different timing, they can update transitionDuration before calling.
  cursor.style.transitionDuration = `${durationMs}ms`;
  cursor.style.left = `${x}px`;
  cursor.style.top = `${y}px`;
  await new Promise((resolve) => setTimeout(resolve, durationMs + 40));
}

export function clickRipple(target: Element): void {
  ensureRippleKeyframes();
  const { x, y } = rectCenter(target);
  const ripple = document.createElement('div');
  ripple.style.cssText = [
    'position: fixed',
    `top: ${y}px`,
    `left: ${x}px`,
    'width: 26px',
    'height: 26px',
    'border-radius: 50%',
    'border: 2.5px solid rgba(124, 90, 255, 0.85)',
    'pointer-events: none',
    'z-index: 99998',
    'animation: __borgdock_anim_ripple 600ms ease-out forwards',
  ].join('; ');
  document.body.appendChild(ripple);
  setTimeout(() => ripple.remove(), 700);
}

// Convenience: cursor moves to el, ripples, then performs el.click() and
// waits for the post-click settle. Use when the story doesn't need
// userEvent's full event sequence (mouseenter / mousemove / mouseup
// individually) — for hover-driven UIs prefer moveCursorTo + dispatching
// 'mouseover' explicitly so the hover state actually paints.
export async function clickAt(
  target: Element,
  opts: { moveMs?: number; settleMs?: number } = {},
): Promise<void> {
  const { moveMs = 600, settleMs = 350 } = opts;
  await moveCursorTo(target, moveMs);
  clickRipple(target);
  (target as HTMLElement).click();
  await new Promise((resolve) => setTimeout(resolve, settleMs));
}

// Hover helper. Some UIs (PR card pill bar) reveal on :hover via CSS.
// userEvent.hover doesn't always paint the hover state in headless Chromium
// — dispatching mouseover/mouseenter manually does.
export async function hoverAt(target: Element, moveMs = 600): Promise<void> {
  await moveCursorTo(target, moveMs);
  const events = ['pointerover', 'mouseover', 'pointerenter', 'mouseenter'];
  for (const type of events) {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  }
}

export async function unhoverAt(target: Element): Promise<void> {
  const events = ['pointerleave', 'mouseleave', 'pointerout', 'mouseout'];
  for (const type of events) {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  }
}
