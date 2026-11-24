import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));

import { useDiskSpaceStore } from '@/stores/disk-space-store';
import { usePrStore } from '@/stores/pr-store';
import {
  type DiskScene,
  MINI,
  machineDisks,
  machineWorktrees,
  mergedMachinePrs,
} from '../__fixtures__/machines-data';
import { DiskFocusCard } from '../DiskFocusCard';

async function renderCard(scene: DiskScene) {
  useDiskSpaceStore.setState({ hosts: machineDisks(scene), cleanup: {}, error: null });
  const view = render(<DiskFocusCard />);
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('worktree_cache_get_all'));
  return view;
}

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.invoke.mockImplementation(async (command: string) =>
    command === 'worktree_cache_get_all' ? machineWorktrees() : [],
  );
  mocks.listen.mockReset();
  mocks.listen.mockResolvedValue(() => {});
  usePrStore.setState({
    pullRequests: [],
    closedPullRequests: mergedMachinePrs(),
    lastPollTime: new Date(),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('DiskFocusCard', () => {
  it('renders nothing while every disk is healthy', async () => {
    const { container } = await renderCard('healthy');
    expect(container).toBeEmptyDOMElement();
  });

  it('names the host and the disk that is almost full, and starts the cleanup there', async () => {
    const clean = vi.spyOn(useDiskSpaceStore.getState(), 'clean').mockResolvedValue(undefined);
    await renderCard('critical');

    const card = screen.getByRole('region', { name: 'Disk space on Mac mini' });
    expect(card).toHaveAttribute('data-severity', '2');
    expect(screen.getByRole('heading', { name: 'Mac mini is almost full' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Only 4 GiB free on /. Builds and checkouts on this host may start failing.',
      ),
    ).toBeInTheDocument();
    // BorgDock cannot remove a remote host's worktrees.
    expect(screen.queryByRole('button', { name: /Prune/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clean up in T3 on Mac mini' }));
    expect(clean).toHaveBeenCalledWith(MINI);
  });

  it('offers Prune on this machine, and keeps the dialog while it is open', async () => {
    await renderCard('laptop-low');
    expect(screen.getByRole('heading', { name: 'Laptop is low on disk' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Prune 12 worktrees' }));
    expect(screen.getByRole('dialog', { name: 'Prune worktrees' })).toBeInTheDocument();

    // The disk recovers while the dialog is open: the card goes, the dialog stays.
    useDiskSpaceStore.setState({ hosts: machineDisks('healthy') });
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Prune worktrees' })).toBeInTheDocument();
  });

  it('shows why the cleanup could not start', async () => {
    await renderCard('low');
    useDiskSpaceStore.setState({ cleanup: { [MINI]: { error: 'Pair T3 for Mac mini' } } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Pair T3 for Mac mini');
  });
});
