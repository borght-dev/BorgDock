import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { SegmentedToggle } from './SegmentedToggle';

interface TitlebarProps {
  totalAwaiting: number;
  totalSessions: number;
  totalRepos: number;
  grouping: 'repo' | 'status';
  onGroupingChange: (g: 'repo' | 'status') => void;
  density: 'auto' | 'roomy' | 'standard' | 'wall';
  onDensityChange: (d: 'auto' | 'roomy' | 'standard' | 'wall') => void;
}

export function Titlebar(props: TitlebarProps) {
  const w = getCurrentWebviewWindow();
  return (
    <div className="bd-titlebar">
      <span className="bd-titlebar__title">BorgDock</span>
      <span style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>·</span>
      <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>Agent overview</span>
      {props.totalAwaiting > 0 && (
        <span className="ag-tb-alert">
          <span className="pulse" />
          {props.totalAwaiting} awaiting input
        </span>
      )}
      <span className="bd-titlebar__count">
        {props.totalSessions} sessions · {props.totalRepos} repos
      </span>
      <span style={{ flex: 1 }} />
      <SegmentedToggle
        value={props.grouping}
        onChange={props.onGroupingChange}
        options={[
          { id: 'repo', label: 'Repo' },
          { id: 'status', label: 'Status' },
        ]}
      />
      <SegmentedToggle
        value={props.density}
        onChange={props.onDensityChange}
        options={[
          { id: 'auto', label: 'Auto' },
          { id: 'roomy', label: 'Roomy' },
          { id: 'standard', label: 'Std' },
          { id: 'wall', label: 'Wall' },
        ]}
      />
      <button type="button" className="bd-wc" onClick={() => void w.minimize()}>—</button>
      <button type="button" className="bd-wc" onClick={() => void w.toggleMaximize()}>▢</button>
      <button type="button" className="bd-wc bd-wc--close" onClick={() => void w.close()}>✕</button>
    </div>
  );
}
