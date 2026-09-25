// The only two motions in the video, both critically damped (no bounce).
import type React from 'react';
import { spring } from 'remotion';

/** 0 → 1 over about 24 frames, settling without overshoot. */
export function enter(frame: number, fps: number, delay = 0): number {
  return spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 24 });
}

/** Window entrance: scale 0.96 → 1, y 24 → 0. */
export function windowEntrance(p: number): React.CSSProperties {
  return {
    opacity: Math.min(1, p * 1.6),
    transform: `translateY(${24 * (1 - p)}px) scale(${0.96 + 0.04 * p})`,
  };
}

/** Caption line: slides up 12 px and fades in. */
export function captionEntrance(p: number): React.CSSProperties {
  return { opacity: p, transform: `translateY(${12 * (1 - p)}px)` };
}
