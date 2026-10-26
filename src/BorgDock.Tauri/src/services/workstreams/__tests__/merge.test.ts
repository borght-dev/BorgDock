import { describe, expect, it } from 'vitest';
import {
  addMembers,
  addOutcome,
  openDecision,
  removeMember,
  setGoal,
  setNextAction,
  setTitle,
} from '../edits';
import { refKey } from '../identity';
import { applyChoice, mergeDocuments } from '../merge';
import { CONTEXT, member, ok, pr, workstream } from './fixtures';

const A = pr('shop', 12);
const B = pr('shop', 15);
const C = pr('shop', 18);

const base = workstream({ revision: 3, members: [member(A), member(B)] });

describe('mergeDocuments', () => {
  it('keeps what either side added', () => {
    const mine = ok(addMembers(base, [{ ref: C, label: 'c' }], CONTEXT));
    const theirs = { ...ok(addOutcome(base, 'Shipped', true, [], CONTEXT)), revision: 4 };
    const { document, conflicts } = mergeDocuments(base, mine, theirs);
    expect(conflicts).toEqual([]);
    expect(document.members.map((m) => m.key)).toContain(refKey(C));
    expect(document.outcomes).toHaveLength(1);
    expect(document.revision).toBe(4);
  });

  it('a removal stands when the other side left the entry alone', () => {
    const mine = ok(removeMember(base, refKey(A), CONTEXT));
    const theirs = { ...ok(setTitle(base, 'Renamed', CONTEXT)), revision: 4 };
    const { document } = mergeDocuments(base, mine, theirs);
    expect(document.members.map((m) => m.key)).toEqual([refKey(B)]);
    expect(document.title).toBe('Renamed');
  });

  it('a removal loses against a change made on the other side', () => {
    const mine = ok(removeMember(base, refKey(A), CONTEXT));
    const theirs = {
      ...base,
      revision: 4,
      members: base.members.map((m) => (m.key === refKey(A) ? { ...m, note: 'still needed' } : m)),
    };
    const { document } = mergeDocuments(base, mine, theirs);
    expect(document.members.find((m) => m.key === refKey(A))?.note).toBe('still needed');
  });

  it('drops an option whose member the other machine removed', () => {
    const mine = ok(removeMember(base, refKey(B), CONTEXT));
    const theirs = {
      ...ok(openDecision(base, 'Which queue?', [refKey(A), refKey(B)], CONTEXT)),
      revision: 4,
    };
    const { document } = mergeDocuments(base, mine, theirs);
    expect(document.decisions[0]!.options).toEqual([refKey(A)]);
  });

  it('drops a removed member from the options the other side chose in a conflict', () => {
    const decided = ok(openDecision(base, 'Which queue?', [refKey(A), refKey(B)], CONTEXT));
    const id = decided.decisions[0]!.id;
    const mine = ok(removeMember(decided, refKey(B), CONTEXT));
    const theirs = {
      ...decided,
      revision: 4,
      members: [...decided.members, member(C)],
      decisions: decided.decisions.map((d) => ({
        ...d,
        options: [refKey(A), refKey(B), refKey(C)],
      })),
    };
    const { document, conflicts } = mergeDocuments(decided, mine, theirs);
    const options = conflicts.find((c) => c.entryId === id && c.field === 'options')!;
    const chosen = applyChoice(document, options, options.theirs);
    expect(chosen.decisions[0]!.options).toEqual([refKey(A), refKey(C)]);
  });

  it('takes the side that changed a field', () => {
    const mine = ok(setGoal(base, 'Pay in one step', CONTEXT));
    const theirs = { ...ok(setNextAction(base, 'Decide', null, 'you', CONTEXT)), revision: 4 };
    const { document, conflicts } = mergeDocuments(base, mine, theirs);
    expect(conflicts).toEqual([]);
    expect(document.goal).toBe('Pay in one step');
    expect(document.nextAction?.text).toBe('Decide');
  });

  it('names a field both sides changed differently, and holds mine until you choose', () => {
    const mine = ok(setTitle(base, 'Mine', CONTEXT));
    const theirs = { ...ok(setTitle(base, 'Theirs', CONTEXT)), revision: 4 };
    const { document, conflicts } = mergeDocuments(base, mine, theirs);
    expect(conflicts).toEqual([
      { path: 'title', field: 'title', label: 'Title', mine: 'Mine', theirs: 'Theirs' },
    ]);
    expect(document.title).toBe('Mine');
    expect(applyChoice(document, conflicts[0]!, 'Theirs').title).toBe('Theirs');
  });

  it('names a field of one entry both sides changed', () => {
    const note = (text: string) => ({
      ...base,
      members: base.members.map((m) => (m.key === refKey(A) ? { ...m, note: text } : m)),
    });
    const { document, conflicts } = mergeDocuments(base, note('mine'), {
      ...note('theirs'),
      revision: 4,
    });
    expect(conflicts.map((c) => [c.collection, c.entryId, c.field])).toEqual([
      ['members', refKey(A), 'note'],
    ]);
    const chosen = applyChoice(document, conflicts[0]!, 'theirs');
    expect(chosen.members.find((m) => m.key === refKey(A))?.note).toBe('theirs');
  });

  it('takes in a confirmation made on the other machine', () => {
    const withOutcome = ok(addOutcome(base, 'Merged', true, [], CONTEXT));
    const theirs = {
      ...withOutcome,
      revision: 4,
      outcomes: withOutcome.outcomes.map((o) => ({
        ...o,
        verification: { ...o.verification, state: 'confirmed' as const, note: 'tried it' },
      })),
    };
    const { document, conflicts } = mergeDocuments(withOutcome, withOutcome, theirs);
    expect(conflicts).toEqual([]);
    expect(document.outcomes[0]!.verification).toMatchObject({
      state: 'confirmed',
      note: 'tried it',
    });
  });

  it('two machines verifying the same outcome by rule agree on the earlier one', () => {
    const withOutcome = ok(addOutcome(base, 'Merged', true, [], CONTEXT));
    const verified = (at: string) => ({
      ...withOutcome,
      outcomes: withOutcome.outcomes.map((o) => ({
        ...o,
        verification: { ...o.verification, state: 'verified' as const, at, device: at },
      })),
    });
    const { document, conflicts } = mergeDocuments(withOutcome, verified('2026-10-26T10:00:00Z'), {
      ...verified('2026-10-26T09:00:00Z'),
      revision: 4,
    });
    expect(conflicts).toEqual([]);
    expect(document.outcomes[0]!.verification.at).toBe('2026-10-26T09:00:00Z');
  });

  it('merges the logs newest first', () => {
    const mine = ok(setGoal(base, 'a', { ...CONTEXT, now: '2026-10-26T10:00:00Z' }));
    const theirs = {
      ...ok(setNextAction(base, 'b', null, 'you', { ...CONTEXT, now: '2026-10-26T11:00:00Z' })),
      revision: 4,
    };
    const { document } = mergeDocuments(base, mine, theirs);
    expect(document.log.map((l) => l.at)).toEqual(['2026-10-26T11:00:00Z', '2026-10-26T10:00:00Z']);
  });

  it('without a known base every difference is a choice, but additions still join', () => {
    const mine = ok(setTitle(base, 'Mine', CONTEXT));
    const theirs = ok(addMembers({ ...base, title: 'Copy' }, [{ ref: C, label: 'c' }], CONTEXT));
    const { document, conflicts } = mergeDocuments(null, mine, theirs);
    expect(conflicts.map((c) => c.path)).toContain('title');
    expect(document.members.map((m) => m.key)).toContain(refKey(C));
  });
});
