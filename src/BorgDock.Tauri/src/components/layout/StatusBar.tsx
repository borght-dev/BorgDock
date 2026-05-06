interface StatusBarProps {
  left: string;
  right: string;
}

/**
 * StatusBar — main-window footer that surfaces per-section status copy.
 * Stateless on purpose: copy is computed by useStatusBar(activeSection)
 * and passed in by the MainWindow shell.
 */
export function StatusBar({ left, right }: StatusBarProps) {
  return (
    <div className="bd-statusbar">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}
