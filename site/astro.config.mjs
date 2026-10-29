import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { releaseImages } from './release-images.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://borgdock.dev',
  trailingSlash: 'always',
  integrations: [react(), sitemap()],
  build: {
    // Inline small stylesheets directly into <head> for faster first paint.
    inlineStylesheets: 'auto',
  },
  vite: {
    plugins: [releaseImages()],
  },
});
