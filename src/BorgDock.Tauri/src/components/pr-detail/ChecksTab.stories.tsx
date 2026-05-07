// src/components/pr-detail/ChecksTab.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CheckRun } from '@/types';
import { ChecksTab } from './ChecksTab';
import {
  makePr,
  PanelFrame,
  withPrDetail,
} from './__fixtures__/pr-detail-data';

const meta: Meta<typeof ChecksTab> = {
  title: 'PR Detail/ChecksTab',
  component: ChecksTab,
  decorators: [(Story) => <PanelFrame><Story /></PanelFrame>],
};
export default meta;
type Story = StoryObj<typeof ChecksTab>;

const allPending: CheckRun[] = ['build', 'test', 'lint'].map((name, i) => ({
  id: 3000 + i,
  name: `CI / ${name}`,
  status: i === 2 ? 'queued' : 'in_progress',
  htmlUrl: '#',
  checkSuiteId: 9100,
}));

const allGreen: CheckRun[] = ['build', 'test', 'lint'].map((name, i) => ({
  id: 4000 + i,
  name: `CI / ${name}`,
  status: 'completed',
  conclusion: 'success',
  htmlUrl: '#',
  checkSuiteId: 9101,
}));

const mixed: CheckRun[] = [
  { id: 5001, name: 'CI / build', status: 'completed', conclusion: 'success', htmlUrl: '#', checkSuiteId: 9102 },
  { id: 5002, name: 'CI / test', status: 'completed', conclusion: 'success', htmlUrl: '#', checkSuiteId: 9102 },
  { id: 5003, name: 'CI / lint', status: 'completed', conclusion: 'failure', htmlUrl: '#', checkSuiteId: 9102 },
  { id: 5004, name: 'CI / typecheck', status: 'completed', conclusion: 'success', htmlUrl: '#', checkSuiteId: 9102 },
  { id: 5005, name: 'CI / e2e', status: 'completed', conclusion: 'failure', htmlUrl: '#', checkSuiteId: 9102 },
  { id: 5006, name: 'CI / docs', status: 'completed', conclusion: 'success', htmlUrl: '#', checkSuiteId: 9102 },
];

const allFailed: CheckRun[] = ['build', 'test', 'lint', 'typecheck', 'e2e', 'docs'].map(
  (name, i) => ({
    id: 6000 + i,
    name: `CI / ${name}`,
    status: 'completed',
    conclusion: 'failure',
    htmlUrl: '#',
    checkSuiteId: 9103,
  }),
);

const allPendingPr = makePr({
  checks: allPending,
  overallStatus: 'yellow',
  pendingCheckNames: allPending.map((c) => c.name),
  passedCount: 0,
});

const allGreenPr = makePr({
  checks: allGreen,
  overallStatus: 'green',
  passedCount: allGreen.length,
  pendingCheckNames: [],
});

const mixedPr = makePr({
  checks: mixed,
  overallStatus: 'red',
  passedCount: mixed.filter((c) => c.conclusion === 'success').length,
  failedCheckNames: mixed.filter((c) => c.conclusion === 'failure').map((c) => c.name),
  pendingCheckNames: [],
});

const allFailedPr = makePr({
  checks: allFailed,
  overallStatus: 'red',
  passedCount: 0,
  failedCheckNames: allFailed.map((c) => c.name),
  pendingCheckNames: [],
});

const noChecksPr = makePr({
  checks: [],
  overallStatus: 'gray',
  passedCount: 0,
  pendingCheckNames: [],
});

export const AllPending: Story = {
  decorators: [withPrDetail(allPendingPr)],
  args: { checks: allPending, pr: allPendingPr },
};

export const AllGreen: Story = {
  decorators: [withPrDetail(allGreenPr)],
  args: { checks: allGreen, pr: allGreenPr },
};

export const MixedSuccessFailure: Story = {
  decorators: [withPrDetail(mixedPr)],
  args: { checks: mixed, pr: mixedPr },
};

export const AllFailedExpandable: Story = {
  decorators: [withPrDetail(allFailedPr)],
  args: { checks: allFailed, pr: allFailedPr },
};

export const NoChecks: Story = {
  decorators: [withPrDetail(noChecksPr)],
  args: { checks: [], pr: noChecksPr },
};
