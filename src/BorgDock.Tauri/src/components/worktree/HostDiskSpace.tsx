import { AlertTriangle, HardDrive } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Pill } from '@/components/shared/primitives';
import { useDiskSpace } from '@/hooks/useDiskSpace';
import { DISK_POLL_MS, diskSeverity, freeSpaceLabel, freshDisks } from '@/services/disk-space';
import { useDiskSpaceStore } from '@/stores/disk-space-store';

export function HostDiskSpace() {
  useDiskSpace();
  const hosts = useDiskSpaceStore((s) => s.hosts);
  const error = useDiskSpaceStore((s) => s.error);
  const cleanup = useDiskSpaceStore((s) => s.cleanup);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), DISK_POLL_MS);
    return () => clearInterval(timer);
  }, []);
  if (error)
    return (
      <div className="bd-host-disks" role="status">
        Disk space unavailable.{' '}
        <Button
          variant="ghost"
          size="sm"
          title={error}
          onClick={() => void useDiskSpaceStore.getState().refresh()}
        >
          Retry
        </Button>
      </div>
    );
  if (hosts.length === 0) return null;
  return (
    <div className="bd-host-disks" aria-label="Disk space by host">
      {hosts.map((host) => {
        const fresh = freshDisks(host, now);
        const state = cleanup[host.id];
        return (
          <div key={host.id} className="bd-host-disks__host">
            <div className="bd-host-disks__row">
              <HardDrive size={13} aria-hidden="true" />
              <span className="bd-host-disks__name">{host.label}</span>
              {fresh ? (
                host.disks.map((disk) => {
                  const severity = diskSeverity(disk);
                  return (
                    <Pill
                      key={disk.drive}
                      tone={severity === 2 ? 'error' : severity === 1 ? 'warning' : 'neutral'}
                      icon={
                        severity > 0 ? <AlertTriangle size={11} aria-hidden="true" /> : undefined
                      }
                      className="bd-host-disks__disk"
                      data-severity={severity}
                      title={`${disk.drive}: ${freeSpaceLabel(disk)} of ${Math.round(disk.totalBytes / 1024 ** 3)} GiB. Warning below 10% or 20 GiB; critical below 5% or 5 GiB.`}
                    >
                      <span>
                        {disk.drive} {freeSpaceLabel(disk)}
                      </span>
                    </Pill>
                  );
                })
              ) : (
                <span
                  className="bd-host-disks__unavailable"
                  title={host.error ?? 'Last measurement expired'}
                >
                  Disk space unavailable
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="bd-host-disks__clean"
                aria-label={`${state?.threadId ? 'Open cleanup thread' : 'Clean up disk'} on ${host.label}`}
                loading={state?.starting}
                onClick={() => void useDiskSpaceStore.getState().clean(host.id)}
              >
                {state?.starting ? 'Starting…' : state?.threadId ? 'Open T3' : 'Clean up in T3'}
              </Button>
            </div>
            {state?.error && (
              <p className="bd-host-disks__error" role="alert">
                {state.error}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
