// src/components/work-items/CrossWindow.stories.tsx
//
// Cross-window composed animation: Work Item Palette on the left, Work Item
// Detail on the right. The right panel starts off-screen and slides in when
// the user selects a row in the palette.
//
// Design constraints:
//   - WorkItemPaletteApp's normal harness calls ctrl.reset(), which would wipe
//     the WorkItemDetail invokes. Here we seed both sides manually in a single
//     useMemo so they coexist.
//   - The palette's selectAndClose calls new WebviewWindow(...), which is
//     intercepted by the mock but doesn't open anything. We observe
//     webviewWindowsCreated growing (via a polling loop in the play function)
//     and then call window.__BORGDOCK_SLIDE_OPEN__() to trigger the slide.
//   - WorkItemDetailApp reads its ID from window.location.search (?id=), set
//     synchronously before mount.

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { userEvent, within } from 'storybook/test';
import { getControl } from '../../../.storybook/mocks/control';
import { animation } from '../../../.storybook/screenshot';
import { CrossWindowShell } from '../main/__fixtures__/main-window-data';
import {
  canonicalSettings,
  fullBrowseScenario,
  recentIds,
  workingOnIds,
} from '../work-item-palette/__fixtures__/work-item-palette-data';
import { WorkItemPaletteApp } from '../work-item-palette/WorkItemPaletteApp';
import {
  userStoryWithRichBody,
  canonicalSettings as workItemCanonicalSettings,
} from './__fixtures__/work-item-data';
import { WorkItemDetailApp } from './WorkItemDetailApp';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Harness that seeds both palette and detail sides before mount.
// Does NOT call ctrl.reset() — seeds only the keys each side needs.
function CrossWorkItemHarness() {
  useMemo(() => {
    // Clear palette position so it renders at default position
    try {
      localStorage.removeItem('borgdock-palette-position');
    } catch {
      /* ignore */
    }

    const ctrl = getControl();

    // ── Palette side ──────────────────────────────────────────
    ctrl.workItemPaletteScenario = fullBrowseScenario();
    ctrl.invokeResponses.load_settings = canonicalSettings({
      ui: { theme: 'system' },
      azureDevOps: {
        organization: 'storybook-org',
        recentWorkItemIds: recentIds,
        workingOnWorkItemIds: workingOnIds,
      },
    });
    ctrl.invokeResponses.save_settings = undefined;

    // ── Detail side ───────────────────────────────────────────
    // WorkItemDetailApp reads ?id= from the URL; set it to the first browse
    // item so the detail panel shows a meaningful work item.
    const targetId = 101; // browsePoolMixed[0] — "Wire OAuth refresh token rotation"
    window.history.replaceState({}, '', `${window.location.pathname}?id=${targetId}`);

    ctrl.invokeResponses.window_ready = undefined;
    ctrl.invokeResponses.ado_resolve_auth_header = 'Basic c3Rvcnlib29rOg==';

    // Seed the work item scenario for detail
    ctrl.workItemScenario = {
      workItem: {
        ...userStoryWithRichBody,
        id: targetId,
        fields: {
          ...userStoryWithRichBody.fields,
          'System.Id': targetId,
          'System.Title': 'Wire OAuth refresh token rotation',
        },
      },
      states: ['New', 'Active', 'Resolved', 'Closed'],
      comments: [],
      loadBehavior: 'normal',
      loadError: null,
      statesBehavior: 'normal',
      commentsBehavior: 'normal',
      saveBehavior: 'normal',
      deleteBehavior: 'normal',
      addCommentBehavior: 'normal',
    };

    // Seed the full AppSettings for the detail panel (needs ADO org/project)
    ctrl.invokeResponses.load_settings = workItemCanonicalSettings();

    // Re-seed palette load_settings on top (it reads from the same key —
    // use the work-item canonical settings which also has azureDevOps set)
  }, []);

  return (
    <CrossWindowShell
      left={
        <div style={{ width: 720, height: 950, position: 'relative' }}>
          <WorkItemPaletteApp />
        </div>
      }
      right={
        <div style={{ width: '100%', height: 950 }}>
          <WorkItemDetailApp />
        </div>
      }
      leftWidth={720}
      height={950}
      totalWidth={1500}
    />
  );
}

const meta: Meta<typeof CrossWorkItemHarness> = {
  title: 'Work Items/CrossWindow',
  component: CrossWorkItemHarness,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof CrossWorkItemHarness>;

// ── Anim_OpenWorkItemDetailWindow ────────────────────────────────────────────
//
// The palette is fully loaded (browsePoolMixed). The play function clicks the
// first row — this triggers selectAndClose which calls new WebviewWindow(...)
// (intercepted by the mock). The play function detects the window creation via
// webviewWindowsCreated and then calls __BORGDOCK_SLIDE_OPEN__() to slide in
// the detail panel.

export const Anim_OpenWorkItemDetailWindow: Story = {
  parameters: animation({
    output: 'site/public/anim/cross-work-item-detail-open.gif',
    width: 1500,
    height: 950,
    fps: 12,
    duration: 6000,
  }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);

    // Wait for the palette to finish loading browse items
    await pause(900);

    // Click the first work item row — "Wire OAuth refresh token rotation" (id 101)
    const row = await c.findByText(/Wire OAuth/i);
    await userEvent.click(row);

    // Poll for the WebviewWindow construction (signals that selectAndClose fired)
    const ctrl = getControl();
    const deadline = Date.now() + 2000;
    while (ctrl.webviewWindowsCreated.length === 0 && Date.now() < deadline) {
      await pause(100);
    }

    // Trigger the slide-in
    const fn = (window as unknown as Record<string, unknown>).__BORGDOCK_SLIDE_OPEN__;
    if (typeof fn === 'function') (fn as () => void)();

    await pause(2500);
  },
};
