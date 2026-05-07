// .storybook/main.ts

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';
import tailwindcss from '@tailwindcss/vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const here = dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-themes', '@storybook/addon-vitest'],
  typescript: {
    check: false,
    reactDocgen: 'react-docgen-typescript',
  },
  async viteFinal(config) {
    // Pre-bundle React's runtime entries (and zustand) so the addon-vitest
    // browser project doesn't trigger a mid-test re-optimization that
    // re-instantiates the React dispatcher and crashes hooks with
    // "Cannot read properties of null (reading 'useState')". zustand's
    // store hook imports React directly; without pre-bundling it resolves
    // to a separate React copy than Storybook's pre-bundled one and the
    // dispatcher comes back null. See storybookjs/storybook#32049.
    config.optimizeDeps = {
      ...config.optimizeDeps,
      include: [
        ...(config.optimizeDeps?.include ?? []),
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'zustand',
      ],
    };

    // Bun workspace hoists React to BOTH the repo root and src/BorgDock.Tauri.
    // Without dedupe, Vite resolves `react` differently depending on which
    // module imports it (a hook from a story → one copy, a hook from a
    // node_modules/zustand → potentially the other). Two React copies →
    // separate dispatcher state → null hook crashes inside the test runner.
    config.resolve = config.resolve ?? {};
    config.resolve.dedupe = [...(config.resolve.dedupe ?? []), 'react', 'react-dom'];

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
    // Use an array of {find, replacement} entries so ordering is explicit and
    // RegExp finds can be used where needed.
    //
    // Ordering rules (Vite uses entries.find() — first match wins):
    // 1. Specific @/services/* mocks come BEFORE the bare '@' catch-all, so they
    //    are not shadowed by '@' prefix-matching '@/services/pr-actions' etc.
    // 2. '@/services/github/…' sub-module mocks come BEFORE the barrel mock, so
    //    that sub-module imports are directed to the right mock file.
    // 3. '@/services/github' uses a RegExp anchored to the exact string so it
    //    does NOT intercept '@/services/github/rate-limit' or any other sub-module
    //    that has no dedicated mock (those fall through to the '@' catch-all and
    //    resolve to the real source tree).
    const existingEntries: { find: string | RegExp; replacement: string }[] = Array.isArray(
      config.resolve.alias,
    )
      ? (config.resolve.alias as { find: string | RegExp; replacement: string }[]).filter(
          (e) => e.find !== '@',
        )
      : Object.entries(config.resolve.alias ?? {})
          .filter(([k]) => k !== '@')
          .map(([find, replacement]) => ({ find, replacement: replacement as string }));

    config.resolve.alias = [
      ...existingEntries,
      { find: '@tauri-apps/api/core', replacement: resolve(here, 'mocks/tauri-core.ts') },
      { find: '@tauri-apps/api/event', replacement: resolve(here, 'mocks/tauri-event.ts') },
      { find: '@tauri-apps/api/window', replacement: resolve(here, 'mocks/tauri-api-window.ts') },
      {
        find: '@tauri-apps/api/webviewWindow',
        replacement: resolve(here, 'mocks/tauri-api-webviewWindow.ts'),
      },
      { find: '@tauri-apps/api/app', replacement: resolve(here, 'mocks/tauri-api-app.ts') },
      { find: '@tauri-apps/api/dpi', replacement: resolve(here, 'mocks/tauri-api-dpi.ts') },
      {
        find: '@tauri-apps/plugin-opener',
        replacement: resolve(here, 'mocks/tauri-plugin-opener.ts'),
      },
      {
        find: '@tauri-apps/plugin-store',
        replacement: resolve(here, 'mocks/tauri-plugin-store.ts'),
      },
      {
        find: '@tauri-apps/plugin-clipboard-manager',
        replacement: resolve(here, 'mocks/tauri-plugin-clipboard-manager.ts'),
      },
      {
        find: '@tauri-apps/plugin-dialog',
        replacement: resolve(here, 'mocks/tauri-plugin-dialog.ts'),
      },
      { find: '@tauri-apps/plugin-fs', replacement: resolve(here, 'mocks/tauri-plugin-fs.ts') },
      {
        find: '@tauri-apps/plugin-autostart',
        replacement: resolve(here, 'mocks/tauri-plugin-autostart.ts'),
      },
      { find: '@/services/windows', replacement: resolve(here, 'mocks/services-windows.ts') },
      {
        find: '@/services/ado/workitems',
        replacement: resolve(here, 'mocks/services-ado-workitems.ts'),
      },
      {
        find: '@/services/github/pulls',
        replacement: resolve(here, 'mocks/services-github-pulls.ts'),
      },
      {
        find: '@/services/github/checks',
        replacement: resolve(here, 'mocks/services-github-checks.ts'),
      },
      {
        find: '@/services/github/auth',
        replacement: resolve(here, 'mocks/services-github-auth.ts'),
      },
      {
        find: '@/services/github/reviewThreads',
        replacement: resolve(here, 'mocks/services-github-reviewThreads.ts'),
      },
      {
        find: '@/services/github/singleton',
        replacement: resolve(here, 'mocks/services-github-singleton.ts'),
      },
      {
        find: '@/services/github/mutations',
        replacement: resolve(here, 'mocks/services-github-mutations.ts'),
      },
      // Anchored regex: matches ONLY the exact bare barrel import, not sub-modules.
      {
        find: /^@\/services\/github$/,
        replacement: resolve(here, 'mocks/services-github-barrel.ts'),
      },
      { find: '@/services/pr-actions', replacement: resolve(here, 'mocks/services-pr-actions.ts') },
      { find: '@/generated/changelog', replacement: resolve(here, 'mocks/generated-changelog.ts') },
      // Bare '@' catch-all goes last so specific mocks above take priority.
      { find: '@', replacement: resolve(here, '../src') },
    ];
    return config;
  },
};

export default config;
