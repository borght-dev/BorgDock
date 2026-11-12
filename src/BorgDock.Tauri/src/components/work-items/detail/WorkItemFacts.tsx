import { CalendarRange, Plus } from 'lucide-react';
import type { FormField } from '@/services/ado/form-model';
import { useWorkItemsStore } from '@/stores/work-items-store';
import {
  avatarToneFor,
  getInitials,
  MiniAvatar,
  PrioBars,
  stateDot,
  useStateMeta,
  WI_PRIO,
} from '../shared/wi-visuals';
import { ChipPicker } from '../WorkItemDetailPanel/ChipPicker';

const PRIORITY_OPTIONS = [
  { value: '1', label: 'P1 · Urgent' },
  { value: '2', label: 'P2 · High' },
  { value: '3', label: 'P3 · Med' },
  { value: '4', label: 'P4 · Low' },
];

export interface FactsChange {
  state?: string;
  assignedTo?: string;
  priority?: number;
  iteration?: string;
  tags?: string;
  /** Other fields by reference name: the type's own fact. */
  fields?: Record<string, unknown>;
}

export interface WorkItemFactsProps {
  workItemType: string;
  state: string;
  availableStates: string[];
  assignedTo: string;
  priority?: number;
  /** The iteration's last segment. */
  iteration: string;
  tags: string;
  typeFact: FormField | null;
  /** Allowed values of the type fact; empty means free text. */
  typeFactOptions: string[];
  onLoadTypeFactOptions?: () => void;
  readOnly?: boolean;
  onChange: (change: FactsChange) => void;
}

/** "2 - Not Critical" → its leading number, which sets the dot's colour. */
function severityRank(text: string): number | null {
  const match = /^(\d)/.exec(text.trim());
  return match ? Number(match[1]) : null;
}

const SEVERITY_DOT: Record<number, string> = {
  1: 'var(--color-status-red)',
  2: 'var(--color-status-yellow)',
  3: 'var(--color-status-blue)',
  4: 'var(--color-text-tertiary)',
};

/** "2 - Not Critical" reads "2 · Not critical". */
export function factText(field: FormField): string {
  if (!field.text) return '—';
  if (field.type === 'dateTime' || /DueDate$/.test(field.key)) {
    const date = new Date(String(field.value));
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
    }
  }
  const severity = /^(\d)\s*-\s*(.+)$/.exec(field.text);
  if (severity) {
    const rest = severity[2]!;
    return `${severity[1]} · ${rest.charAt(0)}${rest.slice(1).toLowerCase()}`;
  }
  return field.text;
}

function TypeFactValue({ field }: { field: FormField }) {
  const rank = field.key.endsWith('.Severity') ? severityRank(field.text) : null;
  return (
    <>
      {rank !== null && (
        <span
          className="bd-wid-dot"
          style={{ '--bd-wid-dot': SEVERITY_DOT[rank] ?? 'var(--color-text-tertiary)' } as never}
        />
      )}
      {field.key.endsWith('DueDate') && (
        <CalendarRange size={12} strokeWidth={2} style={{ color: 'var(--color-text-tertiary)' }} />
      )}
      <span className={field.text ? undefined : 'bd-wid-fact__muted'}>{factText(field)}</span>
    </>
  );
}

function splitTags(tags: string): string[] {
  return tags
    .split(';')
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * The work item's facts, each in one place and edited where it shows:
 * state, assignee, priority, the type's own fact (Severity on a Bug, Effort
 * on a PBI), iteration and tags.
 */
export function WorkItemFacts(props: WorkItemFactsProps) {
  const {
    workItemType,
    state,
    availableStates,
    assignedTo,
    priority,
    iteration,
    tags,
    typeFact,
    typeFactOptions,
    onLoadTypeFactOptions,
    readOnly = false,
    onChange,
  } = props;
  const me = useWorkItemsStore((s) => s.currentUserDisplayName);
  const dot = stateDot(state, useStateMeta(state, workItemType));
  const prio = priority != null ? WI_PRIO[priority] : null;
  const initials = assignedTo ? getInitials(assignedTo) : '';
  const tagList = splitTags(tags);

  return (
    <div className="bd-wid-facts" data-wid-facts="">
      <ChipPicker
        variant="fact"
        label="State"
        value={state}
        options={availableStates.length > 0 ? availableStates : [state]}
        readOnly={readOnly}
        onChange={(next) => onChange({ state: next })}
      >
        <span className="bd-wid-dot" style={{ '--bd-wid-dot': dot } as never} />
        {state}
      </ChipPicker>
      <ChipPicker
        variant="fact"
        label="Assigned to"
        value={assignedTo}
        placeholder="display name or email"
        readOnly={readOnly}
        onChange={(next) => onChange({ assignedTo: next })}
        trailing={
          !assignedTo && me && !readOnly ? (
            <button
              type="button"
              className="bd-wid-fact__assign"
              onClick={() => onChange({ assignedTo: me })}
            >
              Assign me
            </button>
          ) : undefined
        }
      >
        {assignedTo ? (
          <>
            <MiniAvatar initials={initials} tone={avatarToneFor(initials)} size={18} />
            {assignedTo}
          </>
        ) : (
          <>
            <span className="bd-wid-avatar-empty" aria-hidden="true">
              ?
            </span>
            <span className="bd-wid-fact__muted">Unassigned</span>
          </>
        )}
      </ChipPicker>
      <ChipPicker
        variant="fact"
        label="Priority"
        value={priority != null ? String(priority) : ''}
        options={PRIORITY_OPTIONS}
        readOnly={readOnly}
        onChange={(next) => onChange({ priority: Number(next) })}
      >
        <PrioBars prio={priority} />
        {prio ? `P${priority} · ${prio.label}` : <span className="bd-wid-fact__muted">None</span>}
      </ChipPicker>
      {typeFact && (
        <ChipPicker
          variant="fact"
          label={typeFact.label}
          value={typeFact.text}
          options={typeFactOptions}
          readOnly={readOnly || typeFact.readOnly}
          onOpen={onLoadTypeFactOptions}
          onChange={(next) => onChange({ fields: { [typeFact.key]: next } })}
        >
          <TypeFactValue field={typeFact} />
        </ChipPicker>
      )}
      <ChipPicker
        variant="fact"
        label="Iteration"
        value={iteration}
        placeholder="e.g. Sprint 24"
        readOnly={readOnly}
        onChange={(next) => onChange({ iteration: next })}
      >
        <CalendarRange size={12} strokeWidth={2} style={{ color: 'var(--color-text-tertiary)' }} />
        {iteration || <span className="bd-wid-fact__muted">No iteration</span>}
      </ChipPicker>
      <ChipPicker
        variant="fact"
        label="Tags"
        hideChevron
        value={tags}
        placeholder="tag; another tag"
        readOnly={readOnly}
        onChange={(next) => onChange({ tags: splitTags(next).join('; ') })}
      >
        <span className="bd-wid-tags">
          {tagList.map((tag) => (
            <span key={tag} className="bd-wid-tag">
              {tag}
            </span>
          ))}
          {!readOnly && (
            <span className="bd-wid-tag bd-wid-tag--add" aria-label="Edit tags">
              <Plus size={12} strokeWidth={2} />
            </span>
          )}
          {readOnly && tagList.length === 0 && <span className="bd-wid-fact__muted">None</span>}
        </span>
      </ChipPicker>
    </div>
  );
}
