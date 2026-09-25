import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Caption } from '../components/Caption';
import { fit, RecordingClip } from '../components/RecordingClip';
import { WindowFrame } from '../components/WindowFrame';
import type { ResolvedScene } from '../media';
import { enter, windowEntrance } from '../motion';
import type { Palette } from '../theme';

export type SceneLayout = {
  /** The box the window is fitted into, centred. */
  box: { top: number; width: number; height: number };
  /** Top of the caption block. */
  captionTop: number;
  caption: { headline: number; detail: number; width: number };
  /** Upscaling past this makes the UI text soft. */
  maxScale: number;
};

export const landscapeLayout: SceneLayout = {
  box: { top: 56, width: 1600, height: 780 },
  captionTop: 872,
  caption: { headline: 46, detail: 29, width: 1500 },
  maxScale: 1.25,
};

export const portraitLayout: SceneLayout = {
  box: { top: 530, width: 960, height: 960 },
  captionTop: 1560,
  caption: { headline: 56, detail: 34, width: 920 },
  maxScale: 1.4,
};

/** One recording in the window frame, with its caption underneath. */
export const RecordingScene: React.FC<{
  scene: ResolvedScene;
  palette: Palette;
  lead: number;
  layout: SceneLayout;
}> = ({ scene, palette, lead, layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const size = fit(scene, layout.box, layout.maxScale);
  const p = enter(frame, fps);
  return (
    <AbsoluteFill style={{ background: palette.background }}>
      <div
        style={{
          position: 'absolute',
          top: layout.box.top,
          left: 0,
          right: 0,
          height: layout.box.height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <WindowFrame
          width={size.width}
          height={size.height}
          palette={palette}
          style={windowEntrance(p)}
        >
          <RecordingClip scene={scene} lead={lead} scale={size.scale} crop={size.crop} />
        </WindowFrame>
      </div>
      <div
        style={{
          position: 'absolute',
          top: layout.captionTop,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <Caption
          headline={scene.headline}
          detail={scene.detail}
          palette={palette}
          delay={8}
          size={layout.caption}
        />
      </div>
    </AbsoluteFill>
  );
};
