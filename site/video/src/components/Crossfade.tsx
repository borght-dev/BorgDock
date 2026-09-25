import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { XFADE } from '../timeline';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/**
 * Fades a block in over the one underneath during its first XFADE frames.
 * Blocks are opaque, so the outgoing block stays put and nothing dips to the
 * background halfway through. `fadeOutAt` (the block's length) also fades it
 * out to the background over its last XFADE frames, for a loop that restarts
 * from an empty frame.
 */
export const Crossfade: React.FC<{
  fadeIn: boolean;
  fadeOutAt?: number;
  children: React.ReactNode;
}> = ({ fadeIn, fadeOutAt, children }) => {
  const frame = useCurrentFrame();
  const inOpacity = fadeIn ? interpolate(frame, [0, XFADE], [0, 1], clamp) : 1;
  const outOpacity =
    fadeOutAt === undefined ? 1 : interpolate(frame, [fadeOutAt - XFADE, fadeOutAt], [1, 0], clamp);
  return <AbsoluteFill style={{ opacity: Math.min(inOpacity, outOpacity) }}>{children}</AbsoluteFill>;
};
