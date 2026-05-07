// .storybook/main.ts

import type { StorybookConfig } from '@storybook/react-vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const here = dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-themes'],
  typescript: {
    check: false,
    reactDocgen: 'react-docgen-typescript',
  },
  async viteFinal(config) {
    config.plugins = config.plugins ?? [];
    config.plugins.push(tailwindcss());
    // Phase 9 — copy the tree-sitter runtime wasm into the Storybook output.
    // The grammar wasms (public/grammars/*.wasm) are served by Vite's
    // public-dir mechanism automatically, but the runtime wasm lives in
    // node_modules/web-tree-sitter/ and needs an explicit copy. Mirrors
    // the production vite.config.ts plugin invocation.
    config.plugins.push(
      viteStaticCopy({
        targets: [
          {
            src: 'node_modules/web-tree-sitter/web-tree-sitter.wasm',
            dest: '.',
            rename: { stripBase: true },
          },
        ],
      }),
    );

    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@tauri-apps/api/core': resolve(here, 'mocks/tauri-core.ts'),
      '@tauri-apps/api/event': resolve(here, 'mocks/tauri-event.ts'),
      '@tauri-apps/api/window': resolve(here, 'mocks/tauri-api-window.ts'),
      '@tauri-apps/api/webviewWindow': resolve(here, 'mocks/tauri-api-webviewWindow.ts'),
      '@tauri-apps/api/app': resolve(here, 'mocks/tauri-api-app.ts'),
      '@tauri-apps/api/dpi': resolve(here, 'mocks/tauri-api-dpi.ts'),
      '@tauri-apps/plugin-opener': resolve(here, 'mocks/tauri-plugin-opener.ts'),
      '@tauri-apps/plugin-store': resolve(here, 'mocks/tauri-plugin-store.ts'),
      '@tauri-apps/plugin-clipboard-manager': resolve(here, 'mocks/tauri-plugin-clipboard-manager.ts'),
      '@tauri-apps/plugin-dialog': resolve(here, 'mocks/tauri-plugin-dialog.ts'),
      '@tauri-apps/plugin-fs': resolve(here, 'mocks/tauri-plugin-fs.ts'),
      '@tauri-apps/plugin-autostart': resolve(here, 'mocks/tauri-plugin-autostart.ts'),
      '@/services/windows': resolve(here, 'mocks/services-windows.ts'),
      '@/services/ado/workitems': resolve(here, 'mocks/services-ado-workitems.ts'),
      '@/services/github/pulls': resolve(here, 'mocks/services-github-pulls.ts'),
      '@/services/github/checks': resolve(here, 'mocks/services-github-checks.ts'),
      '@/services/github/auth': resolve(here, 'mocks/services-github-auth.ts'),
      '@/services/pr-actions': resolve(here, 'mocks/services-pr-actions.ts'),
      '@/generated/changelog': resolve(here, 'mocks/generated-changelog.ts'),
      '@': resolve(here, '../src'),
    };
    return config;
  },
};

export default config;
