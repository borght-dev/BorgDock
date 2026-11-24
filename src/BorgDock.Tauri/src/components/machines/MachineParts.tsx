import { Button, type ButtonVariant, Dot, type DotTone } from '@/components/shared/primitives';
import { type CleanupState, useDiskSpaceStore } from '@/stores/disk-space-store';
import type { DiskSeverity } from './machines-model';

const SEVERITY_DOT: Record<DiskSeverity, DotTone> = { 0: 'gray', 1: 'yellow', 2: 'red' };

/** A host's health: grey while healthy, amber when a disk is low, red when critical. */
export function DiskDot({ severity }: { severity: DiskSeverity }) {
  return <Dot tone={SEVERITY_DOT[severity]} size={7} />;
}

export interface CleanUpButtonProps {
  /** The measured host's id: `local` or its SSH target. */
  hostId: string;
  hostName: string;
  cleanup: CleanupState | undefined;
  variant?: ButtonVariant;
  /** What starting the cleanup is called here. */
  label?: string;
}

/**
 * Starts the disk cleanup thread in T3 for a host, and opens it once it
 * exists. The store keeps one thread per host, so every surface that offers
 * the cleanup shows the same state.
 */
export function CleanUpButton({
  hostId,
  hostName,
  cleanup,
  variant = 'primary',
  label = 'Clean up in T3',
}: CleanUpButtonProps) {
  const text = cleanup?.starting ? 'Starting…' : cleanup?.threadId ? 'Open T3' : label;
  return (
    <Button
      variant={variant}
      size="sm"
      loading={cleanup?.starting}
      aria-label={`${text} on ${hostName}`}
      onClick={() => void useDiskSpaceStore.getState().clean(hostId)}
    >
      {text}
    </Button>
  );
}
