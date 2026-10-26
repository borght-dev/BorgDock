import clsx from 'clsx';
import { Check, Link2, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Input, Pill, Select } from '@/components/shared/primitives';
import { addMembers, type NewMember } from '@/services/workstreams/edits';
import { KIND_LABEL, parseReference, refKey, shortIdentity } from '@/services/workstreams/identity';
import {
  LIMITS,
  MEMBER_ROLES,
  type MemberRole,
  ROLE_LABEL,
  type SourceRef,
} from '@/services/workstreams/types';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { showToast } from '@/stores/toast-store';
import { useWorkstreamsStore } from '@/stores/workstreams-store';
import type { PendingAdd } from '@/stores/workstreams-ui-store';
import { type Candidate, candidates, searchCandidates } from './candidates';
import { Sheet } from './Sheet';
import { plural, wsEdit } from './ws-ui';

interface Chosen {
  ref: SourceRef;
  label: string;
}

/** The records BorgDock knows, from Dispatch, the PR poll and every T3 host. */
export function useCandidates(): Candidate[] {
  const overview = useDispatchStore((s) => s.overview);
  const threads = useDispatchStore((s) => s.threads);
  const hosts = useDispatchStore((s) => s.hosts);
  const open = usePrStore((s) => s.pullRequests);
  const closed = usePrStore((s) => s.closedPullRequests);
  const ado = useSettingsStore((s) => s.settings.azureDevOps);
  return useMemo(
    () =>
      candidates({
        items: [...(overview?.items ?? []), ...(overview?.context ?? [])],
        organization: ado.organization || null,
        project: ado.project || null,
        pullRequests: [...open, ...closed],
        threads: [...threads].sort(
          (a, b) =>
            Number(b.open) - Number(a.open) || b.lastActivityAt.localeCompare(a.lastActivityAt),
        ),
        hosts,
      }),
    [overview, threads, hosts, open, closed, ado.organization, ado.project],
  );
}

/** What a pasted text points at, with the BorgDock title when the record is known. */
export function useParsed(query: string, known: readonly Candidate[]) {
  const ado = useSettingsStore((s) => s.settings.azureDevOps);
  const hosts = useDispatchStore((s) => s.hosts);
  return useMemo(() => {
    const parsed = parseReference(query, {
      adoOrganization: ado.organization || null,
      adoProject: ado.project || null,
      environments: hosts.flatMap((h) =>
        h.environmentId ? [{ environmentId: h.environmentId, hostId: h.id }] : [],
      ),
    });
    if (!parsed || 'error' in parsed) return parsed;
    const key = refKey(parsed.ref);
    const match = known.find((c) => c.key === key);
    return { ref: parsed.ref, key, label: match?.label ?? '' };
  }, [query, ado.organization, ado.project, hosts, known]);
}

interface LinkPickerProps {
  workstreamId: string;
  preset?: PendingAdd;
  onClose: () => void;
}

/**
 * LinkPicker — adds records to a workstream: paste an address (a pull
 * request, a work item, `AB#123`, `owner/repo#12`, a T3 thread link, any
 * page) or search what BorgDock already knows. Several at once, all with
 * one role and note.
 */
