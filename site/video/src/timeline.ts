// Frame arithmetic shared by the compositions and their calculateMetadata.
// Blocks (title, one per recording, download card) overlap by XFADE frames:
// the incoming block fades in over the outgoing one, a 12-frame crossfade.
import type { ResolvedScene } from './media';

export const FPS = 30;
export const XFADE = 12;

export type Pacing = {
  /** Title card length (0 for none). */
  title: number;
  /** Frames the window holds its first frame while it springs in. */
  lead: number;
  /** Frames the last frame holds after the recording ends, caption still up. */
  tail: number;
  /** Download card length (0 for none). */
  end: number;
};

export const launchPacing: Pacing = { title: 150, lead: 18, tail: 54, end: 180 };
export const shortPacing: Pacing = { title: 0, lead: 12, tail: 24, end: 90 };
/** The site hero: the scenes only; the page around it has the headline and the button. */
export const heroPacing: Pacing = { title: 0, lead: 18, tail: 48, end: 0 };

export type Block =
  | { kind: 'title'; from: number; duration: number }
  | { kind: 'scene'; from: number; duration: number; scene: ResolvedScene }
  | { kind: 'end'; from: number; duration: number };

export function layout(scenes: ResolvedScene[], pacing: Pacing): { blocks: Block[]; total: number } {
  const blocks: Block[] = [];
  let cursor = 0;
  const push = (b: Block) => {
    // Every block after the first starts XFADE frames before the previous ends.
    const from = blocks.length === 0 ? 0 : cursor - XFADE;
    blocks.push({ ...b, from });
    cursor = from + b.duration;
  };
  if (pacing.title > 0) push({ kind: 'title', from: 0, duration: pacing.title });
  for (const scene of scenes) {
    push({ kind: 'scene', from: 0, duration: pacing.lead + scene.playFrames + pacing.tail, scene });
  }
  if (pacing.end > 0) push({ kind: 'end', from: 0, duration: pacing.end });
  return { blocks, total: cursor };
}
