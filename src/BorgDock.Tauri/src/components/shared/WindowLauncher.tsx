import { invoke } from '@tauri-apps/api/core';
import {
  Braces,
  FileSearch,
  GitBranch,
  Grid2X2Plus,
  ListTodo,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { openWhatsNew } from '@/services/windows';
import { IconButton, Kbd } from './primitives';

const TOOL_WINDOWS = [
  { id: 'worktrees', label: 'Worktrees', shortcut: 'Ctrl+F7', icon: GitBranch },
  { id: 'files', label: 'Files', shortcut: 'Ctrl+F8', icon: FileSearch },
  { id: 'work-items', label: 'Work items', shortcut: 'Ctrl+F9', icon: ListTodo },
  { id: 'sql', label: 'SQL', shortcut: 'Ctrl+F10', icon: Braces },
] as const;

interface WindowLauncherProps {
  onWindowOpened?: () => void;
}

export function WindowLauncher({ onWindowOpened }: WindowLauncherProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const toggle = useCallback(() => {
    setOpen((current) => {
      if (!current && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPosition({ top: rect.bottom + 6, left: Math.max(8, rect.right - 224) });
      }
      return !current;
    });
  }, []);

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
            <button
              type="button"
              role="menuitem"
              className="bd-window-launcher-menu__item"
              onClick={() => void launch(() => invoke('open_settings_window', { section: null }))}
            >
              <Settings size={14} aria-hidden="true" />
              <span>Settings</span>
            </button>
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
