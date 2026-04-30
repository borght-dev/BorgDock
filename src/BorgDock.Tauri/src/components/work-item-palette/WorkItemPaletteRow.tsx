import clsx from 'clsx';
import type { ResultItem } from '@/hooks/useWorkItemPaletteSearch';

export function WorkItemPaletteRow({
  item,
  isSelected,
  onMouseEnter,
  onSelect,
}: {
  item: ResultItem;
  isSelected: boolean;
  onMouseEnter: () => void;
  onSelect: (id: number) => void;
}) {
  return (
    <div
      data-palette-row
      className={clsx(
        'flex cursor-pointer items-center justify-between px-4 py-2 transition-colors',
        isSelected
          ? 'bg-[var(--color-accent-subtle)]'
          : 'bg-transparent hover:bg-[var(--color-surface-hover)]',
      )}
      onMouseEnter={onMouseEnter}
      onMouseDown={() => onSelect(item.id)}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-[13px] font-bold text-[var(--color-accent)]">
          #{item.id}
        </span>
        <span className="truncate text-[13px] text-[var(--color-text-primary)]">
          {item.title}
        </span>
      </div>
      <div className="ml-2 flex shrink-0 items-center gap-1.5">
        <span className="text-[11px] text-[var(--color-text-tertiary)]">
          {item.workItemType}
        </span>
        <span className="text-[11px] font-semibold text-[var(--color-accent)]">
          {item.state}
        </span>
      </div>
    </div>
  );
}
