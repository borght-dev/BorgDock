import { useMemo, useState } from 'react';
import { Button, Checkbox, Input, Select } from '@/components/shared/primitives';
import type { Assessment } from '@/services/workstreams/attention';
import { addRule, confirmOutcome } from '@/services/workstreams/edits';
import { ruleKinds } from '@/services/workstreams/rules';
import {
  LIMITS,
  type Outcome,
  type RefKey,
  type WorkstreamDocument,
} from '@/services/workstreams/types';
import { nodeLabel } from './labels';
import { Sheet } from './Sheet';
import { wsEdit } from './ws-ui';

interface OutcomeSheetProps {
  document: WorkstreamDocument;
  assessment: Assessment | undefined;
  outcome: Outcome;
  onClose: () => void;
}

/**
 * Confirm an outcome by hand: point at what proves it and say why. The
 * outcome then shows as confirmed by you, with the device and the date.
 */
export function ConfirmOutcomeSheet({ document, assessment, outcome, onClose }: OutcomeSheetProps) {
  const [evidence, setEvidence] = useState<Set<RefKey>>(
    () => new Set(outcome.rules.map((r) => r.target)),
  );
  const [note, setNote] = useState('');
  const candidates = document.members.filter((m) => m.role !== 'superseded');
  const confirm = () => {
    if (wsEdit(document.id, (d, c) => confirmOutcome(d, outcome.id, [...evidence], note, c)))
      onClose();
  };
  return (
    <Sheet
      title={`Confirm "${outcome.title}"`}
      subtitle="Your confirmation stands as evidence, labelled as yours."
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
            disabled={evidence.size === 0 || !note.trim()}
            onClick={confirm}
          >
            Confirm
          </Button>
        </>
      }
    >
      <section aria-label="Evidence">
        <h3 className="bd-dp-sheet__label">What proves it</h3>
        {candidates.length === 0 ? (
          <p className="bd-dp-sheet__hint">
            Add the record or link that proves it to the workstream first.
          </p>
        ) : (
          <div className="bd-ws-checklist">
            {candidates.map((member) => (
              <Checkbox
                key={member.key}
                checked={evidence.has(member.key)}
                label={nodeLabel(document, assessment, member.key)}
                hint={assessment?.members.get(member.key)?.stateLabel}
                onChange={(on) =>
                  setEvidence((current) => {
                    const next = new Set(current);
                    if (on) next.add(member.key);
                    else next.delete(member.key);
                    return next;
                  })
                }
              />
            ))}
          </div>
        )}
      </section>
      <label className="bd-ws-field">
        <span className="bd-dp-sheet__label">
          Why this proves it{' '}
          <span>
            {note.length}/{LIMITS.note}
          </span>
        </span>
        <textarea
          className="bd-dp-sheet__prompt bd-ws-goal__input"
          aria-label="Why this proves it"
          rows={3}
          maxLength={LIMITS.note}
          value={note}
          placeholder="Paid with a test card on staging; the receipt arrived."
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
    </Sheet>
  );
}

/** Add an evidence rule: which record it reads, which fact, and the value it needs. */
export function AddRuleSheet({ document, assessment, outcome, onClose }: OutcomeSheetProps) {
  const kinds = ruleKinds();
  const readable = document.members.filter(
    (m) => m.role !== 'superseded' && kinds.some((k) => k.reads === m.ref.kind),
  );
  const [target, setTarget] = useState<RefKey>(readable[0]?.key ?? '');
  const member = document.members.find((m) => m.key === target);
  const applicable = kinds.filter((k) => k.reads === member?.ref.kind);
  const [kind, setKind] = useState(applicable[0]?.kind ?? '');
  const spec = applicable.find((k) => k.kind === kind) ?? applicable[0];
  const resolved = assessment?.members.get(target);
  const choices = useMemo(
    () => (spec?.value?.choices && resolved ? spec.value.choices(resolved) : []),
    [spec, resolved],
  );
  const [value, setValue] = useState('');
  const missingValue = spec?.value?.required && !value.trim();

  const add = () => {
    if (!spec || !target) return;
    const rule = { kind: spec.kind, target, value: value.trim() || null };
    if (wsEdit(document.id, (d) => addRule(d, outcome.id, rule))) onClose();
  };

  return (
    <Sheet
      title={`Add a rule to "${outcome.title}"`}
      subtitle="When every rule holds from live evidence, the outcome is verified by rule."
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
            disabled={!spec || !target || missingValue}
            onClick={add}
          >
            Add rule
          </Button>
        </>
      }
    >
      {readable.length === 0 ? (
        <p className="bd-dp-sheet__hint">
          Rules read pull requests and work items. Add one to the workstream first.
        </p>
      ) : (
        <>
          <label className="bd-ws-field">
            <span className="bd-dp-sheet__label">Record</span>
            <Select
              ariaLabel="Record the rule reads"
              value={target}
              options={readable.map((m) => ({
                value: m.key,
                label: nodeLabel(document, assessment, m.key),
              }))}
              onChange={(next) => {
                setTarget(next);
                const nextKind = kinds.find(
                  (k) => k.reads === document.members.find((m) => m.key === next)?.ref.kind,
                );
                setKind(nextKind?.kind ?? '');
                setValue('');
              }}
            />
          </label>
          <label className="bd-ws-field">
            <span className="bd-dp-sheet__label">Holds when</span>
            <Select
              ariaLabel="Rule"
              value={spec?.kind ?? ''}
              options={applicable.map((k) => ({ value: k.kind, label: k.label }))}
              onChange={(next) => {
                setKind(next);
                setValue('');
              }}
            />
          </label>
          {spec?.value && (
            <label className="bd-ws-field">
              <span className="bd-dp-sheet__label">{spec.value.label}</span>
              {choices.length > 0 ? (
                <Select
                  ariaLabel={spec.value.label}
                  value={value}
                  placeholder={spec.value.placeholder}
                  options={[
                    ...(spec.value.required ? [] : [{ value: '', label: spec.value.placeholder }]),
                    ...choices.map((choice) => ({ value: choice, label: choice })),
                  ]}
                  onChange={setValue}
                />
              ) : (
                <Input
                  aria-label={spec.value.label}
                  value={value}
                  placeholder={spec.value.placeholder}
                  onChange={(e) => setValue(e.target.value)}
                />
              )}
            </label>
          )}
        </>
      )}
    </Sheet>
  );
}
