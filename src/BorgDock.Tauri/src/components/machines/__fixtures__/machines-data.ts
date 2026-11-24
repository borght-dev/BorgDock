import { listPr } from '@/components/pr/__fixtures__/pr-list-data';
import type { HostDisks } from '@/services/disk-space';
import type { PullRequestWithChecks } from '@/types';
import type { WorktreeCacheRepo, WorktreeSnapshot } from '@/types/worktree';

// Made-up hosts for stories and tests, with the numbers of the design
// (design/rail-five/mockups.html, artboards A and B).

const GIB = 1024 ** 3;
const LAPTOP_REPO = 'D:/dev/storefront';
const MINI_REPO = '/Users/dev/storefront';
/** The SSH target the Mac mini is measured and listed under. */
export const MINI = 'dev@mini.example.com';
/** A host whose probe fails. */
export const BUILD_BOX = 'ci@build.example.com';

/**
 * `low`: the Mac mini has 18 GiB left. `critical`: 4 GiB. `laptop-low`: this
 * machine's D: instead. `both-low`: D: low and the Mac mini critical.
 * `unmeasured`: `low`, plus a host that cannot be reached.
 */
export type DiskScene = 'healthy' | 'low' | 'critical' | 'unmeasured' | 'laptop-low' | 'both-low';

const LAPTOP_LOW: readonly DiskScene[] = ['laptop-low', 'both-low'];
const MINI_FREE_GIB: Record<DiskScene, number> = {
  healthy: 140,
  low: 18,
  critical: 4,
  unmeasured: 18,
  'laptop-low': 140,
  'both-low': 4,
};

function laptop(checkedAt: number, scene: DiskScene): HostDisks {
  return {
    id: 'local',
    label: 'Laptop',
    checkedAt,
    error: null,
    t3Host: { id: 'local' },
    disks: [
      { drive: 'C:', totalBytes: 256 * GIB, freeBytes: 96 * GIB },
      {
        drive: 'D:',
        totalBytes: 476 * GIB,
        freeBytes: (LAPTOP_LOW.includes(scene) ? 40 : 212) * GIB,
      },
    ],
  };
}

function mini(checkedAt: number, scene: DiskScene): HostDisks {
  return {
    id: MINI,
    label: 'Mac mini',
    checkedAt,
    error: null,
    t3Host: { id: 'mini', baseUrl: 'http://mini.example.com:3773' },
    disks: [{ drive: '/', totalBytes: 256 * GIB, freeBytes: MINI_FREE_GIB[scene] * GIB }],
  };
}

function buildBox(checkedAt: number): HostDisks {
  return {
    id: BUILD_BOX,
    label: 'Build box',
    checkedAt,
    error: 'ssh: connect to host build.example.com port 22: Connection timed out',
    t3Host: null,
    disks: [],
  };
}

/** What `host_disk_space` answers: the laptop, the Mac mini, and for `unmeasured` a host that cannot be reached. */
export function machineDisks(scene: DiskScene = 'low', now: number = Date.now()): HostDisks[] {
  const checkedAt = now - 40_000;
  const hosts = [laptop(checkedAt, scene), mini(checkedAt, scene)];
  return scene === 'unmeasured' ? [...hosts, buildBox(checkedAt)] : hosts;
}

function repository(
  basePath: string,
  linked: number,
  remote?: WorktreeCacheRepo['repo']['remote'],
): WorktreeCacheRepo {
  return {
    repo: { owner: 'acme', name: 'storefront', basePath, remote },
    entries: [
      { path: basePath, branchName: 'main', isMainWorktree: true },
      ...Array.from({ length: linked }, (_, i) => ({
        path: `${basePath}/.worktrees/worktree${i + 1}`,
        branchName: `${remote ? 'mini' : 'laptop'}/change-${i + 1}`,
        isMainWorktree: false,
      })),
    ],
    fetchedAt: 0,
  };
}

/** 41 worktrees on the laptop and 26 on the Mac mini, one repository each. */
export function machineWorktrees(): WorktreeSnapshot {
  return [
    repository(LAPTOP_REPO, 41),
    repository(MINI_REPO, 26, { id: 'mini-storefront', label: 'Mac mini', sshTarget: MINI }),
  ];
}

function mergedPr(number: number, headRef: string, now: number): PullRequestWithChecks {
  const pr = listPr(
    { number, title: `Merged change ${number}`, repo: 'acme/storefront', mergedHoursAgo: 5 },
    now,
  );
  return { ...pr, pullRequest: { ...pr.pullRequest, headRef } };
}

/** Merged pull requests for 12 of the laptop's branches and 9 of the Mac mini's. */
export function mergedMachinePrs(now: number = Date.now()): PullRequestWithChecks[] {
  return [
    ...Array.from({ length: 12 }, (_, i) => mergedPr(400 + i, `laptop/change-${i + 1}`, now)),
    ...Array.from({ length: 9 }, (_, i) => mergedPr(500 + i, `mini/change-${i + 1}`, now)),
  ];
}
