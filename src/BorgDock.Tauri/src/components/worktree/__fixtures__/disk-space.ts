import type { HostDisks } from '@/services/disk-space';

const GIB = 1024 ** 3;

export function diskSpaceFixture(): HostDisks[] {
  return [
    {
      id: 'local',
      label: 'kvdborght',
      checkedAt: Date.now(),
      error: null,
      t3Host: { id: 'local' },
      disks: [
        { drive: 'C:', totalBytes: 1024 * GIB, freeBytes: 128 * GIB },
        { drive: 'D:', totalBytes: 256 * GIB, freeBytes: 14 * GIB },
        { drive: 'E:', totalBytes: 2048 * GIB, freeBytes: 310 * GIB },
      ],
    },
    {
      id: 'mini',
      label: 'Mac mini',
      checkedAt: Date.now(),
      error: null,
      t3Host: { id: 'mini', baseUrl: 'http://mini:3773' },
      disks: [{ drive: '/', totalBytes: 512 * GIB, freeBytes: 3 * GIB }],
    },
    {
      id: 'vera',
      label: 'Vera VM',
      checkedAt: Date.now(),
      error: 'SSH connection timed out',
      t3Host: null,
      disks: [],
    },
  ];
}
