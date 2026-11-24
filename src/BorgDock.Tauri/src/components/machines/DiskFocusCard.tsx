import { Button } from '@/components/shared/primitives';
import { CleanUpButton, DiskDot } from './MachineParts';
import { canPrune, lowDiskCopy, machinesLowOnDisk } from './machines-model';
import { useMachines, useWorktreePrune } from './useMachines';

/**
 * DiskFocusCard — a host that is running out of disk, at the top of Focus:
 * which disk, what is left, Clean up in T3 and, on this machine, Prune. It
 * stays until the disk recovers and renders nothing while every disk is
 * healthy.
 */
export function DiskFocusCard() {
  const { machines, cleanup } = useMachines();
  const prune = useWorktreePrune();

  return (
    <>
      {machinesLowOnDisk(machines).map((machine) => {
        const { title, detail } = lowDiskCopy(machine);
        const error = cleanup[machine.id]?.error;
        return (
          <section
            key={machine.id}
            className="bd-machines-fcard"
            aria-label={`Disk space on ${machine.name}`}
            data-machine={machine.id}
            data-severity={machine.severity}
          >
            <h2 className="bd-machines-fcard__title">
              <DiskDot severity={machine.severity} />
              {title}
            </h2>
            <p className="bd-machines-fcard__detail">{detail}</p>
            <div className="bd-machines__actions">
              <CleanUpButton
                hostId={machine.id}
                hostName={machine.name}
                cleanup={cleanup[machine.id]}
              />
              {canPrune(machine) && (
                <Button variant="ghost" size="sm" onClick={prune.open}>
                  Prune {machine.prunable} worktree{machine.prunable === 1 ? '' : 's'}
                </Button>
              )}
            </div>
            {error && (
              <p className="bd-machines__error" role="alert">
                {error}
              </p>
            )}
          </section>
        );
      })}
      {prune.dialog}
    </>
  );
}
