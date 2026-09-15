import clsx from 'clsx';
import { Minus, Square, X } from 'lucide-react';

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
      <button
        type="button"
        className="bd-wc"
        onClick={onMinimize}
        aria-label="Minimize"
        title="Minimize"
      >
        <Minus size={10} strokeWidth={2.9} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="bd-wc"
        onClick={onMaximize}
        aria-label="Maximize"
        title="Maximize"
      >
        <Square size={10} strokeWidth={2.9} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="bd-wc bd-wc--close"
        onClick={onClose}
        aria-label="Close"
        title="Close"
      >
        <X size={10} strokeWidth={2.9} aria-hidden="true" />
      </button>
    </div>
  );
}
