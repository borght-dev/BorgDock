// src/components/machines/Machines.stories.tsx
//
// Disk health in its three places (design/rail-five/mockups.html, artboards A
// and B): the rail's Machines block, expanded and folded, the card it opens,
// the launch sheet's environment picker, and the card at the top of Focus.
// Hosts, worktrees and pull requests are made up (`__fixtures__/machines-data`).

import type { Meta, StoryObj } from '@storybook/react-vite';
import clsx from 'clsx';
import { type ReactNode, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import {
  LAUNCH_BRANCHES,
  LAUNCH_CATALOGUE,
  MAC_T3_HOST,
  makeDispatchScene,
} from '@/components/dispatch/__fixtures__/dispatch-data';
import { LaunchSheet } from '@/components/dispatch/LaunchSheet';
import { BorgDockLogo } from '@/components/shared/icons';
import type { CleanupState } from '@/stores/disk-space-store';
import { useDiskSpaceStore } from '@/stores/disk-space-store';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { getControl } from '../../../.storybook/mocks/control';
import {
  type DiskScene,
  MINI,
  machineDisks,
  machineWorktrees,
  mergedMachinePrs,
} from './__fixtures__/machines-data';
import { DiskFocusCard } from './DiskFocusCard';
import { RailMachines } from './RailMachines';

interface SceneProps {
  scene?: DiskScene;
  cleanup?: Record<string, CleanupState>;
}

/** Seeds what the main window reads: the disk probe's answer, the worktree cache, the PR list. */
function useScene({ scene = 'low', cleanup = {} }: SceneProps) {
  useState(() => {
    const now = Date.now();
    const ctrl = getControl();
    ctrl.invokeResponses.host_disk_space = () => machineDisks(scene);
    ctrl.invokeResponses.worktree_cache_get_all = machineWorktrees();
    ctrl.invokeResponses.worktree_cache_refresh = machineWorktrees();
    ctrl.invokeResponses.list_worktrees = [];
    useDiskSpaceStore.setState({ hosts: machineDisks(scene, now), cleanup, error: null });
    usePrStore.setState({
      pullRequests: [],
      closedPullRequests: mergedMachinePrs(now),
      lastPollTime: new Date(now),
    });
    return null;
  });
}

function Window({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex h-screen bg-[var(--color-background)]"
      style={{ fontFamily: 'var(--font-ui)' }}
    >
      {children}
    </div>
  );
}

interface RailProps extends SceneProps {
  collapsed?: boolean;
}

function RailHarness({ collapsed = false, ...scene }: RailProps) {
  useScene(scene);
  return (
    <Window>
      <aside
        className={clsx('bd-rail', collapsed && 'bd-rail--collapsed')}
        style={{ width: collapsed ? 56 : 200 }}
      >
        <div className="bd-rail__ws">
          <BorgDockLogo size={18} id="bd-machines-story-logo" />
          {!collapsed && <span className="bd-rail__ws-name">BorgDock</span>}
        </div>
        <div className="bd-rail__foot">
          <RailMachines collapsed={collapsed} />
        </div>
      </aside>
    </Window>
  );
}

const meta: Meta<typeof RailHarness> = {
  title: 'Layout/Rail/Machines',
  component: RailHarness,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof RailHarness>;

const openCard: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: 'Machines' }));
  const card = within(canvasElement.ownerDocument.body).getByRole('dialog', { name: 'Machines' });
  await expect(await within(card).findByText(/^41 worktrees/)).toBeTruthy();
};

/** Artboard A: the laptop healthy, the Mac mini low (18 GiB on /). */
export const Block: Story = {};

/** Every disk healthy: grey dots, no colour. */
export const BlockHealthy: Story = { args: { scene: 'healthy' } };

/** The Mac mini critical (4 GiB): its row turns red. */
export const BlockCritical: Story = { args: { scene: 'critical' } };

/** A third host that could not be reached: a dash where its free space would be. */
export const BlockUnmeasured: Story = { args: { scene: 'unmeasured' } };

/** Folded: one monitor icon, amber because the worst host is low. */
export const Folded: Story = { args: { collapsed: true } };

/** Folded with a critical host: the icon is red. */
export const FoldedCritical: Story = { args: { collapsed: true, scene: 'critical' } };

