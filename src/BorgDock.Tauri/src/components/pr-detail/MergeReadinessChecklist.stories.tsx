// src/components/pr-detail/MergeReadinessChecklist.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { MergeReadinessChecklist } from './MergeReadinessChecklist';
import {
  approvedPr,
  makePr,
  mergeConflictPr,
  PanelFrame,
  withPrDetail,
} from './__fixtures__/pr-detail-data';

const meta: Meta<typeof MergeReadinessChecklist> = {
  title: 'PR Detail/MergeReadinessChecklist',
  component: MergeReadinessChecklist,
  decorators: [(Story) => <PanelFrame><Story /></PanelFrame>],
};
export default meta;
type Story = StoryObj<typeof MergeReadinessChecklist>;

const blockedPr = makePr({
  overallStatus: 'red',
  failedCheckNames: ['CI / lint'],
  passedCount: 2,
  pendingCheckNames: [],
  pullRequest: { reviewStatus: 'approved' },
});

export const AllChecksGreen: Story = {
  decorators: [withPrDetail(approvedPr)],
  args: { pr: approvedPr },
};

export const BlockedByFailingCheck: Story = {
  decorators: [withPrDetail(blockedPr)],
  args: { pr: blockedPr },
};

export const BlockedByMergeConflict: Story = {
  decorators: [withPrDetail(mergeConflictPr)],
  args: { pr: mergeConflictPr },
};
