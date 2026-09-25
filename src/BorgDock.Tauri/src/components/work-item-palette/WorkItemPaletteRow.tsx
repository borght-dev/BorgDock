import clsx from 'clsx';
import { MessageSquare } from 'lucide-react';
import {
  avatarToneFor,
  getInitials,
  MiniAvatar,
  PrioBars,
  StatePill,
  TypeGlyph,
} from '@/components/work-items/shared/wi-visuals';
import type { ResultItem } from '@/hooks/useWorkItemPaletteSearch';

interface Props {
  item: ResultItem;
  isSelected: boolean;
  onMouseEnter: () => void;
  onSelect: (id: number) => void;
}

/**
 * One work item in the palette, on the shared list-row grammar
 * (`.bd-list-row`: hover wash, accent selection bar, tabular numerals).
 * `data-key` lets the palette FLIP rows when the query changes.
 */
export function WorkItemPaletteRow({ item, isSelected, onMouseEnter, onSelect }: Props) {
  const initials = getInitials(item.assignedTo);
  return (
    <div
      data-palette-row
      data-key={`wi-${item.id}`}
      data-selected={isSelected ? 'true' : 'false'}
      className="bd-wp-row bd-list-row"
      onMouseEnter={onMouseEnter}
      onMouseDown={() => onSelect(item.id)}
    >
      <PrioBars prio={item.priority} />
      <TypeGlyph type={item.workItemType} />
      <span className={clsx('bd-wp-row__id', isSelected && 'bd-wp-row__id--selected')}>
        #{item.id}
      </span>
      <span className="bd-wp-row__title">{item.title}</span>
      <span className="bd-wp-row__comments" aria-label={item.commentCount ? 'Comments' : undefined}>
        {item.commentCount ? (
          <>
            <MessageSquare size={10} strokeWidth={2} />
            {item.commentCount}
          </>
        ) : null}
      </span>
      <StatePill state={item.state} compact />
      <MiniAvatar initials={initials} tone={avatarToneFor(initials)} size={18} />
    </div>
  );
}
