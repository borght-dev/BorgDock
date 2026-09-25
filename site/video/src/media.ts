// Finds each scene's recording in the site's public dir and reads its length
// and size with Mediabunny (what Remotion recommends in place of the
// deprecated @remotion/media-parser), so a scene lasts exactly as long as its
// recording. Runs inside calculateMetadata (in the browser, before the first
// frame).
import { ALL_FORMATS, Input, UrlSource } from 'mediabunny';
import { getStaticFiles, staticFile } from 'remotion';
import type { SceneSpec } from './recordings';
import type { ThemeName } from './theme';

export type ResolvedScene = SceneSpec & {
  /** staticFile() URL of the MP4 (or WebM). */
  src: string;
  /** Recording size in pixels. */
  width: number;
  height: number;
  /** Frames to play after trimming, at the composition's fps. */
  playFrames: number;
  /** Frames skipped at the start of the file (trimStart). */
  trimStartFrames: number;
};

type Meta = {
  durationInSeconds: number;
  width: number;
  height: number;
};

async function exists(path: string): Promise<boolean> {
  const listed = getStaticFiles();
  if (listed.length > 0) return listed.some((f) => f.name === path);
  // getStaticFiles() is empty where it is unsupported; ask the server instead.
  try {
    const res = await fetch(staticFile(path), { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

/** Duration and display size, read from the container (MP4 or WebM) without decoding. */
async function readMeta(src: string): Promise<Meta> {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new UrlSource(new URL(src, window.location.href), { getRetryDelay: () => null }),
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error(`${src} has no video track`);
    return {
      durationInSeconds: await input.computeDuration(),
      width: await track.getDisplayWidth(),
      height: await track.getDisplayHeight(),
    };
  } finally {
    input.dispose();
  }
}

/**
 * The scenes whose recording exists for this theme, with their metadata.
 * MP4 first, WebM when the MP4 is missing (the recorder writes WebM on a
 * machine without a full ffmpeg); a scene with neither is left out.
 */
export async function resolveScenes(
  specs: SceneSpec[],
  theme: ThemeName,
  fps: number,
): Promise<ResolvedScene[]> {
  const out: ResolvedScene[] = [];
  for (const spec of specs) {
    const base = `recordings/${spec.slug}-${theme}`;
    let file: string | null = null;
    if (await exists(`${base}.mp4`)) file = `${base}.mp4`;
    else if (await exists(`${base}.webm`)) file = `${base}.webm`;
    if (!file) {
      console.info(`[launch-video] skipping "${spec.slug}": no ${base}.mp4 or .webm`);
      continue;
    }
    const src = staticFile(file);
    const meta = await readMeta(src);
    // Clamp both ends to the file, so a re-recorded, shorter file never
    // points past its end or leaves a scene with nothing to play.
    const trimEnd = Math.min(meta.durationInSeconds, spec.trimEnd ?? meta.durationInSeconds);
    const trimStart = Math.min(Math.max(0, spec.trimStart ?? 0), Math.max(0, trimEnd - 1 / fps));
    out.push({
      ...spec,
      src,
      width: meta.width,
      height: meta.height,
      trimStartFrames: Math.round(trimStart * fps),
      // Stop a frame short of the end: the last decoded frame of a file is
      // not always there, and the tail holds that frame anyway.
      playFrames: Math.max(1, Math.floor((trimEnd - trimStart) * fps) - 1),
    });
  }
  return out;
}
