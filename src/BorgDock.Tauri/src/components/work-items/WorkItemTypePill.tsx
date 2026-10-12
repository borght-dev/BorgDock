import clsx from 'clsx';
import { WI_TYPES } from '@/components/work-items/shared/wi-visuals';

/** Tone of a type pill: Bug red, Task amber, every other type neutral. */
export function workItemTypeTone(type: string): 'bug' | 'task' | 'neutral' {
  if (type === 'Bug') return 'bug';
  if (type === 'Task') return 'task';
  return 'neutral';
}

/**
 * The pill's text: the known short name, else the type itself, and for a type
 * of several words its initials ("Quality Improvement" becomes "QI").
 */
export function workItemTypeLabel(type: string): string {
  const known = WI_TYPES[type]?.short;
  if (known) return known;
  const words = type.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.map((word) => word[0]?.toUpperCase()).join('');
  return type || 'Item';
}

/**
 * WorkItemTypePill — the work item type as a small outlined pill ("Bug",
 * "Task", "Story", "PBI"), shared by the Workbench row and the detail header.
 * Colours come from the status tokens (styles/work-items-workbench.css).
 */
export function WorkItemTypePill({ type, className }: { type: string; className?: string }) {
  const label = workItemTypeLabel(type);
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
