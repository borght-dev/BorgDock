// src/components/pr-detail/OverviewTab.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { OverviewTab } from './OverviewTab';
import { PrDetailPanel } from './PRDetailPanel';
import {
  approvedPr,
  changesRequestedPr,
  draftPr,
  mergeConflictPr,
  openPr,
  PanelFrame,
  staleChecksPr,
  withPrDetail,
} from './__fixtures__/pr-detail-data';
import { expect, waitFor, within } from 'storybook/test';
import { getControl } from '../../../.storybook/mocks/control';

// ── Meta ───────────────────────────────────────────────────────

const meta: Meta<typeof OverviewTab> = {
  title: 'PR Detail/OverviewTab',
  component: OverviewTab,
  decorators: [(Story) => <PanelFrame><Story /></PanelFrame>],
};
export default meta;
type Story = StoryObj<typeof OverviewTab>;

// ── Static-axis stories ────────────────────────────────────────

export const OpenWithChecksRunning: Story = {
  decorators: [withPrDetail(openPr)],
  args: { pr: openPr },
  // Play: click "Close PR" in the ActionBar → confirm dialog → assert prAction.closePr.
  // The OverviewTab itself contains no action buttons; they live in the ActionBar above it
  // inside PRDetailPanel. This story renders only OverviewTab (the tab body), so the
  // click-through play function targets a PRDetailPanel render via the `render` override below.
};

export const OpenWithChecksRunningInteractive: Story = {
  name: 'OpenWithChecksRunning — Close flow',
  decorators: [withPrDetail(openPr)],
  // Override the rendered component to PRDetailPanel so the ActionBar is present.
  render: (args) => <PrDetailPanel pr={args.pr} />,
  args: { pr: openPr },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Click the "Close PR" button in the ActionBar.
    const closeBtn = await canvas.findByRole('button', { name: /^close pr$/i });
    closeBtn.click();
    // ConfirmDialog renders inline (not a portal) — wait for React to commit
    // the confirmClose=true state update, then find the dialog button.
    await new Promise((r) => setTimeout(r, 100));
    const allCloseBtns = within(document.body).queryAllByRole('button', { name: /^close pr$/i });
    const dialogBtn =
      (allCloseBtns.find((b) => b.closest('[role="dialog"], [aria-modal="true"]')) ??
        allCloseBtns[allCloseBtns.length - 1])!;
    dialogBtn.click();
    await waitFor(() =>
      expect(getControl().invocations.find((i) => i.command === 'prAction.closePr')).toBeDefined(),
    );
  },
};

export const OpenAllGreenMergeable: Story = {
  decorators: [withPrDetail(approvedPr)],
  args: { pr: approvedPr },
};

export const OpenAllGreenMergeableInteractive: Story = {
  name: 'OpenAllGreenMergeable — Merge flow',
  decorators: [withPrDetail(approvedPr)],
  render: (args) => <PrDetailPanel pr={args.pr} />,
  args: { pr: approvedPr },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const mergeBtn = await canvas.findByRole('button', { name: /^merge$/i });
    mergeBtn.click();
    await waitFor(() =>
      expect(getControl().invocations.find((i) => i.command === 'prAction.mergePr')).toBeDefined(),
    );
  },
};

export const ChangesRequested: Story = {
  decorators: [withPrDetail(changesRequestedPr)],
  args: { pr: changesRequestedPr },
};

export const MergeConflict: Story = {
  decorators: [withPrDetail(mergeConflictPr)],
  args: { pr: mergeConflictPr },
};

export const StaleChecks: Story = {
  name: 'StaleChecks (placeholder — production has no stale rendering yet)',
  decorators: [withPrDetail(staleChecksPr)],
  args: { pr: staleChecksPr },
  // note: production currently has no stale-check rendering — the OverviewTab and
  // MergeReadinessChecklist do not compare CheckRun data against PR.headSha. This
  // story is visually identical to OpenWithChecksRunning and is a placeholder for
  // a future feature that renders an "out-of-date checks" indicator.
};

export const Draft: Story = {
  decorators: [withPrDetail(draftPr)],
  args: { pr: draftPr },
};

export const DraftInteractive: Story = {
  name: 'Draft — Mark ready flow',
  decorators: [withPrDetail(draftPr)],
  render: (args) => <PrDetailPanel pr={args.pr} />,
  args: { pr: draftPr },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // ActionBar renders "Mark Ready" for draft PRs (isDraft=true).
    const markReadyBtn = await canvas.findByRole('button', { name: /mark ready/i });
    markReadyBtn.click();
    await waitFor(() =>
      expect(
        getControl().invocations.find((i) => i.command === 'prAction.toggleDraftPr'),
      ).toBeDefined(),
    );
  },
};
