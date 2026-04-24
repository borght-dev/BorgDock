import clsx from 'clsx';

export interface WindowControlsProps {
  /** Fires when the minimize button is clicked. No-op if omitted. */
  onMinimize?: () => void;
  /** Fires when the maximize button is clicked. No-op if omitted. */
  onMaximize?: () => void;
  /** Fires when the close button is clicked. No-op if omitted. */
  onClose?: () => void;
  /** Additional class on the container. */
  className?: string;
}

/**
 * WindowControls — native-style minimize/maximize/close cluster for chromeless windows.
 * Renders three icon buttons. Rendered as a `-webkit-app-region: no-drag` group so clicks
 * reach the buttons even when the parent titlebar is a Tauri drag region.
 */
export function WindowControls({
  onMinimize,
  onMaximize,
  onClose,
  className,
}: WindowControlsProps) {
  return (
    <div className={clsx('bd-wc-group', className)}>
      <button type="button" className="bd-wc" onClick={onMinimize} aria-label="Minimize">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1 5h8" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
      <button type="button" className="bd-wc" onClick={onMaximize} aria-label="Maximize">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <rect
            x="1.5"
            y="1.5"
            width="7"
            height="7"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
      </button>
      <button
        type="button"
        className="bd-wc bd-wc--close"
        onClick={onClose}
        aria-label="Close"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path
            d="M2 2l6 6M8 2l-6 6"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
