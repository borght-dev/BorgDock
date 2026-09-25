import clsx from 'clsx';
import { WI_TYPES } from '@/components/work-items/shared/wi-visuals';

/** Tone of a type pill: Bug red, Task amber, every other type neutral. */
export function workItemTypeTone(type: string): 'bug' | 'task' | 'neutral' {
  if (type === 'Bug') return 'bug';
  if (type === 'Task') return 'task';
  return 'neutral';
}

/**
 * WorkItemTypePill — the work item type as a small outlined pill ("Bug",
 * "Task", "Story", "PBI"), shared by the Workbench row and the detail header.
 * Colours come from the status tokens (styles/work-items-workbench.css).
 */
export function WorkItemTypePill({ type, className }: { type: string; className?: string }) {
  const label = WI_TYPES[type]?.short ?? (type || 'Item');
  return (
    <span
      className={clsx('bd-wi-type', className)}
      data-type-tone={workItemTypeTone(type)}
      title={type}
    >
      {label}
    </span>
  );
}
