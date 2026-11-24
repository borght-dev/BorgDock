import { invoke } from '@tauri-apps/api/core';
import {
  Braces,
  GitBranch,
  Grid2X2Plus,
  ListTodo,
  NotebookPen,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { openWhatsNew } from '@/services/windows';
import { IconButton, Kbd } from './primitives';

const TOOL_WINDOWS = [
  { id: 'worktrees', label: 'Worktrees', shortcut: 'Ctrl+F7', icon: GitBranch },
  { id: 'note-capture', label: 'Quick note', shortcut: 'Ctrl+F8', icon: NotebookPen },
  { id: 'work-items', label: 'Work items', shortcut: 'Ctrl+F9', icon: ListTodo },
  { id: 'sql', label: 'SQL', shortcut: 'Ctrl+F10', icon: Braces },
] as const;

/** Space between the trigger (or the rail) and the menu. */
const GAP = 6;

interface MenuPosition {
  left: number;
  top?: number;
  bottom?: number;
}

interface WindowLauncherProps {
  onWindowOpened?: () => void;
  /** Where the menu opens: under the trigger, or beside the rail, growing upward from the trigger. */
  anchor?: 'below' | 'rail';
  /** The menu offers Settings. Off where Settings has a button of its own next to the trigger. */
  settingsItem?: boolean;
}

export function WindowLauncher({
  onWindowOpened,
  anchor = 'below',
  settingsItem = true,
}: WindowLauncherProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const toggle = useCallback(() => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const rail = anchor === 'rail' ? triggerRef.current.closest('.bd-rail') : null;
      setPosition(
        rail
          ? {
              left: rail.getBoundingClientRect().right + GAP,
              bottom: Math.max(8, window.innerHeight - rect.bottom),
            }
          : { top: rect.bottom + GAP, left: Math.max(8, rect.right - 224) },
      );
    }
    setOpen(!open);
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  const launch = useCallback(
    async (action: () => Promise<unknown>) => {
      close();
      try {
        await action();
        onWindowOpened?.();
      } catch (error) {
        console.error('Failed to open window', error);
      }
    },
    [close, onWindowOpened],
  );

  return (
    <>
      <span ref={triggerRef} className="bd-window-launcher-trigger">
        <IconButton
          icon={<Grid2X2Plus size={14} />}
          tooltip="Open window"
          aria-label="Open window"
          aria-haspopup="menu"
          aria-expanded={open}
          active={open}
          onClick={toggle}
        />
      </span>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Windows"
            className="bd-window-launcher-menu"
            style={position}
          >
            <div className="bd-window-launcher-menu__label">Open window</div>
            {TOOL_WINDOWS.map(({ id, label, shortcut, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="menuitem"
                className="bd-window-launcher-menu__item"
                onClick={() => void launch(() => invoke('open_tool_window', { tool: id }))}
              >
                <Icon size={14} aria-hidden="true" />
                <span>{label}</span>
                <Kbd>{shortcut}</Kbd>
              </button>
            ))}
            <div className="bd-window-launcher-menu__separator" />
            {settingsItem && (
              <button
                type="button"
                role="menuitem"
                className="bd-window-launcher-menu__item"
                onClick={() => void launch(() => invoke('open_settings_window', { section: null }))}
              >
                <Settings size={14} aria-hidden="true" />
                <span>Settings</span>
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="bd-window-launcher-menu__item"
              onClick={() => void launch(() => openWhatsNew(null))}
            >
              <Sparkles size={14} aria-hidden="true" />
              <span>What's new</span>
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
