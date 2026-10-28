import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { userEvent, within } from 'storybook/test';
import { MAC_T3_HOST, makeDispatchScene } from '@/components/dispatch/__fixtures__/dispatch-data';
import { makePr } from '@/components/pr-detail/__fixtures__/pr-detail-data';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useT3ThreadStore } from '@/stores/t3-thread-store';
import { T3PrThreadDialog } from './T3PrThreadDialog';

function Harness({ branch }: { branch: string }) {
  useState(() => {
    const scene = makeDispatchScene();
    useDispatchStore.setState({
      threads: scene.threads,
      projects: scene.projects,
      hosts: scene.hosts,
    });
    useSettingsStore.setState((s) => ({
      settings: {
        ...s.settings,
        agents: { ...s.settings.agents, t3Hosts: [MAC_T3_HOST] } as never,
      },
    }));
    const { pullRequest } = makePr({
      pullRequest: {
        number: 5483,
        title: 'Order list keeps its scroll position after a refresh',
        headRef: branch,
        repoOwner: 'acme',
        repoName: 'shop',
        htmlUrl: 'https://github.com/acme/shop/pull/5483',
      },
    });
    useT3ThreadStore.setState({ pendingPr: pullRequest });
    return null;
  });
  return <T3PrThreadDialog />;
}

const meta: Meta<typeof Harness> = {
  title: 'Pull Requests/Open in T3',
  component: Harness,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof Harness>;

/** The default: T3 checks the pull request's branch out, here. */
export const CheckOut: Story = { args: { branch: 'feat/60240-pricebook-margins' } };

/** An earlier thread already works on the branch: open it, or start a new thread in its checkout. */
export const ExistingThread: Story = {
  args: { branch: 'fix/60214-order-list-scroll' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'Existing thread' }));
  },
};
