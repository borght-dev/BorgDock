import clsx from 'clsx';
import { Layers } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { Button, Input, Select } from '@/components/shared/primitives';
import { isMainWindow, showWorkstream } from '@/services/navigation';
import { addMembers } from '@/services/workstreams/edits';
import { WORKSTREAMS_ENABLED } from '@/services/workstreams/feature';
import { refKey, shortIdentity } from '@/services/workstreams/identity';
import { addToWorkstream, itemRef } from '@/services/workstreams/membership';
import {
  MEMBER_ROLES,
  type MemberRole,
  ROLE_LABEL,
  type SourceRef,
} from '@/services/workstreams/types';
import { useSettingsStore } from '@/stores/settings-store';
import { showToast } from '@/stores/toast-store';
import { type Entry, useWorkstreamsStore } from '@/stores/workstreams-store';
import { type PendingAdd, useWorkstreamsUiStore } from '@/stores/workstreams-ui-store';
import { Sheet } from './Sheet';
import { wsEdit } from './ws-ui';

export interface WorkstreamRef {
  id: string;
  title: string;
}

let indexedEntries: unknown = null;
let index = new Map<string, WorkstreamRef[]>();

/** Which workstreams hold each record, by its key; built once per change of the store. */
function workstreamIndex(entries: Record<string, Entry>): Map<string, WorkstreamRef[]> {
  if (entries === indexedEntries) return index;
  indexedEntries = entries;
  index = new Map();
  for (const entry of Object.values(entries)) {
    const d = entry.document;
    if (d.status === 'archived') continue;
    for (const member of d.members) {
      index.set(member.key, [...(index.get(member.key) ?? []), { id: d.id, title: d.title }]);
    }
  }
  return index;
}

/**
 * The workstreams that hold any of `keys`. A row re-renders only when its
 * own answer changes, not on every edit of any workstream.
 */
export function useWorkstreamsOf(keys: readonly string[]): WorkstreamRef[] {
  const signature = useWorkstreamsStore((s) => {
    const found = new Map<string, string>();
    const built = workstreamIndex(s.entries);
    for (const key of keys) for (const w of built.get(key) ?? []) found.set(w.id, w.title);
    return JSON.stringify([...found]);
  });
  return useMemo(
    () => (JSON.parse(signature) as [string, string][]).map(([id, title]) => ({ id, title })),
    [signature],
  );
}

const MAX_CHIPS = 2;

/** The workstreams a record belongs to, as small links; nothing when it belongs to none. */
export function WorkstreamChips({
  refs,
  className,
}: {
  refs: readonly SourceRef[];
  className?: string;
}) {
  const list = useWorkstreamsOf(refs.map(refKey));
  if (!WORKSTREAMS_ENABLED || !isMainWindow() || list.length === 0) return null;
  return (
    <span className={clsx('bd-ws-chips', className)}>
      {list.slice(0, MAX_CHIPS).map((w) => (
        <button
          key={w.id}
          type="button"
          className="bd-ws-chip"
          title={`Workstream: ${w.title}`}
          onClick={(e) => {
            e.stopPropagation();
            void showWorkstream(w.id);
          }}
        >
          <Layers size={10} aria-hidden="true" />
          <span>{w.title}</span>
        </button>
      ))}
      {list.length > MAX_CHIPS && (
        <span
          className="bd-ws-chip bd-ws-chip--more"
          title={list
            .slice(MAX_CHIPS)
            .map((w) => w.title)
            .join(', ')}
        >
          +{list.length - MAX_CHIPS}
        </span>
      )}
    </span>
  );
}

/**
 * A row's title with its workstream chips on the same line, so rows keep
 * their height (the PR list is virtualized at a fixed row height). Without
 * a workstream the title renders exactly as it did.
 */
export function TitleWithChips({
  refs,
  children,
}: {
  refs: readonly SourceRef[];
  children: ReactNode;
}) {
  const list = useWorkstreamsOf(refs.map(refKey));
  if (!WORKSTREAMS_ENABLED || !isMainWindow() || list.length === 0) return <>{children}</>;
  return (
    <span className="bd-ws-titleline">
      {children}
      <WorkstreamChips refs={refs} />
    </span>
  );
}

/** Chips for the workstreams that hold the records, and "Add to workstream…". */
export function WorkstreamMembership({ records }: { records: PendingAdd['refs'] }) {
  if (!WORKSTREAMS_ENABLED || records.length === 0) return null;
  return (
    <span className="bd-ws-membership">
      <WorkstreamChips refs={records.map((r) => r.ref)} />
      <Button
        variant="ghost"
        size="sm"
        leading={<Layers size={12} aria-hidden="true" />}
        onClick={(e) => {
          e.stopPropagation();
          void addToWorkstream({ refs: records });
        }}
      >
        Add to workstream…
      </Button>
    </span>
  );
}

