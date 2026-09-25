import { Freeze, OffthreadVideo, useCurrentFrame } from 'remotion';
import type { ResolvedScene } from '../media';
import type { Crop } from '../recordings';

/** Display size of a recording (or its crop) fitted into a box. */
export function fit(
  scene: ResolvedScene,
  box: { width: number; height: number },
  maxScale: number,
): { width: number; height: number; scale: number; crop: Crop } {
  const crop = scene.crop ?? { x: 0, y: 0, width: scene.width, height: scene.height };
  const scale = Math.min(box.width / crop.width, box.height / crop.height, maxScale);
  return {
    width: Math.round(crop.width * scale),
    height: Math.round(crop.height * scale),
    scale,
    crop,
  };
}

/**
 * The recording, held on its first frame for `lead` frames, then played,
 * then held on its last frame. Freeze drives OffthreadVideo, so every video
 * frame is decoded exactly (no playback drift in the render).
 */
export const RecordingClip: React.FC<{
  scene: ResolvedScene;
  lead: number;
  scale: number;
  crop: Crop;
}> = ({ scene, lead, scale, crop }) => {
  const frame = useCurrentFrame();
  const videoFrame = Math.min(Math.max(frame - lead, 0), scene.playFrames - 1);
  return (
    <Freeze frame={videoFrame}>
      <OffthreadVideo
        src={scene.src}
        muted
        trimBefore={scene.trimStartFrames > 0 ? scene.trimStartFrames : undefined}
        style={{
          position: 'absolute',
          left: -crop.x * scale,
          top: -crop.y * scale,
          width: scene.width * scale,
          height: scene.height * scale,
          maxWidth: 'none',
        }}
      />
    </Freeze>
  );
};
