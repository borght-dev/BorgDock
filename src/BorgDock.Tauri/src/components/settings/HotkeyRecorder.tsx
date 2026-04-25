import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/shared/primitives/Button';

interface HotkeyRecorderProps {
  value: string;
  onChange: (shortcut: string) => void;
}

export function HotkeyRecorder({ value, onChange }: HotkeyRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [currentKeys, setCurrentKeys] = useState<string[]>([]);

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
      <Button
        variant={recording ? 'primary' : 'secondary'}
        size="sm"
        className="flex-1 font-mono text-left"
        onClick={recording ? cancelRecording : startRecording}
        data-hotkey-recorder
        data-recording={recording ? 'true' : 'false'}
      >
        {recording
          ? currentKeys.length > 0
            ? currentKeys.join(' + ')
            : 'Press a key combo...'
          : value || 'Not set'}
      </Button>
      {recording && (
        <Button variant="ghost" size="sm" onClick={cancelRecording}>
          Cancel
        </Button>
      )}
    </div>
  );
}
