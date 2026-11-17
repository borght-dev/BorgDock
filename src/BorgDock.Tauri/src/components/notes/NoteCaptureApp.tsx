import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Kbd } from '@/components/shared/primitives';
import { WindowTitleBar } from '@/components/shared/WindowTitleBar';
import { useNotesVault } from '@/hooks/useNotesVault';
import { showNote } from '@/services/navigation';
import { type CaptureContext, captureContext, contextRef } from '@/services/notes/capture';
import { createCaptureSession } from '@/services/notes/capture-session';
import { AUTOSAVE_MS, useNotesStore } from '@/stores/notes-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { AppSettings } from '@/types/settings';
import { revealWindow } from '@/utils/window-reveal';
import { NoteEditor } from './editor/NoteEditor';
import { completionSources, openNoteUrl, renderChip } from './editor-support';

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

/** Ctrl+F8 capture with live Markdown and autosave. Enter inserts a line. */
export function NoteCaptureApp() {
  useNotesVault();
  const status = useNotesStore((s) => s.status);
  const [text, setText] = useState('');
  const [context, setContext] = useState<CaptureContext | null>(() => captureContext());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const session = useRef<ReturnType<typeof createCaptureSession> | null>(null);
  const draft = useRef({ text, context });
  const revision = useRef(0);

  const save = useCallback(async (snapshot?: { text: string; context: CaptureContext | null }) => {
    const current = snapshot ?? draft.current;
    const version = revision.current;
    if (!session.current) session.current = createCaptureSession();
    setSaving(true);
    setError(null);
    try {
      const path = await session.current(current.text, current.context);
      if (version === revision.current) setSaved(path);
      return true;
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const close = useCallback(async () => {
    const version = revision.current;
    if ((await save()) && version === revision.current) hide();
  }, [save]);

  useEffect(() => {
    if (status !== 'ready') return;
    const timer = window.setTimeout(() => void save({ text, context }), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [text, context, status, save]);

  useEffect(() => {
    if (!useSettingsStore.getState().hasLoaded) readSettings();
    const raf = requestAnimationFrame(() => {
      inputRef.current?.querySelector<HTMLElement>('.cm-content')?.focus();
      void revealWindow();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const unlisten = listen('palette-shown', () => {
      readSettings();
      void useNotesStore.getState().refresh();
      requestAnimationFrame(() =>
        inputRef.current?.querySelector<HTMLElement>('.cm-content')?.focus(),
      );
    });
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void close();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <div
      className="bd-notes-capture"
      data-app-ready={status === 'ready' || status === 'error' ? 'true' : undefined}
    >
      <WindowTitleBar title="Quick note" meta={<Kbd>Ctrl+F8</Kbd>} onClose={() => void close()} />
      <div ref={inputRef} className="bd-notes-capture__input">
        <NoteEditor
          path="quick-capture"
          text={text}
          ariaLabel="Quick note"
          autoFocus
          readOnly={status !== 'ready'}
          onChange={(next) => {
            draft.current = { text: next, context };
            revision.current++;
            setSaved(null);
            setText(next);
          }}
          renderChip={renderChip}
          onOpenLink={(target) => void showNote(`${target}.md`)}
          onOpenUrl={openNoteUrl}
          completions={completionSources(() => 'Quick note')}
        />
      </div>
      <footer className="bd-notes-capture__foot">
        <span className="bd-notes-capture__to">→ Today's note</span>
        {context && (
          <span className="bd-notes-capture__context" title={context.title}>
            {contextRef(context)}
            <button
              type="button"
              aria-label="Don't link this capture"
              onClick={() => {
                draft.current = { text, context: null };
                revision.current++;
                setSaved(null);
                setContext(null);
              }}
            >
              <X size={11} />
            </button>
          </span>
        )}
        <span className="bd-notes-capture__status" role="status">
          {error ??
            (saving
              ? 'Saving...'
              : saved
                ? 'Saved.'
                : status === 'loading'
                  ? 'Opening your notes…'
                  : '')}
        </span>
        {saved ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void showNote(saved);
              void close();
            }}
          >
            Open note
          </Button>
        ) : (
          <span className="bd-notes-capture__hint">
            Saves automatically · Enter new line · Esc closes
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            const version = revision.current;
            if (!(await save()) || version !== revision.current) return;
            session.current = null;
            const nextContext = captureContext();
            draft.current = { text: '', context: nextContext };
            revision.current++;
            setText('');
            setContext(nextContext);
            setSaved(null);
            inputRef.current?.querySelector<HTMLElement>('.cm-content')?.focus();
          }}
        >
          New note
        </Button>
      </footer>
    </div>
  );
}
