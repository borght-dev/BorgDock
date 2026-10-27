import { describe, expect, it } from 'vitest';
import {
  addMembers,
  addOutcome,
  addRelation,
  addRule,
  confirmOutcome,
  decide,
  openDecision,
  relinkMember,
  removeDecision,
  removeMember,
  reopenDecision,
  setMemberRole,
  setNextAction,
  setStatus,
} from '../edits';
import { decisionKey, outcomeKey, refKey } from '../identity';
import { CONTEXT, item, member, ok, pr, thread, workstream } from './fixtures';

const A = pr('shop', 12);
const B = pr('shop', 15);
const C = pr('warehouse', 12);
const KEY_A = refKey(A);
const KEY_B = refKey(B);
const KEY_C = refKey(C);

function threeMembers() {
  return workstream({ members: [member(A), member(B), member(C)] });
}

describe('members', () => {
  it('adds a record once, and logs it', () => {
    const once = ok(addMembers(workstream(), [{ ref: A, label: 'Queue rewrite' }], CONTEXT));
    const twice = ok(addMembers(once, [{ ref: { ...A, owner: 'ACME' }, label: 'again' }], CONTEXT));
    expect(twice.members).toHaveLength(1);
    expect(once.log[0]).toMatchObject({ kind: 'member-added', summary: 'Added Queue rewrite' });
  });

  it('keeps PR #12 of two repositories as two members', () => {
    const document = ok(
      addMembers(
        workstream(),
        [
          { ref: A, label: 'a' },
          { ref: C, label: 'c' },
        ],
        CONTEXT,
      ),
    );
    expect(document.members.map((m) => m.key)).toEqual([KEY_A, KEY_C]);
  });

  it('takes a removed member out of relations, decisions, rules and the next action', () => {
    let document = threeMembers();
    document = ok(addRelation(document, 'blocks', KEY_A, KEY_B, '', CONTEXT));
    document = ok(openDecision(document, 'Which one?', [KEY_A, KEY_B, KEY_C], CONTEXT));
    document = ok(
      addOutcome(document, 'Merged', true, [{ kind: 'pr-merged', target: KEY_A }], CONTEXT),
    );
    document = ok(setNextAction(document, 'Review it', KEY_A, 'you', CONTEXT));
    document = ok(removeMember(document, KEY_A, CONTEXT));
    expect(document.relations).toEqual([]);
    expect(document.decisions[0]!.options).toEqual([KEY_B, KEY_C]);
    expect(document.outcomes[0]!.rules).toEqual([]);
    expect(document.nextAction?.target).toBeNull();
  });

  it('relinks a member and everything that points at it', () => {
    let document = threeMembers();
    document = ok(addRelation(document, 'blocks', KEY_A, KEY_B, '', CONTEXT));
    const renamed = pr('shop-v2', 12);
    document = ok(relinkMember(document, KEY_A, renamed, CONTEXT));
    expect(document.members[0]!.key).toBe(refKey(renamed));
    expect(document.relations[0]!.from).toBe(refKey(renamed));
  });
});

describe('relations', () => {
  it('refuses a circle and names it', () => {
    let document = threeMembers();
    document = ok(addRelation(document, 'blocks', KEY_A, KEY_B, '', CONTEXT));
    document = ok(addRelation(document, 'blocks', KEY_B, KEY_C, '', CONTEXT));
    const result = addRelation(document, 'blocks', KEY_C, KEY_A, '', CONTEXT);
    expect(result).toEqual({ error: expect.stringMatching(/circle/) });
  });

  it('refuses an end outside the workstream', () => {
    expect(
      addRelation(threeMembers(), 'blocks', KEY_A, 'gh:github.com/x/y#1', '', CONTEXT),
    ).toHaveProperty('error');
  });

  it('lets an outcome be blocked by a member', () => {
    let document = ok(addOutcome(threeMembers(), 'Shipped', true, [], CONTEXT));
    const outcome = outcomeKey(document.outcomes[0]!.id);
    document = ok(addRelation(document, 'blocks', KEY_A, outcome, 'needs the queue', CONTEXT));
    expect(document.relations[0]).toMatchObject({
      from: KEY_A,
      to: outcome,
      note: 'needs the queue',
    });
  });
});

