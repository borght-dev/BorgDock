import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { Crossfade } from './components/Crossfade';
import { Logo } from './components/Logo';
import { captionEntrance, enter } from './motion';
import type { VideoProps } from './props';
import { DownloadCard } from './scenes/DownloadCard';
import { portraitLayout, RecordingScene } from './scenes/RecordingScene';
import { HEADLINE } from './scenes/TitleCard';
import { fonts, type Palette, palettes } from './theme';
import { layout, shortPacing, XFADE } from './timeline';

/** The headline stays at the top while the scenes change underneath it. */
const Header: React.FC<{ palette: Palette }> = ({ palette }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 150, textAlign: 'center' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          ...captionEntrance(enter(frame, fps, 0)),
        }}
      >
        <Logo size={44} palette={palette} />
        <span
          style={{
            fontFamily: fonts.ui,
            fontSize: 40,
            fontWeight: 650,
            letterSpacing: '-0.02em',
            color: palette.textPrimary,
          }}
        >
          BorgDock
        </span>
      </div>
      <div
        style={{
          marginTop: 36,
          maxWidth: 900,
          fontFamily: fonts.ui,
          fontSize: 76,
          fontWeight: 700,
          letterSpacing: '-0.035em',
          lineHeight: 1.04,
          color: palette.textPrimary,
          ...captionEntrance(enter(frame, fps, 6)),
        }}
      >
        {/* Break after the comma rather than wherever the width runs out. */}
        {HEADLINE.split(', ').map((part, i, all) => (
          <div key={part}>{i < all.length - 1 ? `${part},` : part}</div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** 1080×1920: three recordings cropped for portrait under the headline, then the download card. */
export const Short: React.FC<VideoProps> = ({ theme, scenes }) => {
  const palette = palettes[theme];
  const { blocks } = layout(scenes ?? [], shortPacing);
  const end = blocks[blocks.length - 1];
  const sceneBlocks = blocks.flatMap((b) => (b.kind === 'scene' ? [b] : []));
  return (
    <AbsoluteFill style={{ background: palette.background }}>
      {sceneBlocks.map((b, i) => (
        <Sequence key={b.scene.slug} from={b.from} durationInFrames={b.duration} name={b.scene.slug}>
          <Crossfade fadeIn={i > 0}>
            <RecordingScene
              scene={b.scene}
              palette={palette}
              lead={shortPacing.lead}
              layout={portraitLayout}
            />
          </Crossfade>
        </Sequence>
      ))}
      {/* Above the scenes; the opaque download card covers it once faded in. */}
      {end.from > 0 && (
        <Sequence durationInFrames={end.from + XFADE} name="header">
          <Header palette={palette} />
        </Sequence>
      )}
      <Sequence from={end.from} durationInFrames={end.duration} name="end">
        <Crossfade fadeIn={sceneBlocks.length > 0}>
          <DownloadCard palette={palette} scale={0.82} />
        </Crossfade>
      </Sequence>
    </AbsoluteFill>
  );
};

/** The poster: the header over the first scene about 2.4 s in (see LaunchPoster). */
export const ShortPoster: React.FC<VideoProps> = ({ theme, scenes }) => {
  const palette = palettes[theme];
  const first = scenes?.[0];
  return first ? (
    <AbsoluteFill>
      <RecordingScene
        scene={first}
        palette={palette}
        lead={shortPacing.lead}
        layout={portraitLayout}
      />
      <Header palette={palette} />
    </AbsoluteFill>
  ) : (
    <DownloadCard palette={palette} scale={0.82} />
  );
};
