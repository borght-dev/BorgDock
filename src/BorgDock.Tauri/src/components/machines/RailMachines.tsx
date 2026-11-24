import { Monitor } from 'lucide-react';
import { RailBlock, RailFlyout, RailStat } from '@/components/layout/rail-blocks';
import { freeSpace, freeSpaceLabel } from '@/services/disk-space';
import { DiskDot } from './MachineParts';
import { MachinesCard } from './MachinesCard';
import { type Machine, SEVERITY_TONE, tightestMachine } from './machines-model';
import { openWorktreesWindow, useMachines, useWorktreePrune } from './useMachines';

const CARD_WIDTH = 340;

/** A host's free space in the rail: its tightest disk, or why there is none. */
function freeOf(machine: Machine): string {
  if (machine.tightest) return freeSpace(machine.tightest);
  return machine.unavailable ? '–' : '…';
}

function hint(machine: Machine): string {
  if (machine.tightest) return `${machine.name} · ${freeSpaceLabel(machine.tightest)}`;
  return `${machine.name} · ${machine.unavailable ?? 'measuring disk space'}`;
}

/**
 * RailMachines — the rail's Machines block: one row per host with the free
 * space of its tightest disk, grey while healthy, amber when low, red when
 * critical. Folded, one monitor icon in the worst host's colour. Clicking it
 * opens the Machines card.
 */
export function RailMachines({ collapsed }: { collapsed: boolean }) {
  const { machines, cleanup, checkedAt } = useMachines();
  const prune = useWorktreePrune();
  const worst = tightestMachine(machines);
  if (!worst) return null;

  return (
    <>
      <RailFlyout
        label="Machines"
        width={CARD_WIDTH}
        card={(close) => (
          <MachinesCard
            machines={machines}
            cleanup={cleanup}
            checkedAt={checkedAt}
            onPrune={() => {
              close();
              prune.open();
            }}
            onOpenWorktrees={() => {
              close();
              openWorktreesWindow();
            }}
          />
        )}
      >
        <RailBlock title="Machines">
          {collapsed ? (
            <span
              className="bd-machines__glyph"
              data-tone={SEVERITY_TONE[worst.severity]}
              title={hint(worst)}
            >
              <Monitor size={16} strokeWidth={2} aria-hidden="true" />
            </span>
          ) : (
            machines.map((machine) => (
              <span key={machine.id} className="bd-machines__row" title={hint(machine)}>
                <RailStat
                  lead={<DiskDot severity={machine.severity} />}
                  label={machine.name}
                  value={freeOf(machine)}
                  tone={SEVERITY_TONE[machine.severity]}
                />
              </span>
            ))
          )}
        </RailBlock>
      </RailFlyout>
      {prune.dialog}
    </>
  );
}
