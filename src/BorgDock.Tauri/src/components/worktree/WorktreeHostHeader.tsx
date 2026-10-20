import { AlertTriangle, Monitor, Server } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/shared/primitives';
import { useDiskSpace } from '@/hooks/useDiskSpace';
import {
  DISK_POLL_MS,
  type DiskSpace,
  diskSeverity,
  freeSpaceLabel,
  freshDisks,
  type HostDisks,
  hostSeverity,
} from '@/services/disk-space';
import { type CleanupState, useDiskSpaceStore } from '@/stores/disk-space-store';
import type { WorktreeHostGroup } from './worktree-list-model';

const GIB = 1024 ** 3;

/** Disk space per host while the list is mounted, re-checked for staleness every poll. */
export function useHostDisks() {
  useDiskSpace();
  const hosts = useDiskSpaceStore((s) => s.hosts);
  const error = useDiskSpaceStore((s) => s.error);
  const cleanup = useDiskSpaceStore((s) => s.cleanup);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), DISK_POLL_MS);
    return () => clearInterval(timer);
  }, []);
  return { hosts, error, cleanup, now };
}

function DiskMeter({ disk }: { disk: DiskSpace }) {
  const used = disk.totalBytes > 0 ? (1 - disk.freeBytes / disk.totalBytes) * 100 : 0;
  return (
    <span
      className="bd-wth__disk"
      data-severity={diskSeverity(disk)}
      title={`${disk.drive}: ${freeSpaceLabel(disk)} of ${Math.round(disk.totalBytes / GIB)} GiB. Warning below 10% or 20 GiB; critical below 5% or 5 GiB.`}
    >
      <span className="bd-wth__drive">{disk.drive}</span>
      <span className="bd-wth__meter" aria-hidden="true">
        <span style={{ width: `${used}%` }} />
      </span>
      <span className="bd-wth__free">{freeSpaceLabel(disk)}</span>
    </span>
  );
}

/** The name a host goes by: what the disk probe calls it, its remote label, or this machine. */
export function hostDisplayName(host: WorktreeHostGroup, disks?: HostDisks): string {
  return disks?.label || host.label || 'This machine';
}

export interface WorktreeHostHeaderProps {
  host: WorktreeHostGroup;
  /** The host's last measurement; absent until the first probe answers. */
  disks?: HostDisks;
  /** The probe itself failed, for every host. */
  probeError: string | null;
  cleanup?: CleanupState;
  now: number;
}

/**
 * The head of one host's worktrees: its name and where it is, a meter per
 * disk (grey while healthy, amber when low, red when critical), and Clean up
 * in T3 only once a disk runs low. A critical disk adds one alert line; a
 * host that could not be measured says so and offers Retry.
 */
export function WorktreeHostHeader({
  host,
  disks,
  probeError,
  cleanup,
  now,
}: WorktreeHostHeaderProps) {
  const label = hostDisplayName(host, disks);
  const measured = disks && freshDisks(disks, now) ? disks.disks : null;
  const unavailable =
    probeError ?? (disks && !measured ? (disks.error ?? 'Last measurement expired') : null);
  const severity = measured ? hostSeverity(measured) : 0;
  const critical = measured?.filter((disk) => diskSeverity(disk) === 2) ?? [];
  const offersCleanup = severity > 0 || cleanup?.starting || cleanup?.threadId;

  return (
    <div className="bd-wth" data-key={`host:${host.id}`} data-severity={severity}>
      <div className="bd-wth__bar">
        {host.remote ? (
          <Server size={14} strokeWidth={2.25} aria-hidden="true" className="bd-wth__icon" />
        ) : (
          <Monitor size={14} strokeWidth={2.25} aria-hidden="true" className="bd-wth__icon" />
        )}
        <h2 className="bd-wth__name">{label}</h2>
        <span className="bd-wth__where" data-remote={host.remote ? 'true' : undefined}>
          {host.remote ? host.id : 'this machine'}
        </span>
        <span className="bd-wth__disks" aria-label={`Disk space on ${label}`}>
          {measured?.map((disk) => (
            <DiskMeter key={disk.drive} disk={disk} />
          ))}
          {unavailable && (
            <span className="bd-wth__unavailable" title={unavailable}>
              Disk space unavailable
              <span className="bd-wth__reason">{unavailable.split('\n')[0]}</span>
            </span>
          )}
        </span>
        {offersCleanup ? (
          <Button
            variant={severity === 2 ? 'secondary' : 'ghost'}
            size="sm"
            className="bd-wth__clean"
            data-severity={severity}
            aria-label={`${cleanup?.threadId ? 'Open cleanup thread' : 'Clean up disk'} on ${label}`}
            loading={cleanup?.starting}
            onClick={() => void useDiskSpaceStore.getState().clean(host.id)}
          >
            {cleanup?.starting ? (
              'Starting…'
            ) : cleanup?.threadId ? (
              'Open T3'
            ) : (
              <span>
                Clean up<span className="bd-wth__long"> in T3</span>
              </span>
            )}
          </Button>
        ) : (
          unavailable && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Measure disk space on ${label} again`}
              onClick={() => void useDiskSpaceStore.getState().refresh()}
            >
              Retry
            </Button>
          )
        )}
      </div>
      {critical.length > 0 && (
        <p className="bd-wth__alert">
          <AlertTriangle size={12} strokeWidth={2.25} aria-hidden="true" />
          Only {critical.map((disk) => `${freeSpaceLabel(disk)} on ${disk.drive}`).join(', ')}.
          Builds and checkouts on this host may start failing.
        </p>
      )}
      {cleanup?.error && (
        <p className="bd-wth__error" role="alert">
          {cleanup.error}
        </p>
      )}
    </div>
  );
}
