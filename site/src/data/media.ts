// Captures and recordings: the manifests in design/site/*.json joined with
// the files the asset pipeline wrote to public/. Build-time only.
//
// Every visual on the site comes from these manifests. A manifest entry whose
// files do not exist yet is still valid: Capture renders nothing for it and
// Recording falls back to its poster or its fallback capture, so the site
// builds before the assets are generated.
import fs from 'node:fs';
import path from 'node:path';
import recordingsManifest from '../../../design/site/recordings.json';
import screensManifest from '../../../design/site/screens.json';

export type Theme = 'light' | 'dark';
export type GalleryPage = 'Pull requests' | 'Focus' | 'Detail' | 'Quick review' | 'Tools';
export const GALLERY_PAGES: GalleryPage[] = ['Pull requests', 'Focus', 'Detail', 'Quick review', 'Tools'];

interface ManifestEntry {
  slug: string;
  alt: string;
  page: string;
  theme?: string;
  /** Captured, but not shown in the gallery yet (e.g. a section still being built). */
  draft?: boolean;
}

export interface Image {
  src: string;
  /** CSS pixels (the file is 2×). */
  width: number;
  height: number;
}

export interface Capture {
  slug: string;
  alt: string;
  page: GalleryPage;
  draft: boolean;
  images: Partial<Record<Theme, Image>>;
}

export interface RecordingVariant {
  mp4?: string;
  webm?: string;
  poster?: Image;
}

export interface Recording {
  slug: string;
  alt: string;
  page: GalleryPage;
  fallback?: string;
  draft: boolean;
  variants: Partial<Record<Theme, RecordingVariant>>;
}

/** site/public, whether the build runs from site/ (the normal case) or the repo root. */
function publicDir(): string {
  const candidates = [path.resolve(process.cwd(), 'public'), path.resolve(process.cwd(), 'site', 'public')];
  return candidates.find((p) => fs.existsSync(path.join(p, 'CNAME'))) ?? candidates[0];
}
const PUBLIC = publicDir();

function exists(urlPath: string): boolean {
  return fs.existsSync(path.join(PUBLIC, urlPath));
}

/** Width and height from a PNG's IHDR chunk or a WebP's VP8/VP8L/VP8X header. */
function imageSize(urlPath: string): { width: number; height: number } | null {
  try {
    const fd = fs.openSync(path.join(PUBLIC, urlPath), 'r');
    const buf = Buffer.alloc(32);
    fs.readSync(fd, buf, 0, 32, 0);
    fs.closeSync(fd);
    if (buf.toString('ascii', 1, 4) === 'PNG') {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      const chunk = buf.toString('ascii', 12, 16);
      if (chunk === 'VP8X') {
        return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
      }
      if (chunk === 'VP8L') {
        const bits = buf.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (chunk === 'VP8 ') {
        return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function image(urlPath: string, density: number): Image | undefined {
  if (!exists(urlPath)) return undefined;
  const size = imageSize(urlPath);
  if (!size) return undefined;
  return {
    src: urlPath,
    width: Math.round(size.width / density),
    height: Math.round(size.height / density),
  };
}

function themesOf(theme: string | undefined, fallback: Theme[]): Theme[] {
  if (theme === 'light') return ['light'];
  if (theme === 'dark') return ['dark'];
  if (theme === 'both') return ['light', 'dark'];
  return fallback;
}

function asPage(page: string): GalleryPage {
  return (GALLERY_PAGES as string[]).includes(page) ? (page as GalleryPage) : 'Tools';
}

export const captures: Capture[] = (screensManifest as ManifestEntry[]).map((m) => {
  const images: Capture['images'] = {};
  for (const t of themesOf(m.theme, ['light', 'dark'])) {
    const img = image(`/screens/${m.slug}-${t}@2x.png`, 2);
    if (img) images[t] = img;
  }
  return { slug: m.slug, alt: m.alt, page: asPage(m.page), draft: m.draft === true, images };
});

export const recordings: Recording[] = (
  recordingsManifest as (ManifestEntry & { fallback?: string })[]
).map((m) => {
  const variants: Recording['variants'] = {};
  for (const t of themesOf(m.theme, ['dark'])) {
    const base = `/recordings/${m.slug}-${t}`;
    const v: RecordingVariant = {
      mp4: exists(`${base}.mp4`) ? `${base}.mp4` : undefined,
      webm: exists(`${base}.webm`) ? `${base}.webm` : undefined,
      poster: image(`${base}.webp`, 1) ?? image(`${base}.png`, 1),
    };
    if (v.mp4 || v.webm || v.poster) variants[t] = v;
  }
  return {
    slug: m.slug,
    alt: m.alt,
    page: asPage(m.page),
    fallback: m.fallback,
    draft: m.draft === true,
    variants,
  };
});

/**
 * The hero cut of the launch video (site/video, composition `LaunchHero`),
 * rendered locally per release with `bun run site:video` into public/video/:
 * `launch-hero.mp4` (dark) and `launch-hero-light.mp4`, each with a `.webp`
 * poster. With both themes, Recording shows the one matching the page; with
 * one, it shows that one everywhere. Null until rendered, so the hero falls
 * back to a recording and the site builds either way.
 */
export const launchVideo: Recording | null = (() => {
  const variants: Recording['variants'] = {};
  for (const [t, base] of [
    ['dark', '/video/launch-hero'],
    ['light', '/video/launch-hero-light'],
  ] as const) {
    const v: RecordingVariant = {
      mp4: exists(`${base}.mp4`) ? `${base}.mp4` : undefined,
      webm: exists(`${base}.webm`) ? `${base}.webm` : undefined,
      poster: image(`${base}.webp`, 1) ?? image(`${base}.png`, 1),
    };
    if (v.mp4 || v.webm) variants[t] = v;
  }
  if (!variants.dark && !variants.light) return null;
  return {
    slug: 'launch-hero',
    alt:
      'BorgDock in under a minute: open a pull request full screen, filter to what needs you, ' +
      'review file by file and merge from Focus',
    page: 'Tools',
    draft: false,
    variants,
  };
})();

export function getCapture(slug: string): Capture {
  const c = captures.find((x) => x.slug === slug);
  if (!c) throw new Error(`No capture "${slug}" in design/site/screens.json`);
  return c;
}

export function getRecording(slug: string): Recording {
  const r = recordings.find((x) => x.slug === slug);
  if (!r) throw new Error(`No recording "${slug}" in design/site/recordings.json`);
  return r;
}
