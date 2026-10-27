import { ChevronRight, MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button, Dot, IconButton, Input, Pill } from '@/components/shared/primitives';
import {
  type MemberAction,
  memberActions,
  openOriginal,
  runMemberAction,
} from '@/services/workstreams/actions';
import type { Assessment } from '@/services/workstreams/attention';
import {
  addMembers,
  dismissSuggestion,
  relinkMember,
  removeMember,
  setMemberRole,
} from '@/services/workstreams/edits';
import { KIND_LABEL } from '@/services/workstreams/identity';
import { asOfLabel, type ResolvedMember } from '@/services/workstreams/resolve';
import type { MemberSuggestion } from '@/services/workstreams/suggest';
import {
  MEMBER_ROLES,
  type MemberRole,
  type RefKey,
  ROLE_LABEL,
  type WorkstreamDocument,
} from '@/services/workstreams/types';
import { useWorkstreamsUiStore } from '@/stores/workstreams-ui-store';
import { useParsed } from './LinkPicker';
import { Menu } from './Menu';
import { RelationSheet } from './RelationSheet';
import { Sheet } from './Sheet';
import { FRESHNESS_DOT, plural, TONE_PILL, wsEdit, wsEditUndoable } from './ws-ui';

interface MembersTabProps {
  document: WorkstreamDocument;
  assessment: Assessment | undefined;
  suggestions: readonly MemberSuggestion[];
  readOnly: boolean;
}

