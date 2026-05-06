// src/components/work-items/WorkItemDetailPanel/TitleBlock.tsx
import { useEffect, useState } from 'react';
import {
  MiniAvatar,
  PrioBars,
  StatePill,
  TypeGlyph,
  WI_PRIO,
  avatarToneFor,
  getInitials,
} from '@/components/work-items/shared/wi-visuals';
import { ChipPicker } from './ChipPicker';

export interface TitleBlockChange {
  title?: string;
  state?: string;
  assignedTo?: string;
  priority?: number;
  tags?: string;
}

interface Props {
  id?: number;
  title: string;
  workItemType: string;
  state: string;
  priority?: number;
  assignedTo: string;
  iteration?: string;
  availableStates: string[];
  changedAgo?: string;
  onChange: (patch: TitleBlockChange) => void;
  onCopyId: () => void;
  onOpenInBrowser: () => void;
}

export function TitleBlock(props: Props) {
  const {
    id,
    title,
    workItemType,
    state,
    priority,
    assignedTo,
    iteration,
    availableStates,
    changedAgo,
    onChange,
    onCopyId,
    onOpenInBrowser,
  } = props;

  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);

  useEffect(() => {
    setTitleDraft(title);
  }, [title]);

  const initials = getInitials(assignedTo || '??');
  const prio = priority != null ? WI_PRIO[priority] : null;

  return (
    <div
      style={{
        padding: '20px 28px 14px',
        borderBottom: '1px solid var(--color-subtle-border)',
        background: 'var(--color-surface)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <TypeGlyph type={workItemType} size={13} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {workItemType}
        </span>
        {id != null && (
          <>
            <span
              style={{ width: 3, height: 3, borderRadius: 999, background: 'var(--color-text-faint)' }}
            />
            <span
              className="bd-mono"
              style={{
                fontSize: 11.5,
                color: 'var(--color-text-muted)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              #{id}
            </span>
            <span
              style={{ width: 3, height: 3, borderRadius: 999, background: 'var(--color-text-faint)' }}
            />
            <button
              type="button"
              onClick={onCopyId}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'transparent',
                border: 'none',
                padding: 0,
                color: 'var(--color-text-muted)',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              copy ID
            </button>
          </>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="bd-icon-btn" onClick={onOpenInBrowser} title="Open in ADO">
          ↗
        </button>
      </div>

      {editing ? (
        <input
          autoFocus
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (titleDraft !== title) onChange({ title: titleDraft });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setTitleDraft(title);
              setEditing(false);
            }
          }}
          style={{
            width: '100%',
            margin: 0,
            fontSize: 22,
            fontWeight: 600,
            lineHeight: 1.25,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.015em',
            background: 'transparent',
            border: '1px solid var(--color-input-border)',
            borderRadius: 6,
            padding: '4px 8px',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
      ) : (
        // biome-ignore lint/a11y/useKeyWithClickEvents: click-to-edit is mouse-driven; Enter on focus would conflict with title editing
        <h1
          onClick={() => {
            setTitleDraft(title);
            setEditing(true);
          }}
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 600,
            lineHeight: 1.25,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.015em',
            cursor: 'text',
          }}
        >
          {title}
        </h1>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 14,
          flexWrap: 'wrap',
        }}
      >
        <ChipPicker
          label="STATE"
          value={state}
          options={availableStates}
          onChange={(next) => onChange({ state: next })}
        >
          <StatePill state={state} compact />
        </ChipPicker>
        <ChipPicker
          label="PRIORITY"
          value={priority != null ? String(priority) : ''}
          options={['1', '2', '3', '4']}
          onChange={(next) => onChange({ priority: Number(next) })}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11.5,
              color: 'var(--color-text-primary)',
            }}
          >
            <PrioBars prio={priority} />
            {prio ? `P${priority} · ${prio.label}` : 'No priority'}
          </span>
        </ChipPicker>
        <ChipPicker
          label="ASSIGNEE"
          value={assignedTo}
          options={[]}
          onChange={(next) => onChange({ assignedTo: next })}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11.5,
              color: 'var(--color-text-primary)',
            }}
          >
            <MiniAvatar initials={initials} tone={avatarToneFor(initials)} size={16} />
            {assignedTo || 'Unassigned'}
          </span>
        </ChipPicker>
        {iteration && (
          <ChipPicker
            label="ITERATION"
            value={iteration}
            options={[]}
            onChange={() => {}}
          >
            <span style={{ fontSize: 11.5, color: 'var(--color-text-primary)' }}>{iteration}</span>
          </ChipPicker>
        )}
        <span style={{ flex: 1 }} />
        {changedAgo && (
          <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>
            updated {changedAgo} ago
          </span>
        )}
      </div>
    </div>
  );
}