export function LinkPicker({ workstreamId, preset, onClose }: LinkPickerProps) {
  const document = useWorkstreamsStore((s) => s.entries[workstreamId]?.document);
  const all = useCandidates();
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Map<string, Chosen>>(
    () => new Map((preset?.refs ?? []).map((r) => [refKey(r.ref), r])),
  );
  const [role, setRole] = useState<MemberRole>('supporting');
  const [note, setNote] = useState('');
  const parsed = useParsed(query, all);
  const members = new Set(document?.members.map((m) => m.key) ?? []);
  const results = useMemo(
    () => (parsed && !('error' in parsed) ? [] : searchCandidates(all, query)),
    [all, query, parsed],
  );

  const toggle = (key: string, value: Chosen) =>
    setChosen((current) => {
      const next = new Map(current);
      if (next.has(key)) next.delete(key);
      else next.set(key, value);
      return next;
    });

  const add = () => {
    if (!document || chosen.size === 0) return;
    const added: NewMember[] = [...chosen.values()].map((c) => ({
      ref: c.ref,
      label: c.label,
      role,
      note,
    }));
    if (wsEdit(workstreamId, (d, c) => addMembers(d, added, c))) {
      showToast({
        tone: 'success',
        message: `Added ${plural(added.length, 'record')} to ${document.title}.`,
      });
      onClose();
    }
  };

  if (!document) return null;
  return (
    <Sheet
      title="Add records"
      subtitle={document.title}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <span className="bd-dp-sheet__spacer" />
          <Button variant="primary" size="md" disabled={chosen.size === 0} onClick={add}>
            {chosen.size === 0 ? 'Add' : `Add ${plural(chosen.size, 'record')}`}
          </Button>
        </>
      }
    >
      <Input
        autoFocus
        aria-label="Paste an address or search"
        placeholder="Paste a pull request, work item or T3 thread link, or search"
        leading={<Search size={13} aria-hidden="true" />}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (parsed && !('error' in parsed) && !members.has(parsed.key)) {
            toggle(parsed.key, { ref: parsed.ref, label: parsed.label });
            setQuery('');
          }
        }}
      />
      {parsed && 'error' in parsed && <p className="bd-ws-picker__error">{parsed.error}</p>}
      {parsed && !('error' in parsed) && (
        <ul className="bd-ws-picker__list" aria-label="Pasted record">
          <li>
            <button
              type="button"
              className="bd-ws-picker__row"
              aria-pressed={chosen.has(parsed.key)}
              disabled={members.has(parsed.key)}
              onClick={() => toggle(parsed.key, { ref: parsed.ref, label: parsed.label })}
            >
              <span className="bd-ws-picker__check">
                {chosen.has(parsed.key) && <Check size={12} />}
              </span>
              <Pill tone="neutral" icon={<Link2 size={11} />}>
                {KIND_LABEL[parsed.ref.kind]}
              </Pill>
              <span className="bd-ws-picker__identity">{shortIdentity(parsed.ref)}</span>
              <span className="bd-ws-picker__label">
                {members.has(parsed.key)
                  ? 'In the workstream already'
                  : parsed.label || 'BorgDock reads it once it is added'}
              </span>
            </button>
          </li>
        </ul>
      )}
      {results.length > 0 && (
        <ul className="bd-ws-picker__list" aria-label="Known records">
          {results.map((candidate) => {
            const member = members.has(candidate.key);
            const on = chosen.has(candidate.key);
            return (
              <li key={candidate.key}>
                <button
                  type="button"
                  className={clsx('bd-ws-picker__row', on && 'bd-ws-picker__row--on')}
                  aria-pressed={on}
                  disabled={member || !!candidate.unavailable}
                  title={candidate.unavailable}
                  onClick={() =>
                    toggle(candidate.key, { ref: candidate.ref, label: candidate.label })
                  }
                >
                  <span className="bd-ws-picker__check">{on && <Check size={12} />}</span>
                  <Pill tone="ghost">
                    {candidate.kind === 'item' ? 'Item' : candidate.kind === 'pr' ? 'PR' : 'Thread'}
                  </Pill>
                  <span className="bd-ws-picker__identity">{candidate.identity}</span>
                  <span className="bd-ws-picker__label">
                    {member ? `${candidate.label} · in the workstream` : candidate.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {results.length === 0 && !parsed && query.trim() && (
        <p className="bd-dp-sheet__hint">
          Nothing BorgDock knows matches. Paste the record's address instead.
        </p>
      )}
      {chosen.size > 0 && (
        <section aria-label="Chosen" className="bd-ws-picker__chosen">
          <h3 className="bd-dp-sheet__label">Adding</h3>
          <ul>
            {[...chosen.entries()].map(([key, c]) => (
              <li key={key}>
                <span className="bd-ws-picker__identity">{shortIdentity(c.ref)}</span>
                <span className="bd-ws-picker__label">{c.label}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggle(key, c)}
                  aria-label={`Leave out ${shortIdentity(c.ref)}`}
                >
                  Leave out
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="bd-dp-sheet__row">
        <label className="bd-ws-field">
          <span className="bd-dp-sheet__label">Role</span>
          <Select
            ariaLabel="Role"
            value={role}
            options={MEMBER_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            onChange={(next) => setRole(next as MemberRole)}
          />
        </label>
        <label className="bd-ws-field bd-ws-field--grow">
          <span className="bd-dp-sheet__label">Note (optional)</span>
          <Input
            aria-label="Note"
            value={note}
            maxLength={LIMITS.note}
            placeholder="Why it belongs here"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
    </Sheet>
  );
}
