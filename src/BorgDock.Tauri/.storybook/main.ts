// .storybook/main.ts

import type { StorybookConfig } from '@storybook/react-vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';

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

    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@tauri-apps/api/core': resolve(here, 'mocks/tauri-core.ts'),
      '@tauri-apps/api/event': resolve(here, 'mocks/tauri-event.ts'),
      '@tauri-apps/plugin-opener': resolve(here, 'mocks/tauri-plugin-opener.ts'),
      '@/services/windows': resolve(here, 'mocks/services-windows.ts'),
      '@': resolve(here, '../src'),
    };
    return config;
  },
};

export default config;
