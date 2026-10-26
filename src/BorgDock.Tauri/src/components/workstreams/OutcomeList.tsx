import { ArrowDown, ArrowUp, MoreHorizontal, Plus, X } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Checkbox,
  IconButton,
  Input,
  Pill,
  type PillTone,
} from '@/components/shared/primitives';
import type { Assessment, OutcomeStatus } from '@/services/workstreams/attention';
import {
  addOutcome,
  moveOutcome,
  removeOutcome,
  removeRule,
  unconfirmOutcome,
  updateOutcome,
} from '@/services/workstreams/edits';
import { ruleKind } from '@/services/workstreams/rules';
import { LIMITS, type Outcome, type WorkstreamDocument } from '@/services/workstreams/types';
import { nodeLabel } from './labels';
import { Menu } from './Menu';
import { AddRuleSheet, ConfirmOutcomeSheet } from './OutcomeSheets';
import { RelationSheet } from './RelationSheet';
import { stamp, wsEdit, wsEditUndoable } from './ws-ui';

interface OutcomeListProps {
  document: WorkstreamDocument;
  assessment: Assessment | undefined;
  readOnly: boolean;
}

type Sheet = { kind: 'confirm' | 'rule' | 'blocker'; outcome: Outcome } | null;

function statusBadge(status: OutcomeStatus): { tone: PillTone; label: string } {
  const state = status.outcome.verification.state;
  if (status.contradicted && (state === 'verified' || state === 'confirmed')) {
    return { tone: 'error', label: 'No longer holds' };
  }
  if (state === 'invalidated' && !status.rulesMet)
    return { tone: 'error', label: 'No longer holds' };
  const done = state === 'verified' || state === 'confirmed' || status.rulesMet;
  if (done && status.blockers.length > 0) return { tone: 'warning', label: 'Met, blocked' };
  if (state === 'confirmed') return { tone: 'success', label: 'Confirmed by you' };
  if (state === 'verified' || status.rulesMet)
    return { tone: 'success', label: 'Verified by rule' };
  return { tone: 'neutral', label: 'Not verified' };
}

const RESULT_TONE: Record<string, PillTone> = { met: 'success', unmet: 'error', unknown: 'ghost' };

function Provenance({
  document,
  assessment,
  outcome,
}: {
  document: WorkstreamDocument;
  assessment: Assessment | undefined;
  outcome: Outcome;
}) {
  const v = outcome.verification;
  if (v.state === 'verified') {
    return (
      <p className="bd-ws-muted">
        Verified by rule on {v.device ?? 'a machine'}, {stamp(v.at)}:{' '}
        {v.facts.map((f) => f.summary).join('; ')}
      </p>
    );
  }
  if (v.state === 'confirmed') {
    return (
      <p className="bd-ws-muted">
        Confirmed by you{v.proposedBy ? ' (proposed by the agent)' : ''} on{' '}
        {v.device ?? 'a machine'}, {stamp(v.at)}: "{v.note}" · evidence:{' '}
        {v.evidence.map((key) => nodeLabel(document, assessment, key)).join(', ')}
      </p>
    );
  }
  if (v.state === 'invalidated') {
    return (
      <p className="bd-ws-muted">
        Stopped holding on {v.device ?? 'a machine'}, {stamp(v.at)}:{' '}
        {v.facts
          .filter((f) => f.result === 'unmet')
          .map((f) => f.summary)
          .join('; ')}
      </p>
    );
  }
  return null;
}

/**
 * OutcomeList — what the goal needs, in order. Each outcome shows its rules
 * and what they found, who or what verified it and when, and what blocks it.
 */
