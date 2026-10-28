import { Plus } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button, Checkbox, Input, Pill } from '@/components/shared/primitives';
import { recordDecisionNote } from '@/services/notes/decisions';
import { type MemberAction, memberActions, runMemberAction } from '@/services/workstreams/actions';
import type { Assessment } from '@/services/workstreams/attention';
import { decide, openDecision, removeDecision, reopenDecision } from '@/services/workstreams/edits';
import { shortIdentity } from '@/services/workstreams/identity';
import {
  type Decision,
  LIMITS,
  type RefKey,
  type WorkstreamDocument,
} from '@/services/workstreams/types';
import { toastError } from '@/stores/toast-store';
import { nodeLabel } from './labels';
import { Sheet } from './Sheet';
import { stamp, TONE_PILL, wsEdit, wsEditUndoable } from './ws-ui';

interface DecisionPanelProps {
  document: WorkstreamDocument;
  assessment: Assessment | undefined;
  readOnly: boolean;
}

function NewDecisionSheet({
  document,
  assessment,
  onClose,
}: {
  document: WorkstreamDocument;
  assessment: Assessment | undefined;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<Set<RefKey>>(new Set());
  const open = () => {
    if (wsEdit(document.id, (d, c) => openDecision(d, question, [...options], c))) onClose();
  };
  const candidates = document.members.filter((m) => m.ref.kind !== 'link');
  return (
    <Sheet
      title="New decision"
      subtitle="Two or more approaches to the same thing. Choosing one marks the others superseded."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <span className="bd-dp-sheet__spacer" />
          <Button
            variant="primary"
            size="md"
            disabled={!question.trim() || options.size < 2}
            onClick={open}
          >
            Open decision
          </Button>
        </>
      }
    >
      <label className="bd-ws-field">
        <span className="bd-dp-sheet__label">What has to be decided</span>
        <Input
          autoFocus
          aria-label="Question"
          value={question}
          maxLength={LIMITS.title}
          placeholder="Keep the queue rewrite or the patch?"
          onChange={(e) => setQuestion(e.target.value)}
        />
      </label>
      <section aria-label="Alternatives">
        <h3 className="bd-dp-sheet__label">The alternatives (pick two or more)</h3>
        <div className="bd-ws-checklist">
          {candidates.map((member) => (
            <Checkbox
              key={member.key}
              checked={options.has(member.key)}
              label={nodeLabel(document, assessment, member.key)}
              hint={assessment?.members.get(member.key)?.stateLabel}
              onChange={(on) =>
                setOptions((current) => {
                  const next = new Set(current);
                  if (on) next.add(member.key);
                  else next.delete(member.key);
                  return next;
                })
              }
            />
          ))}
        </div>
      </section>
    </Sheet>
  );
}

function DecideSheet({
  document,
  assessment,
  decision,
  chosen,
  onClose,
}: {
  document: WorkstreamDocument;
  assessment: Assessment | undefined;
  decision: Decision;
  chosen: RefKey;
  onClose: () => void;
}) {
  const [rationale, setRationale] = useState('');
  const others = decision.options.filter((key) => key !== chosen);
  const go = () => {
    if (!wsEdit(document.id, (d, c) => decide(d, decision.id, chosen, rationale, c))) return;
    onClose();
    // The decision record lands in Decisions/ in the notes vault, linked from the workstream.
    recordDecisionNote(document.id, decision.id, chosen, rationale).catch((error) =>
      toastError('Decision note not written', error),
    );
  };
  return (
    <Sheet
      title={`Keep ${nodeLabel(document, assessment, chosen)}?`}
      subtitle={decision.question}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <span className="bd-dp-sheet__spacer" />
          <Button variant="primary" size="md" onClick={go}>
            Decide
          </Button>
        </>
      }
    >
      <p className="bd-dp-sheet__hint">
        These become superseded here:{' '}
        {others.map((key) => nodeLabel(document, assessment, key)).join(', ')}. Nothing is closed,
        settled or moved at its source; BorgDock offers that next.
      </p>
      <label className="bd-ws-field">
        <span className="bd-dp-sheet__label">Why (it stays with the decision)</span>
        <textarea
          autoFocus
          className="bd-dp-sheet__prompt bd-ws-goal__input"
          aria-label="Why"
          rows={3}
          maxLength={LIMITS.note}
          value={rationale}
          placeholder="Smaller change, and it keeps the old API."
          onChange={(e) => setRationale(e.target.value)}
        />
      </label>
    </Sheet>
  );
}

