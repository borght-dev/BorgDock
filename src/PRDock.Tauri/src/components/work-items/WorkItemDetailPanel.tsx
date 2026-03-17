import { useState, useCallback } from 'react';
import clsx from 'clsx';
import type { DynamicFieldItem, WorkItemAttachment } from '../../types';

export interface WorkItemDetailData {
  id?: number;
  title: string;
  state: string;
  workItemType: string;
  assignedTo: string;
  priority?: number;
  tags: string;
  htmlUrl: string;
  isNewItem: boolean;
}

interface WorkItemDetailPanelProps {
  item: WorkItemDetailData;
  isLoading: boolean;
  isSaving: boolean;
  statusText?: string;
  availableStates: string[];
  richTextFields: DynamicFieldItem[];
  standardFields: DynamicFieldItem[];
  customFields: DynamicFieldItem[];
  attachments: WorkItemAttachment[];
  onSave: (updates: WorkItemFieldUpdates) => void;
  onDelete?: () => void;
  onClose: () => void;
  onOpenInBrowser: (url: string) => void;
  onDownloadAttachment: (attachment: WorkItemAttachment) => void;
}

export interface WorkItemFieldUpdates {
  title: string;
  state: string;
  assignedTo: string;
  priority?: number;
  tags: string;
  workItemType?: string;
}

const WORK_ITEM_TYPES = ['User Story', 'Bug', 'Task', 'Feature', 'Epic'];
const PRIORITIES = [
  { value: 1, label: '1 - Critical' },
  { value: 2, label: '2 - High' },
  { value: 3, label: '3 - Medium' },
  { value: 4, label: '4 - Low' },
];

function stateColor(state: string): string {
  const s = state.toLowerCase();
  if (s === 'new') return 'var(--color-accent)';
  if (['active', 'committed', 'in progress'].includes(s))
    return 'var(--color-accent)';
  if (['resolved', 'done', 'closed'].includes(s))
    return 'var(--color-status-green)';
  if (s === 'removed') return 'var(--color-status-gray)';
  return 'var(--color-status-yellow)';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FieldSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-ghost)]">
        {title}
      </div>
      {children}
    </div>
  );
}

function ReadOnlyField({ field }: { field: DynamicFieldItem }) {
  if (!field.value && !field.htmlContent) return null;
  return (
    <div className="mb-2">
      <label className="mb-0.5 block text-[11px] font-medium text-[var(--color-text-muted)]">
        {field.label}
      </label>
      {field.isHtml && field.htmlContent ? (
        <div
          className="prose-sm rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] p-2 text-[13px] text-[var(--color-text-secondary)]"
          dangerouslySetInnerHTML={{ __html: field.htmlContent }}
        />
      ) : (
        <div className="text-[13px] text-[var(--color-text-secondary)]">
          {field.value}
        </div>
      )}
    </div>
  );
}