function order(entries: readonly Entry[]): Entry[] {
  return [...entries]
    .filter(
      (e) => (e.document.status === 'active' || e.document.status === 'paused') && !e.readOnly,
    )
    .sort(
      (a, b) =>
        Number(b.document.pinned) - Number(a.document.pinned) ||
        (b.document.updatedAt || b.document.createdAt).localeCompare(
          a.document.updatedAt || a.document.createdAt,
        ),
    );
}

/** Pick the workstream the records join, or start a new one with them. */
export function AddToWorkstreamSheet({
  records,
  onClose,
}: {
  records: PendingAdd;
  onClose: () => void;
}) {
  const entries = useWorkstreamsStore((s) => s.entries);
  const openCreate = useWorkstreamsUiStore((s) => s.openCreate);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<MemberRole>('supporting');
  const all = useMemo(() => order(Object.values(entries)), [entries]);
  const shown = all.filter((e) =>
    e.document.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const target = chosen ?? shown[0]?.document.id ?? null;
  const names = records.refs.map((r) => shortIdentity(r.ref)).join(', ');

  const add = () => {
    const entry = target ? entries[target] : undefined;
    if (!entry) return;
    const added = records.refs.map((r) => ({ ref: r.ref, label: r.label, role }));
    if (wsEdit(entry.document.id, (d, c) => addMembers(d, added, c))) {
      showToast({
        tone: 'success',
        message: `Added ${names} to ${entry.document.title}.`,
        actionLabel: 'Open',
        onAction: () => void showWorkstream(entry.document.id),
      });
      onClose();
    }
  };

  return (
    <Sheet
      title="Add to workstream"
      subtitle={names}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              onClose();
              openCreate(records);
            }}
          >
            New workstream with {records.refs.length === 1 ? 'it' : 'them'}
          </Button>
          <span className="bd-dp-sheet__spacer" />
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" disabled={!target} onClick={add}>
            Add
          </Button>
        </>
      }
    >
      {all.length === 0 ? (
        <p className="bd-dp-sheet__hint">No workstream yet. Start one with these records.</p>
      ) : (
        <>
          <Input
            autoFocus
            aria-label="Find a workstream"
            placeholder="Find a workstream"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <ul className="bd-ws-picker__list" role="radiogroup" aria-label="Workstream">
            {shown.map((entry) => {
              const on = entry.document.id === target;
              const holds = records.refs.every((r) =>
                entry.document.members.some((m) => m.key === refKey(r.ref)),
              );
              return (
                <li key={entry.document.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={holds}
                    className={clsx(
                      'bd-ws-picker__row bd-ws-picker__row--plain',
                      on && 'bd-ws-picker__row--on',
                    )}
                    onClick={() => setChosen(entry.document.id)}
                  >
                    <span className="bd-ws-picker__label">{entry.document.title}</span>
                    <span className="bd-ws-muted">
                      {holds
                        ? 'Holds it already'
                        : entry.document.status === 'paused'
                          ? 'Paused'
                          : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <label className="bd-ws-field">
            <span className="bd-dp-sheet__label">Role</span>
            <Select
              ariaLabel="Role"
              value={role}
              options={MEMBER_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
              onChange={(next) => setRole(next as MemberRole)}
            />
          </label>
        </>
      )}
    </Sheet>
  );
}

function useItemRef(id: number): SourceRef | null {
  const organization = useSettingsStore((s) => s.settings.azureDevOps.organization);
  const project = useSettingsStore((s) => s.settings.azureDevOps.project);
  return organization && project ? itemRef(organization, project, id) : null;
}

/** A work item's workstreams and "Add to workstream…", for its detail view. */
export function ItemMembership({ id, title }: { id: number; title: string }) {
  const ref = useItemRef(id);
  return ref ? <WorkstreamMembership records={[{ ref, label: title }]} /> : null;
}

/** A work item's workstreams as chips, for a row. */
export function ItemChips({ id }: { id: number }) {
  const ref = useItemRef(id);
  return ref ? <WorkstreamChips refs={[ref]} /> : null;
}

/** A work item row's title with its workstream chips on the same line. */
export function ItemTitleWithChips({ id, children }: { id: number; children: ReactNode }) {
  const ref = useItemRef(id);
  return ref ? <TitleWithChips refs={[ref]}>{children}</TitleWithChips> : children;
}
