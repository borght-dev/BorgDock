// Self-hosted fonts, the same fontsource packages the site and the app use
// (hoisted to the repo root's node_modules). Importing the CSS registers the
// @font-face rules; Remotion bundles the woff2 files. The render waits until
// the faces the video uses are loaded, so no frame is drawn in a fallback font.
import '@fontsource-variable/inter';
import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/jetbrains-mono';
import { continueRender, delayRender } from 'remotion';

const FACES = [
  '700 96px "Inter Variable"',
  '600 44px "Inter Variable"',
  '400 30px "Instrument Sans Variable"',
  '500 30px "JetBrains Mono Variable"',
];

const handle = delayRender('Loading fonts');

Promise.all(FACES.map((face) => document.fonts.load(face)))
  .then(() => document.fonts.ready)
  .then(() => continueRender(handle))
  .catch((err) => {
    // A missing font should not hang the render; the fallbacks in theme.ts
    // still draw every frame.
    console.warn('[fonts] could not load a font face', err);
    continueRender(handle);
  });
