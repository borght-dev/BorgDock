import { Pill } from '@/components/shared/primitives';

export type WorkItemType = 'Bug' | 'User Story' | 'Task' | 'Feature' | string;

export interface WorkItemRowData {
  id: number;
  type: WorkItemType;
  title: string;
  state: string;
  priority?: number;
  isWorking: boolean;
  isTracked: boolean;
}

interface Props {
  item: WorkItemRowData;
  selected: boolean;
  onClick: () => void;
  onToggleTracked: () => void;
  onToggleWorking: () => void;
}

const TYPE_TONE: Record<string, 'error' | 'neutral' | 'warning'> = {
  Bug: 'error',
  'User Story': 'neutral',
  Task: 'warning',
  Feature: 'neutral',
};

export function WorkItemRow({
  item,
  selected,
  onClick,
  onToggleTracked,
  onToggleWorking,
}: Props) {
  return (
    <div
      className={`bd-wi-row${selected ? ' bd-wi-row--selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="bd-wi-row__top">
        <Pill tone={TYPE_TONE[item.type] ?? 'neutral'}>{item.type}</Pill>
        <span className="bd-mono bd-wi-row__id">AB#{item.id}</span>
        <span className="bd-spacer" />
        {item.isWorking && <Pill tone="neutral">working</Pill>}
        <span className="bd-wi-row__actions">
          <button
            type="button"
            data-pr-card-action
            className={`bd-wi-row__action${item.isTracked ? ' bd-wi-row__action--on' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleTracked();
            }}
            aria-label={item.isTracked ? 'Untrack' : 'Track'}
            title={item.isTracked ? 'Untrack' : 'Track'}
          >
            ★
          </button>
          <button
            type="button"
            data-pr-card-action
            className={`bd-wi-row__action${item.isWorking ? ' bd-wi-row__action--on' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleWorking();
            }}
            aria-label={item.isWorking ? 'Stop working on' : 'Start working on'}
            title={item.isWorking ? 'Stop working on' : 'Start working on'}
          >
            ●
          </button>
        </span>
      </div>
      <div className="bd-wi-row__title">{item.title}</div>
      <div className="bd-meta bd-wi-row__meta">
        <span>{item.state}</span>
        {item.priority !== undefined && (
          <>
            <span className="sep">·</span>
            <span>P{item.priority}</span>
          </>
        )}
      </div>
    </div>
  );
}
