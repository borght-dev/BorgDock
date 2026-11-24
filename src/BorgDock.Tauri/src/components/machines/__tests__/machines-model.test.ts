import { describe, expect, it } from 'vitest';
import { prBranches } from '@/components/worktree/worktree-prune-model';
import { DISK_TTL_MS } from '@/services/disk-space';
import {
  BUILD_BOX,
  MINI,
  machineDisks,
  machineWorktrees,
  mergedMachinePrs,
} from '../__fixtures__/machines-data';
import {
  buildMachines,
  canPrune,
  checkedAgo,
  lastChecked,
  lowDiskCopy,
  machinesLowOnDisk,
  tightestMachine,
  worktreesLine,
} from '../machines-model';

const NOW = Date.parse('2026-11-24T10:00:00Z');
const BRANCHES = prBranches([], mergedMachinePrs(NOW));

function machines(scene: Parameters<typeof machineDisks>[0] = 'low') {
  return buildMachines({
    snapshot: machineWorktrees(),
    measured: machineDisks(scene, NOW),
    probeError: null,
    branches: BRANCHES,
    now: NOW,
  });
}

describe('buildMachines', () => {
  it('lists this machine first, each host with its tightest disk and its worktrees', () => {
    const [laptop, mini] = machines();
    expect(laptop).toMatchObject({
      id: 'local',
      name: 'Laptop',
      remote: false,
      severity: 0,
      worktrees: 41,
      prunable: 12,
    });
    expect(laptop?.tightest?.drive).toBe('C:');
    expect(mini).toMatchObject({
      id: MINI,
      name: 'Mac mini',
      remote: true,
      severity: 1,
      worktrees: 26,
      prunable: 9,
    });
  });

  it('counts nothing as prunable before pull requests were read', () => {
    const [laptop] = buildMachines({
      snapshot: machineWorktrees(),
      measured: machineDisks('low', NOW),
      probeError: null,
      branches: null,
      now: NOW,
    });
    expect(laptop?.prunable).toBe(0);
    expect(worktreesLine(laptop!)).toBe('41 worktrees');
  });

  it('keeps a branch with an open pull request out of the prunable count', () => {
    const [reopened] = mergedMachinePrs(NOW);
    const [laptop] = buildMachines({
      snapshot: machineWorktrees(),
      measured: machineDisks('low', NOW),
      probeError: null,
      branches: prBranches([reopened!], mergedMachinePrs(NOW)),
      now: NOW,
    });
    expect(laptop?.prunable).toBe(11);
  });

  it('says why a host has no measurement: its own error, an expired one, or the probe failing', () => {
    const unreachable = machines('unmeasured').find((m) => m.id === BUILD_BOX);
    expect(unreachable).toMatchObject({ name: 'Build box', disks: [], severity: 0 });
    expect(unreachable?.unavailable).toContain('Connection timed out');

    const [expired] = buildMachines({
      snapshot: machineWorktrees(),
      measured: machineDisks('critical', NOW),
      probeError: null,
      branches: BRANCHES,
      now: NOW + DISK_TTL_MS + 60_000,
    });
    expect(expired).toMatchObject({ unavailable: 'Last measurement expired', severity: 0 });

    const failed = buildMachines({
      snapshot: machineWorktrees(),
      measured: [],
      probeError: 'Probe failed',
      branches: BRANCHES,
      now: NOW,
    });
    expect(failed.map((m) => [m.name, m.unavailable])).toEqual([
      ['This machine', 'Probe failed'],
      ['Mac mini', 'Probe failed'],
    ]);
  });

  it('lists this machine before anything was measured or scanned', () => {
    const [only, ...rest] = buildMachines({
      snapshot: [],
      measured: [],
      probeError: null,
      branches: null,
      now: NOW,
    });
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ id: 'local', name: 'This machine', unavailable: null });
    expect(only?.tightest).toBeUndefined();
  });
});

describe('what the surfaces read', () => {
  it('picks the machine in most trouble for the folded rail', () => {
    expect(tightestMachine(machines('healthy'))?.name).toBe('Laptop');
    expect(tightestMachine(machines('low'))?.name).toBe('Mac mini');
    expect(tightestMachine([])).toBeUndefined();
  });

  it('names only machines with a low or critical disk, the worst first', () => {
    expect(machinesLowOnDisk(machines('healthy'))).toEqual([]);
    expect(machinesLowOnDisk(machines('both-low')).map((m) => m.name)).toEqual([
      'Mac mini',
      'Laptop',
    ]);
  });

  it('prunes on this machine only', () => {
    const [laptop, mini] = machines();
    expect(canPrune(laptop!)).toBe(true);
    expect(canPrune(mini!)).toBe(false);
    expect(canPrune({ ...laptop!, prunable: 0 })).toBe(false);
  });

  it('writes the worktree line', () => {
    const [laptop] = machines();
    expect(worktreesLine(laptop!)).toBe('41 worktrees, 12 with a merged or closed PR');
    expect(worktreesLine({ ...laptop!, worktrees: 1, prunable: 0 })).toBe('1 worktree');
    expect(worktreesLine({ ...laptop!, worktrees: 0, prunable: 0 })).toBe('No worktrees');
  });

  it('words a low disk and a critical one, naming only the disks that are that low', () => {
    const [, low] = machines('low');
    expect(lowDiskCopy(low!)).toEqual({
      title: 'Mac mini is low on disk',
      detail: '18 GiB free on /. Clean up before builds and checkouts start failing.',
    });
    const [, critical] = machines('critical');
    expect(lowDiskCopy(critical!)).toEqual({
      title: 'Mac mini is almost full',
      detail: 'Only 4 GiB free on /. Builds and checkouts on this host may start failing.',
    });
    const [laptop] = machines('laptop-low');
    expect(lowDiskCopy(laptop!).detail).toBe(
      '40 GiB free on D:. Clean up before builds and checkouts start failing.',
    );
  });

  it('tells how long ago the probe answered', () => {
    expect(lastChecked([])).toBeNull();
    expect(lastChecked(machineDisks('low', NOW))).toBe(NOW - 40_000);
    expect(checkedAgo(NOW - 2_000, NOW)).toBe('checked just now');
    expect(checkedAgo(NOW - 40_000, NOW)).toBe('checked 40 s ago');
    expect(checkedAgo(NOW - 4 * 60_000, NOW)).toBe('checked 4 min ago');
    expect(checkedAgo(NOW - 2 * 3_600_000, NOW)).toBe('checked 2 h ago');
    expect(checkedAgo(NOW + 5_000, NOW)).toBe('checked just now');
  });
});
