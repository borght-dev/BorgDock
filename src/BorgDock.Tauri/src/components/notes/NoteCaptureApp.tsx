import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Kbd } from '@/components/shared/primitives';
import { WindowTitleBar } from '@/components/shared/WindowTitleBar';
import { useNotesVault } from '@/hooks/useNotesVault';
import { showNote } from '@/services/navigation';
import {
  type CaptureContext,
  captureContext,
  captureLines,
  contextRef,
  withCapture,
} from '@/services/notes/capture';
import { ensureDailyNote } from '@/services/notes/daily';
import { useNotesStore } from '@/stores/notes-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { AppSettings } from '@/types/settings';
import { revealWindow } from '@/utils/window-reveal';

/** Append `text` to today's note under `## Captured`; the note's path. */
export async function captureToToday(text: string, context: CaptureContext | null) {
  const path = await ensureDailyNote();
  const lines = captureLines(text, new Date(), context);
  const written = await useNotesStore
    .getState()
    .update(path, (current) => (current === null ? null : withCapture(current, lines)));
  if (!written) throw new Error("Today's note could not be written.");
  return path;
}

/**
 * The window has its own stores and stays alive while hidden: it reads the
 * settings when it opens and each time it is shown again, so a moved sync
 * folder is followed (useNotesVault reloads the vault).
 */
function readSettings() {
  void invoke<AppSettings | null>('load_settings')
    .then((settings) =>
      useSettingsStore.setState({
        ...(settings ? { settings } : {}),
        isLoading: false,
        hasLoaded: true,
      }),
    )
    .catch(() => useSettingsStore.setState({ isLoading: false, hasLoaded: true }));
}

function hide() {
  getCurrentWindow()
    .hide()
    .catch(() => {});
}

/**
 * NoteCaptureApp — the quick note window (Ctrl+F8 from anywhere). What you
 * type lands in today's note under "Captured", with a reference to the pull
 * request or work item you last had open. Enter saves, Shift+Enter starts a
 * new line, Esc closes.
 */
export function NoteCaptureApp() {
  useNotesVault();
  const status = useNotesStore((s) => s.status);
  const [text, setText] = useState('');
  const [context, setContext] = useState<CaptureContext | null>(() => captureContext());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!useSettingsStore.getState().hasLoaded) readSettings();
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      void revealWindow();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const unlisten = listen('palette-shown', () => {
      setText('');
      setSaved(null);
      setError(null);
      setContext(captureContext());
      readSettings();
      void useNotesStore.getState().refresh();
      requestAnimationFrame(() => inputRef.current?.focus());
    });
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        hide();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const save = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const path = await captureToToday(text, context);
      setSaved(path);
      setText('');
      window.setTimeout(hide, 700);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="bd-notes-capture"
      data-app-ready={status === 'ready' || status === 'error' ? 'true' : undefined}
    >
      <WindowTitleBar title="Quick note" meta={<Kbd>Ctrl+F8</Kbd>} onClose={hide} />
      <textarea
        ref={inputRef}
        className="bd-notes-capture__input"
        aria-label="Quick note"
        placeholder="What's on your mind? It goes into today's note."
        value={text}
        disabled={status === 'loading' || status === 'idle'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void save();
          }
        }}
      />
      <footer className="bd-notes-capture__foot">
        <span className="bd-notes-capture__to">→ Today's note</span>
        {context && (
          <span className="bd-notes-capture__context" title={context.title}>
            {contextRef(context)}
            <button
              type="button"
              aria-label="Don't link this capture"
              onClick={() => setContext(null)}
            >
              <X size={11} />
            </button>
          </span>
        )}
        <span className="bd-notes-capture__status" role="status">
          {error ?? (saved ? 'Saved.' : status === 'loading' ? 'Opening your notes…' : '')}
        </span>
        {saved ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void showNote(saved);
              hide();
            }}
          >
            Open note
          </Button>
        ) : (
          <span className="bd-notes-capture__hint">
            Enter saves · Shift+Enter new line · Esc closes
          </span>
        )}
      </footer>
    </div>
  );
}
