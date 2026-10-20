import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HostDisks } from '@/services/disk-space';
import { useDiskSpaceStore } from '@/stores/disk-space-store';
import { diskSpaceFixture } from '../__fixtures__/disk-space';
import { WorktreeHostHeader, type WorktreeHostHeaderProps } from '../WorktreeHostHeader';
import type { WorktreeHostGroup } from '../worktree-list-model';

const GIB = 1024 ** 3;
const [LOCAL, MINI, VERA] = diskSpaceFixture() as [HostDisks, HostDisks, HostDisks];

function host(disks: HostDisks): WorktreeHostGroup {
  return { id: disks.id, label: disks.label, remote: disks.id !== 'local', repos: [] };
}

function renderHeader(disks: HostDisks, props: Partial<WorktreeHostHeaderProps> = {}) {
  return render(
    <WorktreeHostHeader
      host={host(disks)}
      disks={disks}
      probeError={null}
      now={Date.now()}
      {...props}
    />,
  );
}

beforeEach(() => {
  useDiskSpaceStore.setState({ hosts: diskSpaceFixture(), cleanup: {}, error: null });
});
afterEach(() => {
  vi.restoreAllMocks();
});

it('shows a meter per disk, coloured only when low, and offers cleanup for that host', () => {
  const clean = vi.spyOn(useDiskSpaceStore.getState(), 'clean').mockResolvedValue(undefined);
  renderHeader(LOCAL);
  expect(screen.getByRole('heading', { name: 'kvdborght' })).toBeInTheDocument();
  expect(screen.getByText('this machine')).toBeInTheDocument();
  const disk = (drive: string) => screen.getByText(drive).closest('[data-severity]');
  expect(disk('C:')).toHaveAttribute('data-severity', '0');
  expect(disk('D:')).toHaveAttribute('data-severity', '1');
  expect(disk('D:')).toHaveTextContent('14 GiB free');
  fireEvent.click(screen.getByRole('button', { name: 'Clean up disk on kvdborght' }));
  expect(clean).toHaveBeenCalledWith('local');
});

it('adds one alert line for a critical disk', () => {
  renderHeader(MINI);
  expect(screen.getByText('mini')).toBeInTheDocument();
  expect(screen.getByText(/Only 3 GiB free on \//)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Clean up disk on Mac mini' })).toHaveAttribute(
    'data-severity',
    '2',
  );
});

it('offers no cleanup while every disk is healthy', () => {
  renderHeader({
    ...LOCAL,
    disks: [{ drive: 'C:', totalBytes: 1024 * GIB, freeBytes: 512 * GIB }],
  });
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByText(/Only/)).toBeNull();
});

it('says when a host could not be measured, and retries the probe', () => {
  const refresh = vi.spyOn(useDiskSpaceStore.getState(), 'refresh').mockResolvedValue(undefined);
  renderHeader(VERA);
  expect(screen.getByText('Disk space unavailable')).toHaveAttribute(
    'title',
    'SSH connection timed out',
  );
  expect(screen.queryByRole('button', { name: /Clean up/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Measure disk space on Vera VM again' }));
  expect(refresh).toHaveBeenCalled();
});

it('discards a stale measurement and shows a cleanup error inline', () => {
  renderHeader({ ...LOCAL, checkedAt: 1 }, { cleanup: { error: 'Pair T3 first' } });
  expect(screen.queryByText('D:')).toBeNull();
  expect(screen.getByText('Disk space unavailable')).toHaveAttribute(
    'title',
    'Last measurement expired',
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Pair T3 first');
});

it('keeps an open cleanup thread reachable after the disk recovers', () => {
  renderHeader(
    { ...LOCAL, disks: [{ drive: 'C:', totalBytes: 1024 * GIB, freeBytes: 512 * GIB }] },
    { cleanup: { threadId: 't1' } },
  );
  expect(
    screen.getByRole('button', { name: 'Open cleanup thread on kvdborght' }),
  ).toHaveTextContent('Open T3');
});
