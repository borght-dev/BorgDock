// Remotion CLI config for the BorgDock launch video.
// https://www.remotion.dev/docs/config
//
// The public dir is the site's own `public/`, so the video is built from the
// same recordings the site shows (`recordings/<slug>-<theme>.mp4`). The
// package scripts run from site/video, which is what `../public` is relative to.
import { Config } from '@remotion/cli/config';

Config.setEntryPoint('src/index.ts');
Config.setPublicDir('../public');

// H.264 at CRF 18, no audio track: the recordings are silent and the site
// plays the video muted.
Config.setCodec('h264');
Config.setCrf(18);
Config.setPixelFormat('yuv420p');
Config.setMuted(true);
// Tag the stream BT.709 so browsers convert the graphite background exactly.
Config.setColorSpace('bt709');

// Frames are captured as JPEG before encoding; UI text needs a high quality
// or small labels smear.
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setStillImageFormat('webp');
Config.setOverwriteOutput(true);
