import type { T3HostRef } from '@/services/t3/api';

export interface DiskSpace {
  drive: string;
  totalBytes: number;
  freeBytes: number;
}

export interface HostDisks {
  id: string;
  label: string;
  disks: DiskSpace[];
  checkedAt: number;
  error: string | null;
  t3Host: T3HostRef | null;
}

export const DISK_POLL_MS = 60_000;
export const DISK_TTL_MS = 180_000;
export const DISK_REMINDER_MS = 6 * 60 * 60 * 1000;
export const CLEAN_DISK_ACTION = 'clean-host-disk';
const GIB = 1024 ** 3;

export function diskSeverity(disk: DiskSpace): 0 | 1 | 2 {
  if (
    !Number.isFinite(disk.totalBytes) ||
    disk.totalBytes <= 0 ||
    !Number.isFinite(disk.freeBytes) ||
    disk.freeBytes < 0
  )
    return 0;
  const percent = (disk.freeBytes / disk.totalBytes) * 100;
  if (percent < 5 || disk.freeBytes < 5 * GIB) return 2;
  if (percent < 10 || disk.freeBytes < 20 * GIB) return 1;
  return 0;
}

export function freeSpaceLabel(disk: DiskSpace): string {
  const gib = disk.freeBytes / GIB;
  return `${gib < 1 ? gib.toFixed(1) : Math.round(gib)} GiB free`;
}

export function freshDisks(host: HostDisks, now = Date.now()): boolean {
  return !host.error && host.disks.length > 0 && now - host.checkedAt <= DISK_TTL_MS;
}

/** The worst severity of a host's disks: 0 healthy, 1 low, 2 critical. */
export function hostSeverity(disks: readonly DiskSpace[]): 0 | 1 | 2 {
  return disks.reduce<0 | 1 | 2>(
    (worst, disk) => Math.max(worst, diskSeverity(disk)) as 0 | 1 | 2,
    0,
  );
}

function holds(drive: string, path: string): boolean {
  if (/^[a-z]:$/i.test(drive)) return path.slice(0, 2).toLowerCase() === drive.toLowerCase();
  return path === drive || path.startsWith(drive.endsWith('/') ? drive : `${drive}/`);
}

/** The measured disk holding `path`: its drive letter, or the longest mount point it sits under. */
export function diskForPath(path: string, disks: readonly DiskSpace[]): DiskSpace | undefined {
  const normalized = path.replace(/\\/g, '/');
  let best: DiskSpace | undefined;
  for (const disk of disks) {
    const drive = disk.drive.replace(/\\/g, '/');
    if (holds(drive, normalized) && drive.length > (best?.drive.length ?? -1)) best = disk;
  }
  return best;
}

export class DiskAlertGate {
  private sent = new Map<string, { hostId: string; severity: number; at: number }>();

  notices(hosts: HostDisks[], now = Date.now()): HostDisks[] {
    const notices: HostDisks[] = [];
    const present = new Set<string>();
    for (const host of hosts) {
      let notify = false;
      for (const disk of host.disks) {
        const key = JSON.stringify([host.id, disk.drive]);
        present.add(key);
        if (!freshDisks(host, now)) continue;
        const severity = diskSeverity(disk);
        if (!severity) {
          this.sent.delete(key);
          continue;
        }
        const previous = this.sent.get(key);
        if (!previous || severity > previous.severity || now - previous.at >= DISK_REMINDER_MS) {
          this.sent.set(key, { hostId: host.id, severity, at: now });
          notify = true;
        } else if (severity < previous.severity) {
          this.sent.set(key, { ...previous, severity });
        }
      }
      if (notify) notices.push(host);
    }
    const hostsById = new Map(hosts.map((host) => [host.id, host]));
    for (const [key, notice] of this.sent) {
      const host = hostsById.get(notice.hostId);
      if (!host || (freshDisks(host, now) && !present.has(key))) this.sent.delete(key);
    }
    return notices;
  }
}

export function cleanupPrompt(host: HostDisks): string {
  const disks = host.disks.filter((disk) => diskSeverity(disk) > 0);
  const measurements = (disks.length ? disks : host.disks)
    .map(
      (disk) =>
        `- ${disk.drive}: ${freeSpaceLabel(disk)}, ${Math.round((disk.freeBytes / disk.totalBytes) * 100)}% free`,
    )
    .join('\n');
  return `Clean up disk space on this host, ${host.label}. This is a host maintenance task without a repository project.\n\nLast measured disk space:\n${measurements}\n\nUse the clean-disk skill if available. Recheck free space and identify the largest reclaimable files first. Preserve active sessions, dirty or untracked work, local configuration, credentials, and recovery data. Clean safe caches and regenerable build output. Before removing worktrees, verify their branches, merge status and local changes. Ask before deleting personal files, unmerged work or anything that cannot be recovered. Report what was removed and measured free space before and after.`;
}