export function OutcomeList({ document, assessment, readOnly }: OutcomeListProps) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [adding, setAdding] = useState<{ title: string; required: boolean } | null>(null);
  // The document is the truth for what you wrote; the assessment, built a
  // moment later, adds what the sources say.
  const statuses: OutcomeStatus[] = document.outcomes.map((outcome) => {
    const assessed = assessment?.outcomes.find((s) => s.outcome.id === outcome.id);
    return assessed
      ? { ...assessed, outcome }
      : {
          outcome,
          key: `outcome:${outcome.id}`,
          rules: [],
          rulesMet: false,
          contradicted: false,
          blockers: [],
          counts: false,
          unavailable: [],
        };
  });

  const add = () => {
    if (!adding) return;
    if (wsEdit(document.id, (d, c) => addOutcome(d, adding.title, adding.required, [], c)))
      setAdding(null);
  };

  return (
    <section className="bd-ws-panel" aria-label="Outcomes">
      <header className="bd-ws-panel__head">
        <h2 className="bd-ws-panel__title">Outcomes</h2>
        {assessment && assessment.progress.required > 0 && (
          <span className="bd-ws-muted">
            {assessment.progress.counted} of {assessment.progress.required} required verified
          </span>
        )}
        {!readOnly && !adding && (
          <Button
            variant="ghost"
            size="sm"
            leading={<Plus size={12} />}
            onClick={() => setAdding({ title: '', required: true })}
          >
            Add outcome
          </Button>
        )}
      </header>
      {statuses.length === 0 && !adding && (
        <p className="bd-ws-muted">
          Name what has to be true for the goal: "Customers pay in one step", "Old checkout
          removed". Give each a rule BorgDock can check, or confirm it yourself with evidence.
        </p>
      )}
      <ol className="bd-ws-outcomes">
        {statuses.map((status, index) => {
          const outcome = status.outcome;
          const badge = statusBadge(status);
          return (
            <li key={outcome.id} className="bd-ws-outcome" data-counts={status.counts || undefined}>
              <div className="bd-ws-outcome__head">
                <span className="bd-ws-outcome__title">{outcome.title}</span>
                {!outcome.required && <Pill tone="ghost">Optional</Pill>}
                <Pill tone={badge.tone}>{badge.label}</Pill>
                {!readOnly && (
                  <span className="bd-ws-outcome__tools">
                    <IconButton
                      icon={<ArrowUp size={12} />}
                      size={22}
                      aria-label={`Move "${outcome.title}" up`}
                      disabled={index === 0}
                      onClick={() => wsEdit(document.id, (d) => moveOutcome(d, outcome.id, -1))}
                    />
                    <IconButton
                      icon={<ArrowDown size={12} />}
                      size={22}
                      aria-label={`Move "${outcome.title}" down`}
                      disabled={index === statuses.length - 1}
                      onClick={() => wsEdit(document.id, (d) => moveOutcome(d, outcome.id, 1))}
                    />
                    <Menu
                      label={`Outcome ${outcome.title}`}
                      trigger={(props) => (
                        <IconButton
                          {...props}
                          icon={<MoreHorizontal size={13} />}
                          size={22}
                          aria-label={`More for "${outcome.title}"`}
                        />
                      )}
                      groups={[
                        {
                          items: [
                            {
                              id: 'rule',
                              label: 'Add a rule…',
                              onSelect: () => setSheet({ kind: 'rule', outcome }),
                            },
                            {
                              id: 'confirm',
                              label: 'Confirm with evidence…',
                              onSelect: () => setSheet({ kind: 'confirm', outcome }),
                            },
                            ...(outcome.verification.state !== 'unverified'
                              ? [
                                  {
                                    id: 'unconfirm',
                                    label: 'Take back the verification',
                                    onSelect: () =>
                                      wsEdit(document.id, (d, c) =>
                                        unconfirmOutcome(d, outcome.id, c),
                                      ),
                                  },
                                ]
                              : []),
                            {
                              id: 'blocker',
                              label: 'Blocked by…',
                              onSelect: () => setSheet({ kind: 'blocker', outcome }),
                            },
                            {
                              id: 'required',
                              label: outcome.required ? 'Make optional' : 'Make required',
                              onSelect: () =>
                                wsEdit(document.id, (d) =>
                                  updateOutcome(d, outcome.id, { required: !outcome.required }),
                                ),
                            },
                          ],
                        },
                        {
                          items: [
                            {
                              id: 'remove',
                              label: 'Remove outcome',
                              danger: true,
                              onSelect: () =>
                                wsEditUndoable(
                                  document.id,
                                  (d, c) => removeOutcome(d, outcome.id, c),
                                  `Removed "${outcome.title}"`,
                                ),
                            },
                          ],
                        },
                      ]}
                    />
                  </span>
                )}
              </div>
              {status.rules.length > 0 && (
                <ul className="bd-ws-rules" aria-label="Rules">
                  {status.rules.map((rule) => (
                    <li key={rule.rule.id}>
                      <Pill tone={RESULT_TONE[rule.result] ?? 'ghost'}>
                        {ruleKind(rule.rule.kind)?.describe(rule.rule) ?? rule.rule.kind}
                      </Pill>
                      <span className="bd-ws-muted">{rule.summary}</span>
                      {!readOnly && (
                        <IconButton
                          icon={<X size={11} />}
                          size={22}
                          aria-label="Remove rule"
                          onClick={() =>
                            wsEdit(document.id, (d) => removeRule(d, outcome.id, rule.rule.id))
                          }
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <Provenance document={document} assessment={assessment} outcome={outcome} />
              {status.blockers.length > 0 && (
                <p className="bd-ws-outcome__blocked">
                  Blocked by {status.blockers.map((b) => b.name).join(', ')}
                </p>
              )}
              {status.unavailable.length > 0 && (
                <p className="bd-ws-muted">
                  Can't read now:{' '}
                  {status.unavailable
                    .map((m) => `${m.identity} (${m.reason ?? m.freshness})`)
                    .join(', ')}
                </p>
              )}
              {!readOnly &&
                status.rules.length === 0 &&
                outcome.verification.state === 'unverified' && (
                  <div className="bd-ws-outcome__cta">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSheet({ kind: 'rule', outcome })}
                    >
                      Add a rule
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSheet({ kind: 'confirm', outcome })}
                    >
                      Confirm with evidence
                    </Button>
                  </div>
                )}
            </li>
          );
        })}
      </ol>
      {adding && (
        <div className="bd-ws-outcome-form">
          <Input
            autoFocus
            aria-label="Outcome"
            value={adding.title}
            maxLength={LIMITS.title}
            placeholder="Customers pay in one step"
            onChange={(e) => setAdding({ ...adding, title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setAdding(null);
              }
            }}
          />
          <Checkbox
            checked={adding.required}
            label="Required for the goal"
            onChange={(required) => setAdding({ ...adding, required })}
          />
          <Button variant="ghost" size="sm" onClick={() => setAdding(null)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" disabled={!adding.title.trim()} onClick={add}>
            Add
          </Button>
        </div>
      )}
      {sheet?.kind === 'confirm' && (
        <ConfirmOutcomeSheet
          document={document}
          assessment={assessment}
          outcome={sheet.outcome}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'rule' && (
        <AddRuleSheet
          document={document}
          assessment={assessment}
          outcome={sheet.outcome}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'blocker' && (
        <RelationSheet
          document={document}
          assessment={assessment}
          preset={{ kind: 'blocks', to: `outcome:${sheet.outcome.id}` }}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  );
}
