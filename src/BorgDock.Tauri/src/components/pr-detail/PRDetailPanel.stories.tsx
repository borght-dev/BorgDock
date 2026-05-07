// src/components/pr-detail/PRDetailPanel.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { PrDetailPanel } from './PRDetailPanel';
import {
  closedPr,
  mergedPr,
  openPr,
  PanelFrame,
  withPrDetail,
} from './__fixtures__/pr-detail-data';

const meta: Meta<typeof PrDetailPanel> = {
  title: 'PR Detail/PRDetailPanel',
  component: PrDetailPanel,
  decorators: [(Story) => <PanelFrame><Story /></PanelFrame>],
};
export default meta;
type Story = StoryObj<typeof PrDetailPanel>;

export const Default: Story = {
  decorators: [withPrDetail(openPr)],
  args: { pr: openPr, popOutWindow: true },
};

export const EmbeddedInSidebar: Story = {
  decorators: [withPrDetail(openPr)],
  args: { pr: openPr, popOutWindow: false },
};

export const Merged: Story = {
  decorators: [withPrDetail(mergedPr)],
  args: { pr: mergedPr, popOutWindow: true },
};

export const Closed: Story = {
  decorators: [withPrDetail(closedPr)],
  args: { pr: closedPr, popOutWindow: true },
};
