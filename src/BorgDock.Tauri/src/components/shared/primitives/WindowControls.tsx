import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';

/**
 * WindowControls — minimize / maximize / close trio for custom title bars.
 * Talks to Tauri's window API directly via getCurrentWindow().
 */
export function WindowControls() {
  const win = getCurrentWindow();
  return (
    <div className="bd-window-controls">
      <button
        type="button"
        className="bd-window-control"
        aria-label="Minimize"
        onClick={() => void win.minimize()}
      >
        <Minus size={14} strokeWidth={2.25} />
      </button>
      <button
        type="button"
        className="bd-window-control"
        aria-label="Maximize"
        onClick={() => void win.toggleMaximize()}
      >
        <Square size={12} strokeWidth={2.25} />
      </button>
      <button
        type="button"
        className="bd-window-control bd-window-control--close"
        aria-label="Close"
        onClick={() => void win.close()}
      >
        <X size={14} strokeWidth={2.25} />
      </button>
    </div>
  );
}
