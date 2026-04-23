import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  site: 'https://borgdock.dev',
  integrations: [react()],
  build: {
    // Inline small stylesheets directly into <head> for faster first paint.
    inlineStylesheets: 'auto',
  },
});
