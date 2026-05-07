// src/App.stories.tsx
//
// Lifecycle / gating stories for App.tsx — 4 stories covering the main
// rendering states before the fully-loaded main window appears.

import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { useSettingsStore } from '@/stores/settings-store';
import App from './App';
import {
  freezeAnimations,
  MainWindowFrame,
  PRS_CANONICAL,
  withMainWindow,
} from './components/main/__fixtures__/main-window-data';

const frame: Decorator = (Story) => (
  <MainWindowFrame>
    <Story />
  </MainWindowFrame>
);

const meta: Meta<typeof App> = {
  title: 'Main Window/App/Lifecycle',
  component: App,
  decorators: [frame],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof App>;

// ── A. Lifecycle / gating ─────────────────────────────────────

// Renders the SplashScreen because isLoading=true gates both the wizard and
// main window. withMainWindow sets isLoading=false by default; the second
// decorator re-asserts isLoading=true after the baseline reset.
export const LoadingSettings: Story = {
  decorators: [
    (Story) => {
      useSettingsStore.setState({ isLoading: true, hasLoaded: false });
      return <Story />;
    },
    withMainWindow({
      // Seed stores to a consistent baseline; isLoading will be overridden
      // by the outer decorator above.
      init: { isComplete: false },
    }),
  ],
};

// Init sequence is running: settings loaded (isLoading=false) but init not
// yet complete (isInitComplete=false). App shows SplashScreen with progress steps.
// needsSetup must be false so we don't get the wizard — settings.setupComplete=true
// and at least one repo configured.
export const InitInProgress: Story = {
  decorators: [
    withMainWindow({
      init: { isComplete: false },
      settings: {
        setupComplete: true,
        repos: [
          {
            owner: 'borght-dev',
            name: 'BorgDock',
            enabled: true,
            worktreeBasePath: '',
            worktreeSubfolder: '',
          },
        ],
      },
    }),
  ],
};

// Capture the brief fade-out overlay (200ms) that overlays the main window
// while the splash animates out. App.tsx's useEffect fires setFadingOut(true)
// and starts a 200ms setTimeout. We patch window.setTimeout to intercept the
// 200ms timer and never resolve it, freezing the component in the fadingOut
// branch. freezeAnimations ensures the CSS animation is static for snapshot
// capture.
export const FadingOut: Story = {
  decorators: [
    freezeAnimations,
    (Story) => {
      const realSetTimeout = window.setTimeout;
      // Intercept only the 200ms fade timer that App.tsx uses for the splash
      // fade-out; let all other timers (React internals etc.) through normally.
      window.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
        if (ms === 200) {
          // Drop the timer — fadingOut stays true indefinitely for this story.
          return 0 as unknown as ReturnType<typeof setTimeout>;
        }
        return realSetTimeout(fn, ms, ...args);
      }) as typeof window.setTimeout;
      return <Story />;
    },
    withMainWindow({
      init: { isComplete: true },
      settings: {
        setupComplete: true,
        repos: [
          {
            owner: 'borght-dev',
            name: 'BorgDock',
            enabled: true,
            worktreeBasePath: '',
            worktreeSubfolder: '',
          },
        ],
      },
      pullRequests: PRS_CANONICAL,
    }),
  ],
};

// Fully loaded main window — setup complete, init done, PRs populated.
// Default activeSection is 'focus' (set by withMainWindow).
export const Loaded: Story = {
  decorators: [
    withMainWindow({
      ui: { activeSection: 'focus' },
      pullRequests: PRS_CANONICAL,
      settings: {
        setupComplete: true,
        repos: [
          {
            owner: 'borght-dev',
            name: 'BorgDock',
            enabled: true,
            worktreeBasePath: '',
            worktreeSubfolder: '',
          },
        ],
      },
    }),
  ],
};
