import { describe, expect, it } from 'vitest';
import { placePopover } from '../position';

const vp = { width: 1280, height: 800 };

function rect(o: Partial<DOMRect>): DOMRect {
  const r: DOMRect = {
    x: 100, y: 100, top: 100, left: 100, right: 200, bottom: 150,
    width: 100, height: 50, toJSON() { return this; },
    ...o,
  } as DOMRect;
  return r;
}

describe('placePopover', () => {
  it('anchors below the card with an 8px gap when there is room', () => {
    const s = placePopover(rect({ top: 100, bottom: 150 }), vp);
    expect(s.top).toBe(158);
  });
  it('flips above when the card is near the bottom', () => {
    const s = placePopover(rect({ top: 700, bottom: 740 }), vp);
    expect(s.top).toBeLessThan(700);
  });
  it('clamps left to keep the popover in viewport', () => {
    const s = placePopover(rect({ left: 1100 }), vp);
    expect(s.left + 480).toBeLessThanOrEqual(1280 - 12);
  });
  it('respects the 12px left padding', () => {
    const s = placePopover(rect({ left: -200 }), vp);
    expect(s.left).toBe(12);
  });
});