describe('decisions', () => {
  it('needs two alternatives', () => {
    expect(openDecision(threeMembers(), 'Which?', [KEY_A], CONTEXT)).toHaveProperty('error');
  });

  it('keeps the chosen one and supersedes the rest, locally only', () => {
    let document = ok(setMemberRole(threeMembers(), KEY_A, 'primary', CONTEXT));
    const opened = openDecision(document, 'Queue rewrite or patch?', [KEY_A, KEY_B], CONTEXT);
    document = ok(opened);
    const id = opened.decisionId!;
    document = ok(decide(document, id, KEY_B, 'The patch is smaller', CONTEXT));
    const role = (key: string) => document.members.find((m) => m.key === key)!.role;
    expect(role(KEY_B)).toBe('supporting');
    expect(role(KEY_A)).toBe('superseded');
    expect(document.relations).toEqual([
      expect.objectContaining({ kind: 'supersedes', from: KEY_B, to: KEY_A, decisionId: id }),
    ]);
    expect(document.decisions[0]).toMatchObject({
      status: 'decided',
      chosen: KEY_B,
      rationale: 'The patch is smaller',
    });
  });

  it('reopening gives the alternatives their roles back', () => {
    let document = ok(setMemberRole(threeMembers(), KEY_A, 'primary', CONTEXT));
    const opened = openDecision(document, 'Which?', [KEY_A, KEY_B], CONTEXT);
    document = ok(decide(ok(opened), opened.decisionId!, KEY_B, '', CONTEXT));
    document = ok(reopenDecision(document, opened.decisionId!, CONTEXT));
    expect(document.members.find((m) => m.key === KEY_A)!.role).toBe('primary');
    expect(document.relations).toEqual([]);
    expect(document.decisions[0]!.status).toBe('open');
  });

  it('removing a decided decision undoes it first', () => {
    const opened = openDecision(threeMembers(), 'Which?', [KEY_A, KEY_B], CONTEXT);
    let document = ok(decide(ok(opened), opened.decisionId!, KEY_A, '', CONTEXT));
    document = ok(
      addRelation(document, 'blocks', decisionKey(opened.decisionId!), KEY_C, '', CONTEXT),
    );
    document = ok(removeDecision(document, opened.decisionId!, CONTEXT));
    expect(document.decisions).toEqual([]);
    expect(document.relations).toEqual([]);
    expect(document.members.every((m) => m.role === 'supporting')).toBe(true);
  });
});

describe('outcomes', () => {
  it('confirms only with evidence and a note', () => {
    const added = addOutcome(threeMembers(), 'Customers can pay', true, [], CONTEXT);
    const document = ok(added);
    const id = added.outcomeId!;
    expect(confirmOutcome(document, id, [], 'works', CONTEXT)).toHaveProperty('error');
    expect(confirmOutcome(document, id, [KEY_A], '  ', CONTEXT)).toHaveProperty('error');
    expect(confirmOutcome(document, id, ['gh:github.com/x/y#9'], 'works', CONTEXT)).toHaveProperty(
      'error',
    );
    const confirmed = ok(confirmOutcome(document, id, [KEY_A], 'Paid on staging', CONTEXT));
    expect(confirmed.outcomes[0]!.verification).toMatchObject({
      state: 'confirmed',
      evidence: [KEY_A],
      note: 'Paid on staging',
      device: 'Laptop',
    });
  });

  it('a rule reads a record in the workstream', () => {
    const added = addOutcome(threeMembers(), 'Merged', true, [], CONTEXT);
    expect(
      addRule(ok(added), added.outcomeId!, { kind: 'pr-merged', target: refKey(item(5)) }),
    ).toHaveProperty('error');
  });
});

describe('the workstream', () => {
  it('completing stamps the time, resuming clears it', () => {
    const done = ok(setStatus(workstream(), 'done', CONTEXT));
    expect(done.completedAt).toBe(CONTEXT.now);
    expect(ok(setStatus(done, 'active', CONTEXT)).completedAt).toBeNull();
  });

  it('a next action is trimmed, and an empty one clears it', () => {
    const set = ok(setNextAction(workstream(), '  Decide on the queue  ', null, 'you', CONTEXT));
    expect(set.nextAction?.text).toBe('Decide on the queue');
    expect(ok(setNextAction(set, '', null, 'you', CONTEXT)).nextAction).toBeNull();
  });

  it('a thread member is identified by its environment', () => {
    const document = ok(
      addMembers(
        workstream(),
        [
          { ref: thread('t1', 'env-laptop'), label: 'a' },
          { ref: thread('t1', 'env-mini', 'mini'), label: 'b' },
        ],
        CONTEXT,
      ),
    );
    expect(document.members).toHaveLength(2);
  });
});
