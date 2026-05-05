// src/components/whats-new/WhatsNewApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { getControl } from '../../../.storybook/mocks/control';
import type { Release } from '@/types/whats-new';
import { WhatsNewApp } from './WhatsNewApp';
import {
  dateSpreadHistory,
  deepHistory,
  releaseEmptySummary,
  releaseFewFixes,
  releaseLongFixList,
  releaseLongHighlight,
  releaseLongMixed,
  releaseManyHighlights,
  releaseNoFixes,
  releaseNoHighlights,
  releaseRichSummary,
  releaseSingleHighlight,
  shapeStoryHistory,
} from './__fixtures__/whats-new-data';

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

export const FirstTimeUser = story({
  pluginStoreSeed: { 'whats-new-state.json': {} },
  appVersion: '1.2.0',
});

export const UpToDate = story({
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.2.0', autoOpenDisabled: false },
  },
  appVersion: '1.2.0',
});

export const OneVersionBehind = story({
  // 1.1.0 is the version directly before 1.2.0 in the real RELEASES array.
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.1.0', autoOpenDisabled: false },
  },
  appVersion: '1.2.0',
});

export const ManyVersionsBehind = story({
  // 1.0.0 is far enough behind the real changelog to surface several
  // missed releases. If the real changelog later only ships 1.0.x → 1.2.0,
  // this story still demonstrates "many behind" correctly.
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.0.0', autoOpenDisabled: false },
  },
  appVersion: '1.2.0',
});

export const AutoOpenDisabledAlready = story({
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.2.0', autoOpenDisabled: true },
  },
  appVersion: '1.2.0',
});

export const TargetedAtSpecificVersion = story({
  // Force a specific real-history version to expand instead of the latest.
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.2.0', autoOpenDisabled: false },
  },
  appVersion: '1.2.0',
  targetVersion: '1.0.0',
});

export const TargetedAtMissingVersion = story({
  // 99.99.99 doesn't exist; useReleasesToShow falls back to newest missed
  // (or newest overall when none missed).
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.2.0', autoOpenDisabled: false },
  },
  appVersion: '1.2.0',
  targetVersion: '99.99.99',
});

// ---------------------------------------------------------------------------
// Release-shape axis
// ---------------------------------------------------------------------------

const shapeStoryDefaults = {
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.0.0', autoOpenDisabled: false },
  },
  appVersion: '1.3.0',
};

export const ReleaseEmptySummary = story({
  ...shapeStoryDefaults,
  appVersion: releaseEmptySummary.version,
  releasesOverride: shapeStoryHistory(releaseEmptySummary),
});

export const ReleaseRichSummary = story({
  ...shapeStoryDefaults,
  appVersion: releaseRichSummary.version,
  releasesOverride: shapeStoryHistory(releaseRichSummary),
});

export const ReleaseNoHighlights = story({
  ...shapeStoryDefaults,
  appVersion: releaseNoHighlights.version,
  releasesOverride: shapeStoryHistory(releaseNoHighlights),
});

export const ReleaseSingleHighlight = story({
  ...shapeStoryDefaults,
  appVersion: releaseSingleHighlight.version,
  releasesOverride: shapeStoryHistory(releaseSingleHighlight),
});

export const ReleaseManyHighlights = story({
  ...shapeStoryDefaults,
  appVersion: releaseManyHighlights.version,
  releasesOverride: shapeStoryHistory(releaseManyHighlights),
});

export const ReleaseLongHighlightCard = story({
  ...shapeStoryDefaults,
  appVersion: releaseLongHighlight.version,
  releasesOverride: shapeStoryHistory(releaseLongHighlight),
});

export const ReleaseNoFixes = story({
  ...shapeStoryDefaults,
  appVersion: releaseNoFixes.version,
  releasesOverride: shapeStoryHistory(releaseNoFixes),
});

export const ReleaseFewFixes = story({
  ...shapeStoryDefaults,
  appVersion: releaseFewFixes.version,
  releasesOverride: shapeStoryHistory(releaseFewFixes),
});

export const ReleaseLongFixList = story({
  ...shapeStoryDefaults,
  appVersion: releaseLongFixList.version,
  releasesOverride: shapeStoryHistory(releaseLongFixList),
});

export const ReleaseLongMixed = story({
  ...shapeStoryDefaults,
  appVersion: releaseLongMixed.version,
  releasesOverride: shapeStoryHistory(releaseLongMixed),
});

// ---------------------------------------------------------------------------
// Accordion axis
// ---------------------------------------------------------------------------

export const AccordionAllCollapsed = story({
  // lastSeenVersion = the newest deepHistory entry, no targetVersion;
  // useReleasesToShow returns expandedVersion = null (no missed; no target).
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.7.0', autoOpenDisabled: false },
  },
  appVersion: '1.7.0',
  releasesOverride: deepHistory,
});

export const AccordionTargetExpanded = story({
  // Force a mid-list version to expand.
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.7.0', autoOpenDisabled: false },
  },
  appVersion: '1.7.0',
  releasesOverride: deepHistory,
  targetVersion: '1.4.0',
});

export const AccordionDeepHistory = story({
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.0.0', autoOpenDisabled: false },
  },
  appVersion: '1.7.0',
  releasesOverride: deepHistory,
});

export const AccordionWithDates = story({
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.7.0', autoOpenDisabled: false },
  },
  appVersion: '2.0.0',
  releasesOverride: dateSpreadHistory,
});
