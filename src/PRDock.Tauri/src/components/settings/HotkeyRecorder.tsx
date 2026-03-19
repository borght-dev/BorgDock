import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';

interface HotkeyRecorderProps {
  value: string;
  onChange: (shortcut: string) => void;
}

export function HotkeyRecorder({ value, onChange }: HotkeyRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [currentKeys, setCurrentKeys] = useState<string[]>([]);
  const inputRef = useRef<HTMLButtonElement>(null);

  const startRecording = useCallback(() => {
    setRecording(true);
    setCurrentKeys([]);
  }, []);

  const cancelRecording = useCallback(() => {
    setRecording(false);
    setCurrentKeys([]);
  }, []);

  useEffect(() => {
    if (!recording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        cancelRecording();
        return;
      }

      const parts: string[] = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (e.metaKey) parts.push('Super');

      // Don't record modifier-only presses
      const key = e.key;
      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
        // Normalize key name
        const normalizedKey = key.length === 1 ? key.toUpperCase() : key;
        parts.push(normalizedKey);
        setCurrentKeys(parts);

        // Valid combo: at least one modifier + one key
        if (parts.length >= 2) {
          const shortcut = parts.join('+');
          onChange(shortcut);
          setRecording(false);
          setCurrentKeys([]);
        }
      } else {
        setCurrentKeys(parts);
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [recording, cancelRecording, onChange]);

  return (
    <div className="flex items-center gap-2">
      <button
        ref={inputRef}
        onClick={recording ? cancelRecording : startRecording}
        className={clsx(
          'flex-1 rounded-md border px-2.5 py-1.5 text-left text-[13px] font-mono transition-colors',
          recording
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
            : 'border-[var(--color-input-border)] bg-[var(--color-input-bg)] text-[var(--color-text-primary)]',
        )}
      >
        {recording
          ? currentKeys.length > 0
            ? currentKeys.join(' + ')
            : 'Press a key combo...'
          : value || 'Not set'}
      </button>
      {recording && (
        <button
          onClick={cancelRecording}
          className="rounded-md px-2 py-1 text-[12px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