export function WorkItemDetailPanel({
  item,
  isLoading,
  isSaving,
  statusText,
  availableStates,
  richTextFields,
  standardFields,
  customFields,
  attachments,
  onSave,
  onDelete,
  onClose,
  onOpenInBrowser,
  onDownloadAttachment,
}: WorkItemDetailPanelProps) {
  const [title, setTitle] = useState(item.title);
  const [state, setState] = useState(item.state);
  const [assignedTo, setAssignedTo] = useState(item.assignedTo);
  const [priority, setPriority] = useState(item.priority);
  const [tags, setTags] = useState(item.tags);
  const [newItemType, setNewItemType] = useState(item.workItemType || 'Task');

  const handleSave = useCallback(() => {
    onSave({
      title,
      state,
      assignedTo,
      priority,
      tags,
      workItemType: item.isNewItem ? newItemType : undefined,
    });
  }, [title, state, assignedTo, priority, tags, newItemType, item.isNewItem, onSave]);

  const color = stateColor(state);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--color-surface)]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-text-ghost)] border-t-[var(--color-accent)]" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-surface)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-subtle-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
            style={{
              backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
              color,
            }}
          >
            {item.isNewItem ? newItemType : item.workItemType}
          </span>
          {!item.isNewItem && item.id && (
            <span className="text-[13px] text-[var(--color-text-muted)]">
              #{item.id}
            </span>
          )}
          {item.isNewItem && (
            <span className="text-[13px] text-[var(--color-text-muted)]">
              New Work Item
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!item.isNewItem && item.htmlUrl && (
            <button
              onClick={() => onOpenInBrowser(item.htmlUrl)}
              className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-secondary)]"
              title="Open in browser"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M6 3H3v10h10v-3M9 3h4v4M14 2L7 9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-secondary)]"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Form fields */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Type selector (new items only) */}
        {item.isNewItem && (
          <div className="mb-3">
            <label className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">
              Type
            </label>
            <select
              value={newItemType}
              onChange={(e) => setNewItemType(e.target.value)}
              className="w-full rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-2.5 py-1.5 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
            >
              {WORK_ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Title */}
        <div className="mb-3">
          <label className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">
            Title
          </label>
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-2.5 py-1.5 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
          />
        </div>

        {/* State */}
        <div className="mb-3">
          <label className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">
            State
          </label>
          <div className="relative">
            <span
              className="absolute left-2.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
              style={{ backgroundColor: color }}
            />
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] py-1.5 pl-7 pr-2.5 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
            >
              {availableStates.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Assigned To */}
        <div className="mb-3">
          <label className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">
            Assigned To
          </label>
          <input
            type="text"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="w-full rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-2.5 py-1.5 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
          />
        </div>

        {/* Priority */}
        <div className="mb-3">
          <label className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">
            Priority
          </label>
          <select
            value={priority ?? ''}
            onChange={(e) =>
              setPriority(e.target.value ? Number(e.target.value) : undefined)
            }
            className="w-full rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-2.5 py-1.5 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
          >
            <option value="">None</option>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tags */}
        <div className="mb-4">
          <label className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">
            Tags
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="tag1; tag2"
            className="w-full rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-2.5 py-1.5 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
          />
        </div>

        {/* Rich text fields */}
        {richTextFields.length > 0 && (
          <FieldSection title="Details">
            {richTextFields.map((f) => (
              <ReadOnlyField key={f.fieldKey} field={f} />
            ))}
          </FieldSection>
        )}

        {/* Standard fields */}
        {standardFields.length > 0 && (
          <FieldSection title="Fields">
            {standardFields.map((f) => (
              <ReadOnlyField key={f.fieldKey} field={f} />
            ))}
          </FieldSection>
        )}

        {/* Custom fields */}
        {customFields.length > 0 && (
          <FieldSection title="Custom Fields">
            {customFields.map((f) => (
              <ReadOnlyField key={f.fieldKey} field={f} />
            ))}
          </FieldSection>
        )}

        {/* Attachments */}
        {attachments.length > 0 && (
          <FieldSection title="Attachments">
            <div className="space-y-1">
              {attachments.map((a) => (
                <button
                  key={a.id}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)]"
                  onClick={() => onDownloadAttachment(a)}
                >
                  <svg className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                    <path d="M3 10v2.5A1.5 1.5 0 004.5 14h7a1.5 1.5 0 001.5-1.5V10M8 2v8M5 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="min-w-0 truncate">{a.fileName}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-[var(--color-text-ghost)]">
                    {formatSize(a.size)}
                  </span>
                </button>
              ))}
            </div>
          </FieldSection>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[var(--color-subtle-border)] px-4 py-3">
        <div>
          {!item.isNewItem && onDelete && (
            <button
              onClick={onDelete}
              className="rounded-md px-3 py-1.5 text-[13px] text-[var(--color-action-danger-fg)] transition-colors hover:bg-[var(--color-action-danger-bg)]"
            >
              Delete
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {statusText && (
            <span className="text-[12px] text-[var(--color-text-muted)]">
              {statusText}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving || !title.trim()}
            className={clsx(
              'rounded-md px-4 py-1.5 text-[13px] font-medium transition-colors',
              isSaving || !title.trim()
                ? 'cursor-not-allowed bg-[var(--color-filter-chip-bg)] text-[var(--color-text-ghost)]'
                : 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:opacity-90'
            )}
          >
            {isSaving ? 'Saving...' : item.isNewItem ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
