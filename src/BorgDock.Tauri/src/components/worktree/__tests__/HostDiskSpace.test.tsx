import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useDiskSpaceStore } from '@/stores/disk-space-store';
import { diskSpaceFixture } from '../__fixtures__/disk-space';

vi.mock('@/hooks/useDiskSpace', () => ({ useDiskSpace: () => {} }));

import { HostDiskSpace } from '../HostDiskSpace';

beforeEach(() => {
  useDiskSpaceStore.setState({ hosts: diskSpaceFixture(), cleanup: {}, error: null });
});

it('shows each host, drive, warning and offline state, and targets cleanup to the chosen host', async () => {
  const clean = vi.spyOn(useDiskSpaceStore.getState(), 'clean').mockResolvedValue(undefined);
  render(<HostDiskSpace />);
  expect(screen.getByText('kvdborght')).toBeInTheDocument();
  expect(screen.getByText('D: 14 GiB free').closest('[data-severity]')).toHaveAttribute(
    'data-severity',
    '1',
  );
  expect(screen.getByText('/ 3 GiB free').closest('[data-severity]')).toHaveAttribute(
    'data-severity',
    '2',
  );
  expect(screen.getByText('Disk space unavailable')).toHaveAttribute(
    'title',
    'SSH connection timed out',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Clean up disk on Mac mini' }));
  expect(clean).toHaveBeenCalledWith('mini');
  clean.mockRestore();
});

it('discards stale measurements and shows cleanup errors inline', () => {
  useDiskSpaceStore.setState({
    hosts: [{ ...diskSpaceFixture()[0]!, checkedAt: 1 }],
    cleanup: { local: { error: 'Pair T3 first' } },
  });
  render(<HostDiskSpace />);
  expect(screen.queryByText('D: 14 GiB free')).not.toBeInTheDocument();
  expect(screen.getByText('Disk space unavailable')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Pair T3 first');
});
