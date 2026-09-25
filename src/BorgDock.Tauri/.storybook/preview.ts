// .storybook/preview.ts

import type { Preview } from '@storybook/react-vite';
import '../src/styles/index.css';
import type { ThemeMode } from '../src/types/settings';
import { applyTheme } from '../src/utils/theme';
import { getControl } from './mocks/control';

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Color theme (the same applyTheme every window uses)',
      defaultValue: 'system',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
          { value: 'system', title: 'System' },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    layout: 'fullscreen',
    backgrounds: { disable: true },
    controls: { expanded: true },
  },
  decorators: [
    (Story, ctx) => {
      // Reset Tauri mock state and apply the toolbar theme before every story.
      getControl().reset();
      const theme = (ctx.globals as { theme?: ThemeMode }).theme ?? 'system';
      applyTheme({ theme });
      return Story();
    },
  ],
};

export default preview;
