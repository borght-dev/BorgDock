import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface Props {
  /** Cursor coordinates the menu anchors to (right-click position). */
  position: { x: number; y: number };
  /** Repo-relative path of the target file, shown as a non-interactive header. */
  relPath: string;
  onClose: () => void;
  onOpenInWindow: () => void;
  onOpenContainingFolder: () => void;
  onCopyPath: () => void;
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="w-full text-left px-3 py-1.5 text-[13px] text-[var(--color-text-primary)] rounded transition-colors hover:bg-[var(--color-surface-hover)] cursor-default"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {label}
    </button>
  );
}

/**
 * Right-click menu for a file row in the palette. Mirrors PrContextMenu's
 * outside-click / viewport-clamp behavior. Each action closes the menu via the
 * `onClose` the parent passes through `run()`.
 */
export function FilePaletteContextMenu({
  position,
  relPath,
  onClose,
  onOpenInWindow,
  onOpenContainingFolder,
  onCopyPath,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  // Start at the requested position so the first paint is close, then clamp.
  const [resolvedPos, setResolvedPos] = useState(position);

  // Close when the user clicks anywhere outside the menu.
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClose]);

  // Keep the menu inside the viewport — flip left/up when there isn't room.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const margin = 8;
    const rect = el.getBoundingClientRect();
    let x = position.x;
    let y = position.y;
    if (x + rect.width + margin > window.innerWidth)
      x = Math.max(margin, window.innerWidth - rect.width - margin);
    if (y + rect.height + margin > window.innerHeight)
      y = Math.max(margin, window.innerHeight - rect.height - margin);
    setResolvedPos({ x, y });
  }, [position.x, position.y]);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  // style: anchor coords come from the right-click event — dynamic pixel values.
  return (
    <div
      ref={menuRef}
      data-file-context-menu
      className="fixed z-50 min-w-[210px] rounded-lg border shadow-lg py-1"
      style={{
        left: resolvedPos.x,
        top: resolvedPos.y,
        backgroundColor: 'var(--color-modal-bg)',
        borderColor: 'var(--color-modal-border)',
      }}
    >
      <div
        className="bd-mono px-3 py-1 text-[11px] text-[var(--color-text-muted)] truncate"
        title={relPath}
      >
        {relPath}
      </div>
      <div className="h-px bg-[var(--color-separator)] my-1" />
      <MenuItem label="Open in new window" onClick={run(onOpenInWindow)} />
      <MenuItem label="Open containing folder" onClick={run(onOpenContainingFolder)} />
      <MenuItem label="Copy relative path" onClick={run(onCopyPath)} />
    </div>
  );
}
