import type { RailTone } from '@/components/layout/rail-blocks';
import {
  flattenSnapshot,
  groupByHost,
  hostDisplayName,
  LOCAL_HOST_ID,
} from '@/components/worktree/worktree-list-model';
import { type PrBranches, pruneStatus } from '@/components/worktree/worktree-prune-model';
import {
  type DiskSpace,
  diskSeverity,
  freeSpaceByDrive,
  freshDisks,
  type HostDisks,
  hostSeverity,
  tightestDisk,
} from '@/services/disk-space';
import type { WorktreeSnapshot } from '@/types/worktree';

/**
 * Pure model behind the rail's Machines block, its card and the Focus card:
 * one machine per host, joined from the disk probe and the worktree cache.
 * Design: design/rail-five/mockups.html, artboards A and B.
 */

export type DiskSeverity = 0 | 1 | 2;

export interface Machine {
  /** `local`, or the SSH target: the id the disk probe and the cleanup go by. */
  id: string;
  name: string;
  remote: boolean;
  /** Fresh measurements; empty while the host is not measured. */
  disks: DiskSpace[];
  /** Why there is no measurement; null while measured and before the first probe answers. */
  unavailable: string | null;
  severity: DiskSeverity;
  /** The disk the rail shows: the one closest to running out. */
  tightest: DiskSpace | undefined;
  /** Linked worktrees on the host, each repository's main one left out. */
  worktrees: number;
  /** Of those, the ones whose pull request was merged or closed. */
  prunable: number;
}

export interface MachineSources {
  snapshot: WorktreeSnapshot;
  measured: readonly HostDisks[];
  /** The probe itself failed, for every host. */
  probeError: string | null;
  /** Null until pull requests were read once: nothing counts as prunable. */
  branches: PrBranches | null;
  now: number;
}

/** This machine first, then remote hosts by name; this machine is always listed. */
export function buildMachines({
  snapshot,
  measured,
  probeError,
  branches,
  now,
}: MachineSources): Machine[] {
  const { entries, errors } = flattenSnapshot(snapshot);
  const known = measured.map(({ id, label }) => ({ id, label }));
  if (!known.some((host) => host.id === LOCAL_HOST_ID))
    known.push({ id: LOCAL_HOST_ID, label: '' });

  return groupByHost(entries, errors, known).map((host) => {
    const measurement = measured.find((m) => m.id === host.id);
    const fresh = measurement !== undefined && freshDisks(measurement, now);
    const disks = fresh ? measurement.disks : [];
    const linked = host.repos.flatMap((repo) => repo.entries).filter((e) => !e.wt.isMainWorktree);
    return {
      id: host.id,
      name: hostDisplayName(host, measurement),
      remote: host.remote,
      disks,
      unavailable:
        probeError ??
        (measurement && !fresh ? (measurement.error ?? 'Last measurement expired') : null),
      severity: hostSeverity(disks),
      tightest: tightestDisk(disks),
      worktrees: linked.length,
      prunable: linked.filter((e) => pruneStatus(e.repo, e.wt.branchName, branches) === 'closed')
        .length,
    };
  });
}

export const SEVERITY_TONE: Record<DiskSeverity, RailTone> = {
  0: 'normal',
  1: 'low',
  2: 'critical',
};

/** The machine in most trouble: the worst severity, then the least free space. */
export function tightestMachine(machines: readonly Machine[]): Machine | undefined {
  return [...machines].sort(
    (a, b) =>
      b.severity - a.severity ||
      (a.tightest?.freeBytes ?? Number.POSITIVE_INFINITY) -
        (b.tightest?.freeBytes ?? Number.POSITIVE_INFINITY),
  )[0];
}

/** Machines with a low or critical disk, the worst first. */
export function machinesLowOnDisk(machines: readonly Machine[]): Machine[] {
  return machines.filter((m) => m.severity > 0).sort((a, b) => b.severity - a.severity);
}

/** BorgDock removes worktrees on this machine only; a remote host's are read-only. */
export function canPrune(machine: Machine): boolean {
  return !machine.remote && machine.prunable > 0;
}

/** "41 worktrees, 12 with a merged or closed PR". */
export function worktreesLine({ worktrees, prunable }: Machine): string {
  if (worktrees === 0) return 'No worktrees';
  const count = `${worktrees} worktree${worktrees === 1 ? '' : 's'}`;
  return prunable > 0 ? `${count}, ${prunable} with a merged or closed PR` : count;
}

/** What the Focus card says of a machine with a low or critical disk. */
export function lowDiskCopy(machine: Machine): { title: string; detail: string } {
  const affected = machine.disks.filter((disk) => diskSeverity(disk) === machine.severity);
  if (machine.severity === 2)
    return {
      title: `${machine.name} is almost full`,
      detail: `Only ${freeSpaceByDrive(affected)}. Builds and checkouts on this host may start failing.`,
    };
  return {
    title: `${machine.name} is low on disk`,
    detail: `${freeSpaceByDrive(affected)}. Clean up before builds and checkouts start failing.`,
  };
}

/** When the probe last answered for any host; null before the first answer. */
export function lastChecked(measured: readonly HostDisks[]): number | null {
  return measured.length > 0 ? Math.max(...measured.map((host) => host.checkedAt)) : null;
}

/** "checked just now", "checked 40 s ago", "checked 4 min ago", "checked 2 h ago". */
export function checkedAgo(checkedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - checkedAt) / 1000));
  if (seconds < 5) return 'checked just now';
  if (seconds < 60) return `checked ${seconds} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `checked ${minutes} min ago`;
  return `checked ${Math.floor(minutes / 60)} h ago`;
}
