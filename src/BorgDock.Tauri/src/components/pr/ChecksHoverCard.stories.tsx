// The checks hover card on a PR row's check bar
// (design/check-hover/mockups.html): failing checks with why they failed,
// then running, passed and skipped. The `InRow` stories hover the real bar.

import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { useCiFailuresStore } from '@/stores/ci-failures-store';
import { usePrStore } from '@/stores/pr-store';
import type { PullRequestWithChecks } from '@/types';
import { getControl } from '../../../.storybook/mocks/control';
import {
  failingPr,
  failingPrFailures,
  runningPr,
  sharedGroup,
} from './__fixtures__/checks-card-data';
import { listPr } from './__fixtures__/pr-list-data';
import { ChecksCardView } from './ChecksHoverCard';
import { checksCardData } from './checks-card-data';
import { PrRow } from './PrRow';

const meta: Meta = {
  title: 'PR/Checks hover card',
  globals: { theme: 'dark' },
};
export default meta;
type Story = StoryObj;

function Card({
  pr,
  failures,
  collecting = true,
}: {
  pr: PullRequestWithChecks;
  failures: ReturnType<typeof failingPrFailures> | null;
  collecting?: boolean;
}) {
  const group = sharedGroup();
  return (
    <div style={{ padding: 24 }}>
      <div className="bd-hover-card" style={{ width: 420 }}>
        <ChecksCardView
          pr={pr}
          data={checksCardData(pr, failures, collecting)}
          sharedOf={(jobId) => (jobId === 502 ? group : undefined)}
          actions={null}
        />
      </div>
    </div>
  );
}

export const Failing: Story = {
  render: () => <Card pr={failingPr()} failures={failingPrFailures()} />,
};

export const RunningLight: Story = {
  globals: { theme: 'light' },
  render: () => <Card pr={runningPr()} failures={null} />,
};

export const ReadingLog: Story = {
  render: () => <Card pr={failingPr()} failures={{ occurrences: [], groups: [] }} />,
};

export const RelatedFailuresOff: Story = {
  render: () => <Card pr={failingPr()} failures={null} collecting={false} />,
};

/** Rows of the list around the PR under the pointer. */
function rows(focus: PullRequestWithChecks): PullRequestWithChecks[] {
  const now = Date.parse('2026-10-29T10:00:00Z');
  const before = listPr(
    {
      number: 4790,
      title: 'Work orders: bulk reassign from the list view',
      repo: 'Gomocha-FLOW/FSP',
      checks: { total: 18 },
      reviewStatus: 'approved',
    },
    now,
  );
  const after = listPr(
    {
      number: 4774,
      title: 'Mobile: offline queue retries with backoff',
      repo: 'Gomocha-FLOW/FSP',
      author: 'tsmit',
      isDraft: true,
      checks: { total: 12 },
    },
    now,
  );
  return [before, focus, after];
}

function InRowList({ focus }: { focus: PullRequestWithChecks }) {
  getControl().invokeResponses.ci_load_pr = failingPrFailures();
  useCiFailuresStore.setState({ groups: [sharedGroup()], loaded: true });
  usePrStore.setState({ username: 'koen', pullRequests: rows(focus) });
  return (
    <div style={{ width: 720, minHeight: 760, padding: '16px 0' }}>
      {rows(focus).map((pr) => (
        <PrRow key={pr.pullRequest.number} prWithChecks={pr} animateKey={false} />
      ))}
    </div>
  );
}

async function hoverChecks(canvasElement: HTMLElement, prNumber: number) {
  const row = canvasElement.querySelector(`[data-pr-number="${prNumber}"]`) as HTMLElement;
  await userEvent.hover(within(row).getByLabelText(/failing|running|passing/));
  await waitFor(() =>
    expect(document.querySelector(`[data-checks-card="${prNumber}"]`)).toBeTruthy(),
  );
}

export const InRowFailing: Story = {
  render: () => <InRowList focus={failingPr()} />,
  play: async ({ canvasElement }) => {
    await hoverChecks(canvasElement, 4812);
    await waitFor(() =>
      expect(document.body.textContent).toContain('AssertionError: expected 412 to be 380'),
    );
  },
};

export const InRowRunningLight: Story = {
  globals: { theme: 'light' },
  render: () => <InRowList focus={runningPr()} />,
  play: async ({ canvasElement }) => {
    await hoverChecks(canvasElement, 4801);
  },
};
