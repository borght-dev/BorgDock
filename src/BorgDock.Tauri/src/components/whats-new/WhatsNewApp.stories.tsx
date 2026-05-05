// src/components/whats-new/WhatsNewApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { getControl } from '../../../.storybook/mocks/control';
import type { Release } from '@/types/whats-new';
import { WhatsNewApp } from './WhatsNewApp';

interface PluginStoreSeed {
  [path: string]: Record<string, unknown>;
}

interface WhatsNewStoryParams {
  /** Per-path key/value seed pushed into the mock plugin-store. */
  pluginStoreSeed?: PluginStoreSeed;
  /** Forces tauri-plugin-store.load() into 'pending' or 'reject' modes. */
  storeBehavior?: 'normal' | 'pending' | 'reject';
  /** Sets window.__BORGDOCK_WHATS_NEW__.version before mount. */
  targetVersion?: string;
  /** Initial isMaximized() return value. */
  windowMaximized?: boolean;
  /** Override for getVersion() — defaults to '1.2.0'. */
  appVersion?: string;
  /** Replace the RELEASES array exposed via the proxy alias. */
  releasesOverride?: Release[];
}

declare global {
  interface Window {
    __BORGDOCK_WHATS_NEW__?: { version: string | null };
  }
}

function WhatsNewHarness({ params }: { params: WhatsNewStoryParams }) {
  // Seed all control-surface state synchronously, before WhatsNewApp's
  // first render. The global preview decorator already called reset().
  const ctrl = getControl();

  if (params.storeBehavior) ctrl.pluginStoreBehavior = params.storeBehavior;
  if (params.appVersion !== undefined) ctrl.appVersion = params.appVersion;
  if (params.windowMaximized !== undefined) ctrl.windowState.isMaximized = params.windowMaximized;
  if (params.releasesOverride !== undefined) ctrl.releasesOverride = params.releasesOverride;
  if (params.pluginStoreSeed) {
    for (const [path, kv] of Object.entries(params.pluginStoreSeed)) {
      ctrl.pluginStore.set(path, new Map(Object.entries(kv)));
    }
  }

  if (params.targetVersion !== undefined) {
    window.__BORGDOCK_WHATS_NEW__ = { version: params.targetVersion };
  } else {
    delete window.__BORGDOCK_WHATS_NEW__;
  }

  useEffect(() => {
    return () => {
      delete window.__BORGDOCK_WHATS_NEW__;
    };
  }, []);

  return (
    <div style={{ width: 720, height: 640 }}>
      <WhatsNewApp />
    </div>
  );
}

const meta: Meta<typeof WhatsNewHarness> = {
  title: 'Whats New/WhatsNewApp',
  component: WhatsNewHarness,
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj<typeof WhatsNewHarness>;

function story(params: WhatsNewStoryParams): Story {
  return { args: { params } };
}

// ---------------------------------------------------------------------------
// Store-state axis
// ---------------------------------------------------------------------------

export const Hydrating = story({
  // load() never resolves; the store stays unhydrated and the component
  // shows its pre-hydration UI.
  storeBehavior: 'pending',
});
