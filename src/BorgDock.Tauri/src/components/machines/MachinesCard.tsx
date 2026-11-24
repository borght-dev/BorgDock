import { Fragment, useEffect, useState } from 'react';
import { RailCard, RailMeter } from '@/components/layout/rail-blocks';
import { Button, Kbd } from '@/components/shared/primitives';
import { diskSeverity, freeSpaceLabel, usedPercent } from '@/services/disk-space';
import { type CleanupState, useDiskSpaceStore } from '@/stores/disk-space-store';
import { CleanUpButton, DiskDot } from './MachineParts';
import { canPrune, checkedAgo, type Machine, SEVERITY_TONE, worktreesLine } from './machines-model';

/** How often "checked … ago" moves while the card is open. */
const AGO_TICK_MS = 10_000;

function useNow(everyMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return now;
}

interface MachineGroupProps {
  machine: Machine;
  cleanup: CleanupState | undefined;
  onPrune: () => void;
}

function MachineGroup({ machine, cleanup, onPrune }: MachineGroupProps) {
  const offersCleanup = machine.severity > 0 || Boolean(cleanup?.starting || cleanup?.threadId);
  const prunes = canPrune(machine);
  return (
    <section className="bd-railcard__group" aria-label={machine.name} data-machine={machine.id}>
      <h3 className="bd-machines__name">
        <DiskDot severity={machine.severity} />
        {machine.name}
        <span className="bd-machines__where">{machine.remote ? 'remote' : 'this machine'}</span>
      </h3>
      {machine.disks.length > 0 && (
        <div className="bd-machines__disks">
          {machine.disks.map((disk) => {
            const tone = SEVERITY_TONE[diskSeverity(disk)];
            return (
              <Fragment key={disk.drive}>
                <span className="bd-machines__drive" title={disk.drive}>
                  {disk.drive}
                </span>
                <RailMeter value={usedPercent(disk)} tone={tone} />
                <span className="bd-machines__free" data-tone={tone}>
                  {freeSpaceLabel(disk)}
                </span>
              </Fragment>
            );
          })}
        </div>
      )}
      {machine.unavailable && (
        <div className="bd-machines__unavailable">
          <span className="bd-machines__reason" title={machine.unavailable}>
            Disk space unavailable
            <span>{machine.unavailable.split('\n')[0]}</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Measure disk space on ${machine.name} again`}
            onClick={() => void useDiskSpaceStore.getState().refresh()}
          >
            Retry
          </Button>
        </div>
      )}
      <span className="bd-railcard__dim">{worktreesLine(machine)}</span>
      {(offersCleanup || prunes) && (
        <div className="bd-machines__actions">
          {offersCleanup && (
            <CleanUpButton
              hostId={machine.id}
              hostName={machine.name}
              cleanup={cleanup}
              // A thread left from an earlier cleanup stays reachable, quietly, once the disk is healthy.
              variant={machine.severity > 0 ? 'primary' : 'secondary'}
            />
          )}
          {prunes && (
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Prune ${machine.prunable} worktrees on ${machine.name}`}
              onClick={onPrune}
            >
              Prune {machine.prunable}
            </Button>
          )}
        </div>
      )}
      {cleanup?.error && (
        <p className="bd-machines__error" role="alert">
          {cleanup.error}
        </p>
      )}
    </section>
  );
}

export interface MachinesCardProps {
  machines: readonly Machine[];
  cleanup: Record<string, CleanupState>;
  checkedAt: number | null;
  /** Prune this machine's worktrees: the dialog covers the window, so the card closes first. */
  onPrune: () => void;
  /** Open the worktrees tool window. */
  onOpenWorktrees: () => void;
}

/**
 * MachinesCard — what the rail's Machines block opens: per host its disks
 * with a meter each, how many worktrees it holds and how many of them a
 * merged or closed pull request left behind, Clean up in T3 once a disk is
 * low, and Prune on this machine.
 */
export function MachinesCard({
  machines,
  cleanup,
  checkedAt,
  onPrune,
  onOpenWorktrees,
}: MachinesCardProps) {
  const now = useNow(AGO_TICK_MS);
  return (
    <RailCard
      title="Machines"
      meta={checkedAt !== null ? checkedAgo(checkedAt, now) : undefined}
      footer={
        <button
          type="button"
          className="bd-railcard__link bd-machines__open"
          onClick={onOpenWorktrees}
        >
          Open worktrees
          <Kbd>Ctrl+F7</Kbd>
        </button>
      }
    >
      {machines.map((machine) => (
        <MachineGroup
          key={machine.id}
          machine={machine}
          cleanup={cleanup[machine.id]}
          onPrune={onPrune}
        />
      ))}
    </RailCard>
  );
}
