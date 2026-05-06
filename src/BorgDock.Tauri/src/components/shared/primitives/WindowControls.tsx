import { getCurrentWindow } from '@tauri-apps/api/window';

const MinusIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <path d="M4 8h8" />
  </svg>
);

const MaximizeIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <rect x="3" y="3" width="10" height="10" rx="1" />
  </svg>
);

const XIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

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
        <MinusIcon />
      </button>
      <button
        type="button"
        className="bd-window-control"
        aria-label="Maximize"
        onClick={() => void win.toggleMaximize()}
      >
        <MaximizeIcon />
      </button>
      <button
        type="button"
        className="bd-window-control bd-window-control--close"
        aria-label="Close"
        onClick={() => void win.close()}
      >
        <XIcon />
      </button>
    </div>
  );
}
