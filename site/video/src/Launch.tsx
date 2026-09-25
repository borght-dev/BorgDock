import { AbsoluteFill, Sequence } from 'remotion';
import { Crossfade } from './components/Crossfade';
import type { VideoProps } from './props';
import { DownloadCard } from './scenes/DownloadCard';
import { landscapeLayout, RecordingScene } from './scenes/RecordingScene';
import { TitleCard } from './scenes/TitleCard';
import { palettes } from './theme';
import { heroPacing, launchPacing, layout, type Pacing } from './timeline';

/** Scenes on a 1920×1080 timeline; the title and download cards when the pacing has them. */
const Reel: React.FC<VideoProps & { pacing: Pacing; loop: boolean }> = ({
  theme,
  scenes,
  pacing,
  loop,
}) => {
  const palette = palettes[theme];
  const { blocks } = layout(scenes ?? [], pacing);
  return (
    <AbsoluteFill style={{ background: palette.background }}>
      {blocks.map((b, i) => (
        <Sequence
          key={b.kind === 'scene' ? b.scene.slug : b.kind}
          from={b.from}
          durationInFrames={b.duration}
          name={b.kind === 'scene' ? b.scene.slug : b.kind}
        >
          <Crossfade
            fadeIn={i > 0}
            fadeOutAt={loop && i === blocks.length - 1 ? b.duration : undefined}
          >
            {b.kind === 'title' && <TitleCard palette={palette} />}
            {b.kind === 'scene' && (
              <RecordingScene
                scene={b.scene}
                palette={palette}
                lead={pacing.lead}
                layout={landscapeLayout}
              />
            )}
            {b.kind === 'end' && <DownloadCard palette={palette} />}
          </Crossfade>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

/** 1920×1080: title card, one scene per recording, download card. For YouTube and the gallery. */
export const Launch: React.FC<VideoProps> = (props) => (
  <Reel {...props} pacing={launchPacing} loop={false} />
);

/**
 * The home page hero: the same scenes without the title and download cards
 * (the hero around it already has the headline and the button). The last
 * scene fades to the background, so the loop restarts cleanly as the first
 * window springs in.
 */
export const LaunchHero: React.FC<VideoProps> = (props) => (
  <Reel {...props} pacing={heroPacing} loop />
);

/**
 * The poster, for both Launch and LaunchHero: the first recording's scene, settled, about 2.8 s into the
 * recording (for pr-detail-push, the detail is open). A composition that ends
 * on that frame; the render script takes its last frame (`--frame=-1`).
 */
export const LaunchPoster: React.FC<VideoProps> = ({ theme, scenes }) => {
  const palette = palettes[theme];
  const first = scenes?.[0];
  return first ? (
    <RecordingScene
      scene={first}
      palette={palette}
      lead={launchPacing.lead}
      layout={landscapeLayout}
    />
  ) : (
    <DownloadCard palette={palette} />
  );
};