/** Folded with every disk healthy: the icon has the rail's own colour. */
export const FoldedHealthy: Story = { args: { collapsed: true, scene: 'healthy' } };

/** Artboard B1: the card, with Prune on this machine and Clean up in T3 on the low host. */
export const Card: Story = { play: openCard };

/** The card with the Mac mini critical. */
export const CardCritical: Story = { args: { scene: 'critical' }, play: openCard };

/** The card when a host cannot be measured: it says why and offers Retry. */
export const CardUnmeasured: Story = { args: { scene: 'unmeasured' }, play: openCard };

/** A cleanup thread exists on the Mac mini, and pairing failed for the laptop. */
export const CardCleanup: Story = {
  args: {
    scene: 'laptop-low',
    cleanup: {
      [MINI]: { threadId: 't-cleanup' },
      local: {
        error:
          'Pair T3 for Laptop in Settings, Agents. Use the same host address as its SSH connection.',
      },
    },
  },
  play: openCard,
};

/** The card opened from the folded rail. */
export const CardFromFoldedRail: Story = { args: { collapsed: true }, play: openCard };

function FocusHarness(scene: SceneProps) {
  useScene(scene);
  return (
    <Window>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bd-wb-head">
          <h1 className="bd-wb-head__title">Focus</h1>
        </header>
        <DiskFocusCard />
      </div>
    </Window>
  );
}

/** Artboard B3: the Mac mini almost full, at the top of Focus. */
export const FocusCard: StoryObj<typeof FocusHarness> = {
  render: (args) => <FocusHarness {...args} />,
  args: { scene: 'critical' },
};

/** This machine low: Prune is offered beside the cleanup. */
export const FocusCardThisMachine: StoryObj<typeof FocusHarness> = {
  render: (args) => <FocusHarness {...args} />,
  args: { scene: 'laptop-low' },
};

/** Two hosts at once, the critical one first. */
export const FocusCardTwoHosts: StoryObj<typeof FocusHarness> = {
  render: (args) => <FocusHarness {...args} />,
  args: { scene: 'both-low' },
};

const LAUNCH_ITEM = 60201;

function LaunchHarness({ scene = 'low' }: SceneProps) {
  useScene({ scene });
  const [overview] = useState(() => {
    const dispatch = makeDispatchScene();
    const ctrl = getControl();
    ctrl.invokeResponses.t3_catalogue = LAUNCH_CATALOGUE;
    ctrl.invokeResponses.t3_list_branches = LAUNCH_BRANCHES;
    useSettingsStore.setState((s) => ({
      settings: {
        ...s.settings,
        agents: { ...s.settings.agents, t3Hosts: [MAC_T3_HOST] } as never,
      },
    }));
    // The Mac mini is the T3 environment the dispatch scene calls "Mac".
    useDiskSpaceStore.setState((s) => ({
      hosts: s.hosts.map((host) =>
        host.id === MINI ? { ...host, t3Host: { id: MAC_T3_HOST.id } } : host,
      ),
    }));
    useDispatchStore.setState({
      threads: dispatch.threads,
      projects: dispatch.projects,
      hosts: dispatch.hosts,
      overview: dispatch.overview,
      launch: { itemId: LAUNCH_ITEM },
      launchPreferences: {
        model: null,
        efforts: {},
        mode: 'plan',
        target: { hostId: MAC_T3_HOST.id, repository: 'github.com/acme/shop' },
      },
    });
    return dispatch.overview;
  });
  return (
    <Window>
      <LaunchSheet intent={{ itemId: LAUNCH_ITEM }} overview={overview} />
    </Window>
  );
}

/** Artboard B2: each environment's free space, and the notice once the chosen one is low. */
export const LaunchSheetLowDisk: StoryObj<typeof LaunchHarness> = {
  render: (args) => <LaunchHarness {...args} />,
  args: { scene: 'low' },
};

/** The chosen environment almost full: the notice turns red and says so. */
export const LaunchSheetCriticalDisk: StoryObj<typeof LaunchHarness> = {
  render: (args) => <LaunchHarness {...args} />,
  args: { scene: 'critical' },
};

/** Healthy disks: free space on every environment, no notice. */
export const LaunchSheetHealthy: StoryObj<typeof LaunchHarness> = {
  render: (args) => <LaunchHarness {...args} />,
  args: { scene: 'healthy' },
};
