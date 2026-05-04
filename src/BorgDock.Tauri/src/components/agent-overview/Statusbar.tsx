import type { SessionRecord, SessionState } from '@/services/agent-overview-types';
import type { Grouping } from './Titlebar';

const GROUPING_LABEL: Record<Grouping, string> = {
  repo: 'Grouped by repo',
  status: 'Grouped by status',
  worktree: 'Grouped by worktree',
  context: 'Grouped by context use',
  activity: 'Sorted by activity',
};

interface StatusbarProps {
  records: SessionRecord[];
  grouping: Grouping;
  archivedCount: number;
  showArchived: boolean;
  onToggleArchived: () => void;
}

export function Statusbar({
  records,
  grouping,
  archivedCount,
  showArchived,
  onToggleArchived,
}: StatusbarProps) {
  const c = (s: SessionState) => records.filter((r) => r.state === s).length;
  return (
    <div className="bd-statusbar">
      <span>{GROUPING_LABEL[grouping]}</span>
      <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Stat tone="yellow" label="awaiting" n={c('awaiting')} />
        <Stat tone="violet" label="working" n={c('working')} />
        <Stat tone="violet" label="tool" n={c('tool')} />
        <Stat tone="green" label="finished" n={c('finished')} />
        <Stat tone="gray" label="idle" n={c('idle') + c('ended')} />
        {archivedCount > 0 && (
          <button
            type="button"
            data-testid="statusbar-archived-toggle"
            onClick={onToggleArchived}
            style={{
              background: 'transparent',
              border: 0,
              padding: 0,
              color: 'var(--color-text-tertiary)',
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
              fontSize: 'inherit',
              fontFamily: 'inherit',
            }}
          >
            {showArchived ? `hide ${archivedCount} archived` : `${archivedCount} archived`}
          </button>
        )}
      </span>
    </div>
  );
}

function Stat({ tone, label, n }: { tone: string; label: string; n: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span className={`bd-dot bd-dot--${tone}`} style={{ width: 6, height: 6 }} />
      {label} {n}
    </span>
  );
}
