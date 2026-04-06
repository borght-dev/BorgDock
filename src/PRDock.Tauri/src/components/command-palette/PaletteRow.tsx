import type { ResultItem } from '@/hooks/usePaletteSearch';

export function PaletteRow({
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
      className="flex cursor-pointer items-center justify-between px-4 py-2 transition-colors"
      style={{
        backgroundColor: isSelected ? 'var(--color-accent-subtle)' : 'transparent',
      }}
      onMouseEnter={onMouseEnter}
      onMouseDown={() => onSelect(item.id)}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-[13px] font-bold" style={{ color: 'var(--color-accent)' }}>
          #{item.id}
        </span>
        <span className="truncate text-[13px]" style={{ color: 'var(--color-text-primary)' }}>
          {item.title}
        </span>
      </div>
      <div className="ml-2 flex shrink-0 items-center gap-1.5">
        <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
          {item.workItemType}
        </span>
        <span className="text-[11px] font-semibold" style={{ color: 'var(--color-accent)' }}>
          {item.state}
        </span>
      </div>
    </div>
  );
}