const DEFAULT_CLOSE_COMMENT = (keptIdentity: string) => `Superseded by ${keptIdentity}.`;

function CloseSheet({
  identity,
  keptIdentity,
  onClose,
  onConfirm,
}: {
  identity: string;
  keptIdentity: string;
  onClose: () => void;
  onConfirm: (comment: string) => void;
}) {
  const [comment, setComment] = useState(DEFAULT_CLOSE_COMMENT(keptIdentity));
  return (
    <Sheet
      title={`Close ${identity}?`}
      subtitle="The comment is posted on GitHub as you, then the pull request closes."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <span className="bd-dp-sheet__spacer" />
          <Button variant="danger" size="md" onClick={() => onConfirm(comment)}>
            Comment and close
          </Button>
        </>
      }
    >
      <label className="bd-ws-field">
        <span className="bd-dp-sheet__label">Comment</span>
        <textarea
          className="bd-dp-sheet__prompt bd-ws-goal__input"
          aria-label="Comment"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </label>
    </Sheet>
  );
}

/**
 * The superseded alternatives of a decision that are still open at their
 * source, each with what can be done about it there. Every action asks first.
 */
function Cleanup({
  document,
  assessment,
  decision,
}: {
  document: WorkstreamDocument;
  assessment: Assessment | undefined;
  decision: Decision;
}) {
  const [confirming, setConfirming] = useState<{ key: RefKey; action: MemberAction } | null>(null);
  const kept = decision.chosen ? assessment?.members.get(decision.chosen) : undefined;
  const open = decision.options
    .filter((key) => key !== decision.chosen)
    .map((key) => assessment?.members.get(key))
    .filter((m): m is NonNullable<typeof m> => !!m && !m.resolved && m.freshness === 'live');
  if (open.length === 0) return null;
  return (
    <div className="bd-ws-cleanup">
      <h4 className="bd-dp-sheet__label">Clean up superseded work</h4>
      <ul>
        {open.map((member) => {
          const actions = memberActions(member).filter(
            (a) => a.id === 'pr:close' || a.id === 'thread:settle' || a.id === 'item:sync',
          );
          return (
            <li key={member.member.key}>
              <span>
                {member.identity} {member.title} · {member.stateLabel}
              </span>
              {actions.map((action) => (
                <Button
                  key={action.id}
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirming({ key: member.member.key, action })}
                >
                  {action.label}
                </Button>
              ))}
              {actions.length === 0 && (
                <span className="bd-ws-muted">Nothing to do from here.</span>
              )}
            </li>
          );
        })}
      </ul>
      {confirming?.action.id === 'pr:close' && (
        <CloseSheet
          identity={assessment?.members.get(confirming.key)?.identity ?? ''}
          keptIdentity={kept?.identity ?? 'another pull request'}
          onClose={() => setConfirming(null)}
          onConfirm={(comment) => {
            const target = confirming;
            setConfirming(null);
            void runMemberAction(document.id, target.key, target.action.id, comment);
          }}
        />
      )}
      {confirming && confirming.action.id !== 'pr:close' && (
        <ConfirmDialog
          isOpen
          title={confirming.action.confirm?.title ?? confirming.action.label}
          message={
            confirming.action.confirm?.message ??
            (confirming.action.id === 'item:sync'
              ? 'Dispatch opens the run sheet: an agent makes the move with the notes it needs.'
              : 'This changes the record at its source.')
          }
          confirmLabel={confirming.action.confirm?.label ?? 'Go ahead'}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const target = confirming;
            setConfirming(null);
            void runMemberAction(document.id, target.key, target.action.id);
          }}
        />
      )}
    </div>
  );
}

