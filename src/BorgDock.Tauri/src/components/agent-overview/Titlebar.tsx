import type { CSSProperties } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { WindowControls } from '@/components/shared/chrome';
import { TitleBar } from '@/components/shared/primitives';
import { fmtSinceShort, timeSinceTier } from '@/services/agent-overview';

export type Grouping = 'repo' | 'status' | 'worktree' | 'context' | 'activity';

const GROUPING_OPTIONS: Array<{ id: Grouping; label: string }> = [
  { id: 'repo', label: 'By repo' },
  { id: 'status', label: 'By status' },
  { id: 'worktree', label: 'By worktree' },
  { id: 'context', label: 'By context use' },
  { id: 'activity', label: 'By activity' },
];

interface TitlebarProps {
  oldestAwaitingMs: number | null;
  totalAwaiting: number;
  liveSessions: number;
  grouping: Grouping;
  onGroupingChange: (g: Grouping) => void;
}

export function Titlebar({
  oldestAwaitingMs,
  totalAwaiting,
  liveSessions,
  grouping,
  onGroupingChange,
}: TitlebarProps) {
  const w = getCurrentWebviewWindow();
  return (
    <TitleBar
      data-tauri-drag-region
      left={
        <>
          <span data-tauri-drag-region className="bd-title-bar__title">
            BorgDock
          </span>
          <span data-tauri-drag-region style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>
            ·
          </span>
          <span
            data-tauri-drag-region
            style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontWeight: 500 }}
          >
            Agent overview
          </span>
          {totalAwaiting > 0 && oldestAwaitingMs !== null && (
            <OldestAgePill totalAwaiting={totalAwaiting} oldestMs={oldestAwaitingMs} />
          )}
          <span data-tauri-drag-region className="bd-title-bar__count">
            {liveSessions} live
          </span>
        </>
      }
      right={
        <>
          <GroupingDropdown value={grouping} onChange={onGroupingChange} />
          <WindowControls
            onMinimize={() => void w.minimize()}
            onMaximize={() => void w.toggleMaximize()}
            onClose={() => void w.close()}
          />
        </>
      }
    />
  );
}

function OldestAgePill({ totalAwaiting, oldestMs }: { totalAwaiting: number; oldestMs: number }) {
  const tier = timeSinceTier(oldestMs);
  return (
    <span
      data-testid="titlebar-oldest-age"
      className={`ag-tb-alert ag-tb-alert--${tier}`}
      title={`${totalAwaiting} session${totalAwaiting === 1 ? '' : 's'} awaiting input`}
    >
      <span className="pulse" />
      {totalAwaiting} awaiting · oldest {fmtSinceShort(oldestMs)}
    </span>
  );
}

function GroupingDropdown({
  value,
  onChange,
}: {
  value: Grouping;
  onChange: (g: Grouping) => void;
}) {
  return (
    <label
      className="ag-grouping-select"
      style={
        {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 10,
          color: 'var(--color-text-muted)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          // Selects sit inside the draggable titlebar — opt out so clicks land.
          WebkitAppRegion: 'no-drag',
        } as CSSProperties
      }
    >
      Group
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Grouping)}
        aria-label="Grouping"
        style={{
          height: 22,
          padding: '0 22px 0 9px',
          border: '1px solid var(--color-subtle-border)',
          borderRadius: 999,
          background: 'var(--color-surface)',
          color: 'var(--color-accent)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 'normal',
          textTransform: 'none',
          fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        {GROUPING_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
