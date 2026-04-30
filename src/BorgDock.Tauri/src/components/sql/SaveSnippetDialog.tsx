import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/shared/primitives';
import { CheckIcon, CopyIcon, XIcon } from './icons';

interface SaveSnippetDialogProps {
  /** Initial value for the name input. */
  initialName: string;
  /** Body that will be saved — used for the preview only. */
  body: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}

export function SaveSnippetDialog({ initialName, body, onSave, onCancel }: SaveSnippetDialogProps) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const lines = body.split('\n');
  const previewLines = lines.slice(0, 4);
  const preview = previewLines.join('\n') + (lines.length > 4 ? '\n…' : '');

  const trimmed = name.trim();
  const canSave = trimmed.length > 0;

  return (
    <div
      className="sql-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sql-save-snippet-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="sql-modal bd-card">
        <header className="sql-modal__head">
          <CopyIcon size={13} className="sql-modal__head-icon" />
          <span id="sql-save-snippet-title" className="bd-section-label sql-modal__title">
            Save snippet
          </span>
          <span className="sql-modal__head-spacer" />
          <button type="button" className="bd-icon-btn" aria-label="Close" onClick={onCancel}>
            <XIcon size={12} />
          </button>
        </header>
        <div className="sql-modal__body">
          <label htmlFor="sql-snippet-name" className="sql-modal__label">
            Snippet name
          </label>
          <div className="bd-input sql-modal__input">
            <input
              id="sql-snippet-name"
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSave) {
                  e.preventDefault();
                  onSave(trimmed);
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancel();
                }
              }}
              placeholder="e.g. Recent paid quotes"
            />
          </div>
          <div className="sql-modal__preview">
            <div className="sql-modal__preview-label">Query preview</div>
            <pre className="bd-mono sql-modal__preview-body">{preview || '— empty —'}</pre>
          </div>
          <div className="sql-modal__actions">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              leading={<CheckIcon size={11} />}
              disabled={!canSave}
              onClick={() => onSave(trimmed)}
            >
              Save snippet
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
