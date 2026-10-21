/// <reference path="../.astro/types.d.ts" />

/** The CHANGELOG.md hero screenshots, by `<version>/<slug>.png` (see release-images.mjs). */
declare module 'virtual:release-images' {
  const images: Record<string, import('astro').ImageMetadata>;
  export default images;
}
