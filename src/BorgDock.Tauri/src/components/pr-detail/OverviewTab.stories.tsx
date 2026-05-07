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
import { getControl } from '../../../.storybook/mocks/control';

// ── Play helpers ───────────────────────────────────────────────

function findButton(label: RegExp): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find((b) =>
    label.test(b.textContent ?? ''),
  ) as HTMLButtonElement | undefined;
}

async function waitFor<T>(get: () => T | undefined, timeoutMs = 1500): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = get();
    if (v !== undefined) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('waitFor: timed out');
}

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
  play: async () => {
    const closeBtn = await waitFor(() => findButton(/^close pr$/i));
    closeBtn.click();
    // ConfirmDialog appears — find the confirm button (label = "Close PR", different element)
    const confirmBtn = await waitFor(() =>
      Array.from(document.querySelectorAll('button')).find(
        (b) => /^close pr$/i.test(b.textContent ?? '') && b !== closeBtn,
      ) as HTMLButtonElement | undefined,
    );
    confirmBtn.click();
    await waitFor(() =>
      getControl().invocations.find((i) => i.command === 'prAction.closePr'),
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
  play: async () => {
    const btn = await waitFor(() => findButton(/^merge$/i));
    btn.click();
    await waitFor(() =>
      getControl().invocations.find((i) => i.command === 'prAction.mergePr'),
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
  play: async () => {
    // ActionBar renders "Mark Ready" for draft PRs (isDraft=true)
    const btn = await waitFor(() => findButton(/mark ready/i));
    btn.click();
    await waitFor(() =>
      getControl().invocations.find((i) => i.command === 'prAction.toggleDraftPr'),
    );
  },
};
