import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { WindowControls } from '@/components/shared/chrome';
import { TitleBar } from '@/components/shared/primitives';
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
          {props.totalAwaiting > 0 && (
            <span className="ag-tb-alert">
              <span className="pulse" />
              {props.totalAwaiting} awaiting input
            </span>
          )}
          <span data-tauri-drag-region className="bd-title-bar__count">
            {props.totalSessions} sessions · {props.totalRepos} repos
          </span>
        </>
      }
      right={
        <>
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
