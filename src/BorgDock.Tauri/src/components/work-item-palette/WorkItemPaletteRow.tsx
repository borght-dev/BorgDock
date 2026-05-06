import {
  MiniAvatar,
  PrioBars,
  StatePill,
  TypeGlyph,
  avatarToneFor,
  getInitials,
} from '@/components/work-items/shared/wi-visuals';
import type { ResultItem } from '@/hooks/useWorkItemPaletteSearch';

interface Props {
  item: ResultItem;
  isSelected: boolean;
  onMouseEnter: () => void;
  onSelect: (id: number) => void;
}

export function WorkItemPaletteRow({ item, isSelected, onMouseEnter, onSelect }: Props) {
  const initials = getInitials(item.assignedTo);
  return (
    <div
      data-palette-row
      onMouseEnter={onMouseEnter}
      onMouseDown={() => onSelect(item.id)}
      style={{
        display: 'grid',
        gridTemplateColumns: '16px 14px 78px 1fr auto auto 18px',
        columnGap: 10,
        alignItems: 'center',
        padding: '7px 14px',
        paddingLeft: isSelected ? 12 : 14,
        cursor: 'pointer',
        background: isSelected ? 'var(--color-selected-row-bg)' : 'transparent',
        borderLeft: isSelected
          ? '2px solid var(--color-accent)'
          : '2px solid transparent',
        borderBottom: '1px solid var(--color-subtle-border)',
      }}
    >
      <PrioBars prio={item.priority} />
      <TypeGlyph type={item.workItemType} />
      <span
        className="bd-mono"
        style={{
          fontSize: 11.5,
          color: isSelected ? 'var(--color-accent)' : 'var(--color-text-muted)',
          fontWeight: isSelected ? 600 : 400,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        #{item.id}
      </span>
      <span
        style={{
          fontSize: 12.5,
          color: 'var(--color-text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontWeight: isSelected ? 500 : 400,
        }}
      >
        {item.title}
      </span>
      <span
        aria-label={item.commentCount ? 'Comments' : undefined}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 10,
          color: 'var(--color-text-faint)',
          fontVariantNumeric: 'tabular-nums',
          minWidth: 14,
        }}
      >
        {item.commentCount ? (
          <>
            <svg width={10} height={10} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3}>
              <path d="M2 4a2 2 0 012-2h8a2 2 0 012 2v6a2 2 0 01-2 2H7l-3 3v-3H4a2 2 0 01-2-2V4z" strokeLinejoin="round" />
            </svg>
            {item.commentCount}
          </>
        ) : null}
      </span>
      <StatePill state={item.state} compact />
      <MiniAvatar initials={initials} tone={avatarToneFor(initials)} size={18} />
    </div>
  );
}
