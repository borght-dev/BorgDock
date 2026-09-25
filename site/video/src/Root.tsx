import './fonts';
import { Composition, Folder } from 'remotion';
import { Launch, LaunchHero, LaunchPoster } from './Launch';
import { metadataFor, posterMetadataFor, type VideoProps } from './props';
import { launchScenes, shortScenes } from './recordings';
import { Short, ShortPoster } from './Short';
import { FPS, heroPacing, launchPacing, shortPacing } from './timeline';

// A light render is one flag: --props=props/light.json (or
// --props='{"theme":"light"}'; the recordings exist in both themes). The scene list is a prop too, so a render can
// reorder or drop scenes without touching the code.
const launchDefaults: VideoProps = { theme: 'dark', recordings: launchScenes, scenes: null };
const shortDefaults: VideoProps = { theme: 'dark', recordings: shortScenes, scenes: null };

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="Video">
      <Composition
        id="Launch"
        component={Launch}
        width={1920}
        height={1080}
        fps={FPS}
        durationInFrames={launchPacing.title + launchPacing.end}
        defaultProps={launchDefaults}
        calculateMetadata={metadataFor(launchPacing)}
      />
      <Composition
        id="LaunchHero"
        component={LaunchHero}
        width={1920}
        height={1080}
        fps={FPS}
        durationInFrames={1}
        defaultProps={launchDefaults}
        calculateMetadata={metadataFor(heroPacing)}
      />
      <Composition
        id="Short"
        component={Short}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={shortPacing.end}
        defaultProps={shortDefaults}
        calculateMetadata={metadataFor(shortPacing)}
      />
    </Folder>
    <Folder name="Posters">
      <Composition
        id="LaunchPoster"
        component={LaunchPoster}
        width={1920}
        height={1080}
        fps={FPS}
        durationInFrames={1}
        defaultProps={launchDefaults}
        calculateMetadata={posterMetadataFor(launchPacing, 84)}
      />
      <Composition
        id="ShortPoster"
        component={ShortPoster}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={1}
        defaultProps={shortDefaults}
        calculateMetadata={posterMetadataFor(shortPacing, 72)}
      />
    </Folder>
  </>
);
