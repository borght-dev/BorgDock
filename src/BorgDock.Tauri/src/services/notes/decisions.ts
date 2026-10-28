/**
 * Workstream decisions as notes: deciding between alternatives in a
 * workstream writes a decision record to `Decisions/`, and the workstream
 * keeps the note as a link member (`borgdock://notes/<path>`), which opens
 * in the Notes section.
 */
import { addMembers } from '@/services/workstreams/edits';
import { sourceUrl } from '@/services/workstreams/identity';
import type { Member, RefKey, WorkstreamDocument } from '@/services/workstreams/types';
import { useNotesStore } from '@/stores/notes-store';
import { useWorkstreamsStore } from '@/stores/workstreams-store';
import { titleOf } from './parse';
import { DECISIONS_FOLDER, dayKey } from './paths';

const NOTE_URL_PREFIX = 'borgdock://notes/';

export function noteUrl(path: string): string {
  return `${NOTE_URL_PREFIX}${encodeURIComponent(path)}`;
}

/** The vault path a `borgdock://notes/…` address names, or `null`. */
export function notePathOfUrl(url: string): string | null {
  if (!url.startsWith(NOTE_URL_PREFIX)) return null;
  try {
    return decodeURIComponent(url.slice(NOTE_URL_PREFIX.length));
  } catch {
    return null;
  }
}

/** A member as text a note's chips understand: short refs where they exist. */
export function memberRef(member: Member | undefined, key: RefKey): string {
  if (!member) return key;
  const ref = member.ref;
  const label = member.label.replace(/[[\]]/g, '');
  switch (ref.kind) {
    case 'github-pr':
      return `${ref.owner}/${ref.repo}#${ref.number}${label ? ` ${label}` : ''}`;
    case 'ado-item':
      return `AB#${ref.id}${label ? ` ${label}` : ''}`;
    case 't3-thread':
    case 'link':
      return `[${label || key}](${sourceUrl(ref)})`;
  }
}

export function decisionNoteText(
  document: WorkstreamDocument,
  decisionId: string,
  chosen: RefKey,
  rationale: string,
  date: Date,
): string | null {
  const decision = document.decisions.find((d) => d.id === decisionId);
  if (!decision) return null;
  const member = (key: RefKey) => document.members.find((m) => m.key === key);
  const title = document.title.replace(/[[\]]/g, '');
  return [
    `# ${decision.question}`,
    '',
    `Workstream: [${title}](borgdock://workstreams/${encodeURIComponent(document.id)})`,
    `Decided: ${dayKey(date)}`,
    '',
    '## Chosen',
    `- ${memberRef(member(chosen), chosen)}`,
    '',
    '## Set aside',
    ...decision.options.filter((k) => k !== chosen).map((k) => `- ${memberRef(member(k), k)}`),
    '',
    '## Why',
    rationale.trim() || '_No reason given._',
    '',
  ].join('\n');
}

/**
 * Write the decision record and add it to the workstream. A failure leaves
 * the decision itself in place: the record is extra.
 */
export async function recordDecisionNote(
  workstreamId: string,
  decisionId: string,
  chosen: RefKey,
  rationale: string,
): Promise<string | null> {
  const entry = useWorkstreamsStore.getState().entries[workstreamId];
  if (!entry) return null;
  const date = new Date();
  const text = decisionNoteText(entry.document, decisionId, chosen, rationale, date);
  if (!text) return null;
  const question =
    entry.document.decisions.find((d) => d.id === decisionId)?.question ?? 'Decision';
  const path = await useNotesStore
    .getState()
    .createNote(`${dayKey(date)} ${question}`, DECISIONS_FOLDER, text);
  useWorkstreamsStore.getState().edit(workstreamId, (d, c) =>
    addMembers(
      d,
      [
        {
          ref: { kind: 'link', url: noteUrl(path), title: titleOf(path) },
          label: `Decision note: ${titleOf(path)}`,
          role: 'context',
        },
      ],
      c,
    ),
  );
  return path;
}
