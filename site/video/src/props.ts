import type { CalculateMetadataFunction } from 'remotion';
import { type ResolvedScene, resolveScenes } from './media';
import type { SceneSpec } from './recordings';
import type { ThemeName } from './theme';
import { FPS, layout, type Pacing } from './timeline';

export type VideoProps = {
  /** Which recordings to use (`<slug>-<theme>.mp4`) and which palette. */
  theme: ThemeName;
  /** The scenes in order; ones without a recording file are skipped. */
  recordings: SceneSpec[];
  /** Filled in by calculateMetadata; leave null. */
  scenes: ResolvedScene[] | null;
};

/** Resolves the recordings, then sizes the composition to fit them. */
export function metadataFor(pacing: Pacing): CalculateMetadataFunction<VideoProps> {
  return async ({ props }) => {
    const scenes = await resolveScenes(props.recordings, props.theme, FPS);
    return {
      durationInFrames: layout(scenes, pacing).total,
      props: { ...props, scenes },
    };
  };
}

/**
 * For the posters: a composition that ends on the poster frame, the first
 * scene `into` frames into its recording once the window has settled (or the
 * download card when no recording exists). Rendered with `still --frame=-1`.
 * (A <Still> cannot do this: its timeline is one frame long, so even <Freeze>
 * cannot show a later frame.)
 */
export function posterMetadataFor(pacing: Pacing, into: number): CalculateMetadataFunction<VideoProps> {
  return async ({ props }) => {
    const scenes = await resolveScenes(props.recordings, props.theme, FPS);
    const first = scenes[0];
    return {
      durationInFrames: first ? pacing.lead + Math.min(into, first.playFrames - 1) + 1 : 61,
      props: { ...props, scenes },
    };
  };
}