/**
 * DecisionPanel — the decisions between alternative approaches, open ones
 * first. Choosing keeps one and supersedes the rest, with the reason, and
 * offers to clean up the superseded work at its source.
 */
export function DecisionPanel({ document, assessment, readOnly }: DecisionPanelProps) {
  const [creating, setCreating] = useState(false);
  const [deciding, setDeciding] = useState<{ decision: Decision; chosen: RefKey } | null>(null);
  const decisions = [...document.decisions].sort(
    (a, b) => Number(a.status === 'decided') - Number(b.status === 'decided'),
  );

  return (
    <section className="bd-ws-panel" aria-label="Decisions">
      <header className="bd-ws-panel__head">
        <h2 className="bd-ws-panel__title">Decisions</h2>
        {!readOnly && (
          <Button
            variant="ghost"
            size="sm"
            leading={<Plus size={12} />}
            disabled={document.members.length < 2}
            onClick={() => setCreating(true)}
          >
            New decision
          </Button>
        )}
      </header>
      {decisions.length === 0 && (
        <p className="bd-ws-muted">
          When two threads or pull requests attempt the same thing, open a decision between them.
        </p>
      )}
      <ul className="bd-ws-decisions">
        {decisions.map((decision) => (
          <li key={decision.id} className="bd-ws-decision" data-status={decision.status}>
            <div className="bd-ws-decision__head">
              <span className="bd-ws-decision__question">{decision.question}</span>
              <Pill tone={decision.status === 'open' ? 'warning' : 'success'}>
                {decision.status === 'open' ? 'Open' : 'Decided'}
              </Pill>
              {!readOnly && decision.status === 'decided' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => wsEdit(document.id, (d, c) => reopenDecision(d, decision.id, c))}
                >
                  Reopen
                </Button>
              )}
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    wsEditUndoable(
                      document.id,
                      (d, c) => removeDecision(d, decision.id, c),
                      'Removed the decision',
                    )
                  }
                >
                  Remove
                </Button>
              )}
            </div>
            <ul className="bd-ws-decision__options">
              {decision.options.map((key) => {
                const member = assessment?.members.get(key);
                const ref = document.members.find((m) => m.key === key)?.ref;
                const kept = decision.chosen === key;
                return (
                  <li key={key} data-kept={kept || undefined}>
                    <span className="bd-ws-picker__identity">
                      {member?.identity ?? (ref ? shortIdentity(ref) : key)}
                    </span>
                    <span className="bd-ws-decision__option-title">{member?.title}</span>
                    {member?.stateLabel && (
                      <Pill tone={member.tone ? TONE_PILL[member.tone] : 'ghost'}>
                        {member.stateLabel}
                      </Pill>
                    )}
                    {kept && <Pill tone="success">Kept</Pill>}
                    {decision.status === 'decided' && !kept && <Pill tone="ghost">Superseded</Pill>}
                    {!readOnly && decision.status === 'open' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setDeciding({ decision, chosen: key })}
                      >
                        Keep this
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            {decision.status === 'decided' && (
              <p className="bd-ws-muted">
                Decided {stamp(decision.decidedAt)}
                {decision.rationale ? `: ${decision.rationale}` : ''}
              </p>
            )}
            {decision.status === 'decided' && !readOnly && (
              <Cleanup document={document} assessment={assessment} decision={decision} />
            )}
          </li>
        ))}
      </ul>
      {creating && (
        <NewDecisionSheet
          document={document}
          assessment={assessment}
          onClose={() => setCreating(false)}
        />
      )}
      {deciding && (
        <DecideSheet
          document={document}
          assessment={assessment}
          decision={deciding.decision}
          chosen={deciding.chosen}
          onClose={() => setDeciding(null)}
        />
      )}
    </section>
  );
}
