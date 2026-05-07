// .storybook/preview.ts

import type { Preview } from '@storybook/react-vite';
import '../src/styles/index.css';
// Window-entry-specific stylesheets. In production these are loaded by each
// window's *-main.tsx entry. Storybook bypasses those entries (stories import
// the React component directly), so the styles must be loaded globally here
// or the stories render with bare structural markup. Add new stylesheets to
// this list whenever a new window adds one.
import '../src/styles/agent-overview.css';
import { getControl } from './mocks/control';

function applyTheme(theme: string) {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
}

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Color theme (mirrors FlyoutApp.applyTheme)',
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
      const theme = (ctx.globals as { theme?: string }).theme ?? 'system';
      applyTheme(theme);
      return Story();
    },
  ],
};

export default preview;