function RelinkSheet({
  document,
  member,
  onClose,
}: {
  document: WorkstreamDocument;
  member: ResolvedMember;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const parsed = useParsed(query, []);
  const sameKind = parsed && !('error' in parsed) && parsed.ref.kind === member.member.ref.kind;
  const relink = () => {
    if (!parsed || 'error' in parsed) return;
    if (wsEdit(document.id, (d, c) => relinkMember(d, member.member.key, parsed.ref, c))) onClose();
  };
  return (
    <Sheet
      title={`Relink ${member.identity}`}
      subtitle="Point this record at where it lives now. Relations, rules and evidence follow it."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <span className="bd-dp-sheet__spacer" />
          <Button variant="primary" size="md" disabled={!sameKind} onClick={relink}>
            Relink
          </Button>
        </>
      }
    >
      {member.reason && <p className="bd-dp-sheet__hint">{member.reason}</p>}
      <Input
        autoFocus
        aria-label="New address"
        placeholder={`Paste the ${KIND_LABEL[member.member.ref.kind].toLowerCase()}'s address`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {parsed && 'error' in parsed && <p className="bd-ws-picker__error">{parsed.error}</p>}
      {parsed && !('error' in parsed) && !sameKind && (
        <p className="bd-ws-picker__error">
          That is a {KIND_LABEL[parsed.ref.kind].toLowerCase()}, not the same kind.
        </p>
      )}
    </Sheet>
  );
}

function relationSummary(
  assessment: Assessment | undefined,
  document: WorkstreamDocument,
  key: RefKey,
): string {
  const blocks = document.relations.filter((r) => r.kind === 'blocks' && r.from === key).length;
  const blockedBy = assessment?.blockedBy.get(key)?.length ?? 0;
  const supersedes = document.relations.filter(
    (r) => r.kind === 'supersedes' && r.from === key,
  ).length;
  return [
    blocks > 0 && `blocks ${blocks}`,
    blockedBy > 0 && `blocked by ${blockedBy}`,
    supersedes > 0 && `supersedes ${supersedes}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function MemberRow({
  document,
  assessment,
  resolved,
  readOnly,
  onRelation,
  onRelink,
  onAction,
}: {
  document: WorkstreamDocument;
  assessment: Assessment | undefined;
  resolved: ResolvedMember;
  readOnly: boolean;
  onRelation: (key: RefKey) => void;
  onRelink: (member: ResolvedMember) => void;
  onAction: (member: ResolvedMember, action: MemberAction) => void;
}) {
  const member = resolved.member;
  const relations = relationSummary(assessment, document, member.key);
  const actions = memberActions(resolved);
  const kind =
    member.ref.kind === 'ado-item'
      ? 'Item'
      : member.ref.kind === 'github-pr'
        ? 'PR'
        : member.ref.kind === 't3-thread'
          ? 'Thread'
          : 'Link';
  return (
    <tr className="bd-ws-member" data-key={member.key} data-freshness={resolved.freshness}>
      <td>
        <Pill tone="ghost">{kind}</Pill>
      </td>
      <td className="bd-ws-member__identity">
        <button type="button" className="bd-ws-member__open" onClick={() => openOriginal(resolved)}>
          {resolved.identity}
        </button>
      </td>
      <td className="bd-ws-member__title">
        <span>{resolved.title}</span>
        {resolved.freshness !== 'live' && resolved.reason && (
          <span className="bd-ws-muted">{resolved.reason}</span>
        )}
        {member.note && <span className="bd-ws-muted">{member.note}</span>}
      </td>
      <td>
        {resolved.stateLabel && (
          <Pill tone={resolved.tone ? TONE_PILL[resolved.tone] : 'ghost'}>
            {resolved.stateLabel}
          </Pill>
        )}
      </td>
      <td className="bd-ws-member__fresh" title={resolved.reason ?? undefined}>
        <Dot tone={FRESHNESS_DOT[resolved.freshness]} size={6} />
        <span>{asOfLabel(resolved)}</span>
      </td>
      <td className="bd-ws-muted">{relations}</td>
      <td>
        <Menu
          label={`${resolved.identity} actions`}
          trigger={(props) => (
            <IconButton
              {...props}
              icon={<MoreHorizontal size={13} />}
              size={22}
              aria-label={`Actions for ${resolved.identity}`}
            />
          )}
          groups={[
            {
              items: [
                { id: 'open', label: 'Open the original', onSelect: () => openOriginal(resolved) },
                ...actions.map((action) => ({
                  id: action.id,
                  label: action.label,
                  danger: action.danger,
                  onSelect: () => onAction(resolved, action),
                })),
              ],
            },
            {
              label: 'Role',
              items: readOnly
                ? []
                : MEMBER_ROLES.map((role) => ({
                    id: `role:${role}`,
                    label: ROLE_LABEL[role],
                    hint: role === member.role ? 'now' : undefined,
                    disabled: role === member.role,
                    onSelect: () =>
                      wsEdit(document.id, (d, c) =>
                        setMemberRole(d, member.key, role as MemberRole, c),
                      ),
                  })),
            },
            {
              items: readOnly
                ? []
                : [
                    {
                      id: 'relation',
                      label: 'Add a relation…',
                      onSelect: () => onRelation(member.key),
                    },
                    { id: 'relink', label: 'Relink…', onSelect: () => onRelink(resolved) },
                    {
                      id: 'remove',
                      label: 'Remove from the workstream',
                      danger: true,
                      onSelect: () =>
                        wsEditUndoable(
                          document.id,
                          (d, c) => removeMember(d, member.key, c),
                          `Removed ${resolved.identity}`,
                        ),
                    },
                  ],
            },
          ]}
        />
      </td>
    </tr>
  );
}

const ROLE_HINT: Record<MemberRole, string> = {
  primary: 'The implementation being kept',
  supporting: 'Work the goal needs',
  context: 'Background: epics, specs, runs',
  superseded: 'Replaced by another approach',
};

/**
 * MembersTab — every record in the workstream, by role: what it is, where it
 * stands at its source and how current that is. Superseded ones are folded
 * away. Records BorgDock thinks belong here are offered above the table.
 */
export function MembersTab({ document, assessment, suggestions, readOnly }: MembersTabProps) {
  const openPicker = useWorkstreamsUiStore((s) => s.openPicker);
  const [relationFrom, setRelationFrom] = useState<RefKey | null>(null);
  const [relinking, setRelinking] = useState<ResolvedMember | null>(null);
  const [confirming, setConfirming] = useState<{
    member: ResolvedMember;
    action: MemberAction;
  } | null>(null);
  const [closing, setClosing] = useState<{ member: ResolvedMember; comment: string } | null>(null);
  const [showSuperseded, setShowSuperseded] = useState(false);
  const resolved = [...(assessment?.members.values() ?? [])];

  const onAction = (member: ResolvedMember, action: MemberAction) => {
    if (action.id === 'pr:close') setClosing({ member, comment: '' });
    else if (action.confirm) setConfirming({ member, action });
    else void runMemberAction(document.id, member.member.key, action.id);
  };

  return (
    <div className="bd-ws-members">
      <div className="bd-ws-members__bar">
        <span className="bd-ws-muted">{plural(document.members.length, 'record')}</span>
        {!readOnly && (
          <Button
            variant="primary"
            size="sm"
            leading={<Plus size={12} />}
            aria-keyshortcuts="L"
            onClick={() => openPicker(document.id)}
          >
            Add records
          </Button>
        )}
      </div>
      {!readOnly && suggestions.length > 0 && (
        <section className="bd-ws-suggestions" aria-label="Suggested records">
          <h3 className="bd-dp-sheet__label">BorgDock thinks these belong here</h3>
          <ul>
            {suggestions.map((suggestion) => (
              <li key={suggestion.id}>
                <Pill tone="ghost">{KIND_LABEL[suggestion.ref.kind]}</Pill>
                <span className="bd-ws-member__title">
                  <span>{suggestion.label}</span>
                  <span className="bd-ws-muted">{suggestion.why}</span>
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    wsEdit(document.id, (d, c) =>
                      addMembers(
                        d,
                        [{ ref: suggestion.ref, label: suggestion.label, addedBy: 'suggestion' }],
                        c,
                      ),
                    )
                  }
                >
                  Add
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => wsEdit(document.id, (d) => dismissSuggestion(d, suggestion.id))}
                >
                  Not this one
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {document.members.length === 0 && (
        <div className="bd-wb-empty">
          <p>No records yet. Add the work items, threads and pull requests that serve the goal.</p>
        </div>
      )}
      {MEMBER_ROLES.map((role) => {
        const rows = resolved.filter((m) => m.member.role === role);
        if (rows.length === 0) return null;
        const folded = role === 'superseded' && !showSuperseded;
        return (
          <section key={role} className="bd-ws-role" aria-label={ROLE_LABEL[role]}>
            <header className="bd-ws-role__head">
              {role === 'superseded' ? (
                <button
                  type="button"
                  className="bd-ws-role__toggle"
                  aria-expanded={!folded}
                  onClick={() => setShowSuperseded(!showSuperseded)}
                >
                  <ChevronRight size={12} aria-hidden="true" data-open={!folded || undefined} />
                  {ROLE_LABEL[role]} ({rows.length})
                </button>
              ) : (
                <h3>
                  {ROLE_LABEL[role]} ({rows.length})
                </h3>
              )}
              <span className="bd-ws-muted">{ROLE_HINT[role]}</span>
            </header>
            {!folded && (
              <table className="bd-ws-table">
                <colgroup>
                  <col className="bd-ws-table__kind" />
                  <col className="bd-ws-table__identity" />
                  <col />
                  <col className="bd-ws-table__state" />
                  <col className="bd-ws-table__fresh" />
                  <col className="bd-ws-table__relations" />
                  <col className="bd-ws-table__menu" />
                </colgroup>
                <thead className="sr-only">
                  <tr>
                    <th>Kind</th>
                    <th>Record</th>
                    <th>Title</th>
                    <th>State</th>
                    <th>Freshness</th>
                    <th>Relations</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((member) => (
                    <MemberRow
                      key={member.member.key}
                      document={document}
                      assessment={assessment}
                      resolved={member}
                      readOnly={readOnly}
                      onRelation={setRelationFrom}
                      onRelink={setRelinking}
                      onAction={onAction}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
      {relationFrom && (
        <RelationSheet
          document={document}
          assessment={assessment}
          preset={{ from: relationFrom }}
          onClose={() => setRelationFrom(null)}
        />
      )}
      {relinking && (
        <RelinkSheet document={document} member={relinking} onClose={() => setRelinking(null)} />
      )}
      {confirming && (
        <ConfirmDialog
          isOpen
          title={confirming.action.confirm!.title}
          message={confirming.action.confirm!.message}
          confirmLabel={confirming.action.confirm!.label}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const target = confirming;
            setConfirming(null);
            void runMemberAction(document.id, target.member.member.key, target.action.id);
          }}
        />
      )}
      {closing && (
        <Sheet
          title={`Close ${closing.member.identity}?`}
          subtitle="The comment is posted on GitHub as you, then the pull request closes."
          onClose={() => setClosing(null)}
          footer={
            <>
              <Button variant="ghost" size="md" onClick={() => setClosing(null)}>
                Cancel
              </Button>
              <span className="bd-dp-sheet__spacer" />
              <Button
                variant="danger"
                size="md"
                onClick={() => {
                  const target = closing;
                  setClosing(null);
                  void runMemberAction(
                    document.id,
                    target.member.member.key,
                    'pr:close',
                    target.comment,
                  );
                }}
              >
                {closing.comment.trim() ? 'Comment and close' : 'Close'}
              </Button>
            </>
          }
        >
          <label className="bd-ws-field">
            <span className="bd-dp-sheet__label">Comment (optional)</span>
            <textarea
              autoFocus
              className="bd-dp-sheet__prompt bd-ws-goal__input"
              aria-label="Comment"
              rows={3}
              value={closing.comment}
              onChange={(e) => setClosing({ ...closing, comment: e.target.value })}
            />
          </label>
        </Sheet>
      )}
    </div>
  );
}
