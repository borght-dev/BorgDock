import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));

import { useDiskSpaceStore } from '@/stores/disk-space-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { WorktreeInfo } from '@/types/worktree';
import {
  type DiskScene,
  MINI,
  machineDisks,
  machineWorktrees,
  mergedMachinePrs,
} from '../__fixtures__/machines-data';
import { RailMachines } from '../RailMachines';

const LAPTOP_REPO = 'D:/dev/storefront';

/** What `list_worktrees` answers for the laptop's repository: the cache's rows, each clean. */
function laptopWorktrees(): WorktreeInfo[] {
  return (machineWorktrees()[0]?.entries ?? []).map((entry) => ({
    ...entry,
    status: 'clean',
    uncommittedCount: 0,
    ahead: 0,
    behind: 0,
    commitSha: '',
  }));
}

function seed(scene: DiskScene = 'low') {
  useDiskSpaceStore.setState({ hosts: machineDisks(scene), cleanup: {}, error: null });
}

async function renderRail(collapsed = false) {
  render(
    <aside className="bd-rail">
      <RailMachines collapsed={collapsed} />
    </aside>,
  );
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('worktree_cache_get_all'));
  return screen.getByRole('button', { name: 'Machines' });
}

async function openCard() {
  fireEvent.click(await renderRail());
  const card = screen.getByRole('dialog', { name: 'Machines' });
  await within(card).findByText('41 worktrees, 12 with a merged or closed PR');
  return card;
}

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === 'worktree_cache_get_all') return machineWorktrees();
    if (command === 'list_worktrees') return laptopWorktrees();
    return undefined;
  });
  mocks.listen.mockReset();
  mocks.listen.mockResolvedValue(() => {});
  seed();
  usePrStore.setState({
    pullRequests: [],
    closedPullRequests: mergedMachinePrs(),
    lastPollTime: new Date(),
  });
  const settings = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: {
      ...settings,
      repos: [
        {
          owner: 'acme',
          name: 'storefront',
          enabled: true,
          worktreeBasePath: LAPTOP_REPO,
          worktreeSubfolder: '.worktrees',
        },
      ],
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('RailMachines', () => {
  it('shows one row per host: its name and the free space of its tightest disk', async () => {
    const block = await renderRail();
    expect(block).toHaveTextContent('Machines');
    const laptop = within(block).getByText('Laptop').closest('.bd-rail__stat');
    expect(laptop).toHaveAttribute('data-tone', 'normal');
    expect(laptop).toHaveTextContent('96 GiB');
    const mini = within(block).getByText('Mac mini').closest('.bd-rail__stat');
    expect(mini).toHaveAttribute('data-tone', 'low');
    expect(mini).toHaveTextContent('18 GiB');
  });

  it('turns a host red when a disk is critical', async () => {
    seed('critical');
    const block = await renderRail();
    expect(within(block).getByText('Mac mini').closest('.bd-rail__stat')).toHaveAttribute(
      'data-tone',
      'critical',
    );
  });

  it('folds to one icon in the worst host’s colour, naming that host on hover', async () => {
    const block = await renderRail(true);
    expect(within(block).queryByText('Laptop')).toBeNull();
    const glyph = block.querySelector('.bd-machines__glyph');
    expect(glyph).toHaveAttribute('data-tone', 'low');
    expect(glyph).toHaveAttribute('title', 'Mac mini · 18 GiB free');
  });

  it('opens the card: every disk with what is free, the worktrees, and when it was checked', async () => {
    const card = await openCard();
    expect(within(card).getByText(/^checked \d+ s ago$/)).toBeInTheDocument();

    const laptop = within(card).getByRole('region', { name: 'Laptop' });
    expect(within(laptop).getByText('this machine')).toBeInTheDocument();
    expect(within(laptop).getByText('C:')).toBeInTheDocument();
    expect(within(laptop).getByText('96 GiB free')).toHaveAttribute('data-tone', 'normal');
    expect(within(laptop).getByText('212 GiB free')).toBeInTheDocument();
    expect(within(laptop).queryByRole('button', { name: /Clean up/ })).toBeNull();

    const mini = within(card).getByRole('region', { name: 'Mac mini' });
    expect(within(mini).getByText('remote')).toBeInTheDocument();
    expect(within(mini).getByText('18 GiB free')).toHaveAttribute('data-tone', 'low');
    expect(
      within(mini).getByText('26 worktrees, 9 with a merged or closed PR'),
    ).toBeInTheDocument();
  });

  it('starts the cleanup for the host that is low, and never prunes a remote host', async () => {
    const clean = vi.spyOn(useDiskSpaceStore.getState(), 'clean').mockResolvedValue(undefined);
    const mini = within(await openCard()).getByRole('region', { name: 'Mac mini' });
    expect(within(mini).queryByRole('button', { name: /Prune/ })).toBeNull();
    fireEvent.click(within(mini).getByRole('button', { name: 'Clean up in T3 on Mac mini' }));
    expect(clean).toHaveBeenCalledWith(MINI);
  });

  it('prunes this machine: the card closes and the dialog opens with the merged ones ticked', async () => {
    const card = await openCard();
    fireEvent.click(within(card).getByRole('button', { name: 'Prune 12 worktrees on Laptop' }));

    expect(screen.queryByRole('dialog', { name: 'Machines' })).toBeNull();
    const dialog = screen.getByRole('dialog', { name: 'Prune worktrees' });
    expect(
      await within(dialog).findByRole('button', { name: 'Remove selected (12)' }),
    ).toBeEnabled();
    expect(mocks.invoke).toHaveBeenCalledWith('list_worktrees', { basePath: LAPTOP_REPO });

    const refresh = vi.spyOn(useDiskSpaceStore.getState(), 'refresh').mockResolvedValue(undefined);
    // The header's × and the footer's Close both close it.
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' })[0]!);
    expect(screen.queryByRole('dialog', { name: 'Prune worktrees' })).toBeNull();
    expect(mocks.invoke).toHaveBeenCalledWith('worktree_cache_refresh');
    expect(refresh).toHaveBeenCalled();
  });

  it('opens the worktrees window from the footer', async () => {
    const card = await openCard();
    fireEvent.click(within(card).getByRole('button', { name: /Open worktrees/ }));
    expect(mocks.invoke).toHaveBeenCalledWith('open_tool_window', { tool: 'worktrees' });
    expect(screen.queryByRole('dialog', { name: 'Machines' })).toBeNull();
  });

  it('says when a host could not be measured, and measures again on Retry', async () => {
    seed('unmeasured');
    const refresh = vi.spyOn(useDiskSpaceStore.getState(), 'refresh').mockResolvedValue(undefined);
    const block = await renderRail();
    expect(within(block).getByText('Build box').closest('.bd-rail__stat')).toHaveTextContent('–');

    fireEvent.click(block);
    const box = within(screen.getByRole('dialog', { name: 'Machines' })).getByRole('region', {
      name: 'Build box',
    });
    expect(within(box).getByText('Disk space unavailable')).toBeInTheDocument();
    expect(within(box).getByText(/Connection timed out/)).toBeInTheDocument();
    expect(within(box).getByText('No worktrees')).toBeInTheDocument();
    fireEvent.click(
      within(box).getByRole('button', { name: 'Measure disk space on Build box again' }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('keeps an open cleanup thread reachable and shows why a cleanup failed', async () => {
    useDiskSpaceStore.setState({
      cleanup: { local: { threadId: 't-1' }, [MINI]: { error: 'Pair T3 for Mac mini' } },
    });
    const card = await openCard();
    expect(within(card).getByRole('button', { name: 'Open T3 on Laptop' })).toBeInTheDocument();
    expect(within(card).getByRole('alert')).toHaveTextContent('Pair T3 for Mac mini');
  });
});
