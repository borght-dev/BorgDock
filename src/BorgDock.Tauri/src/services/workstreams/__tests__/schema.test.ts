import { describe, expect, it } from 'vitest';
import { limitProblem, newDocument, readDocument } from '../schema';
import { LIMITS, SCHEMA_VERSION, type WorkstreamDocument } from '../types';

const device = { deviceId: 'd1', deviceLabel: 'Laptop' };
const NOW = '2026-10-26T09:00:00Z';

function stored(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...newDocument('Checkout rewrite', NOW, device), ...overrides };
}

function read(raw: unknown): WorkstreamDocument {
  const result = readDocument(raw);
  if (!result.ok) throw new Error(result.reason);
  return result.document;
}

const prMember = {
  key: 'stale-key',
  ref: { kind: 'github-pr', owner: 'acme', repo: 'shop', number: 12 },
  role: 'primary',
  label: 'Queue rewrite',
  note: '',
  addedAt: NOW,
  addedBy: 'you',
};

describe('readDocument', () => {
  it('round-trips a new workstream unchanged', () => {
    const document = newDocument('Checkout rewrite', NOW, device);
    expect(read(JSON.parse(JSON.stringify(document)))).toEqual(document);
  });

  it('refuses what is no workstream', () => {
    expect(readDocument(null).ok).toBe(false);
    expect(readDocument([]).ok).toBe(false);
    expect(readDocument({ schema: 1 }).ok).toBe(false);
    expect(readDocument({ id: 'x' }).ok).toBe(false);
  });

  it('shows a newer schema read-only', () => {
    const result = readDocument(stored({ schema: SCHEMA_VERSION + 1 }));
    expect(result).toMatchObject({ ok: true, readOnly: true });
  });

  it('keeps fields it does not know, at the top and inside entries', () => {
    const document = read(
      stored({
        futureField: { a: 1 },
        members: [{ ...prMember, futureMemberField: 'kept' }],
      }),
    );
    expect((document as unknown as Record<string, unknown>).futureField).toEqual({ a: 1 });
    expect((document.members[0] as unknown as Record<string, unknown>).futureMemberField).toBe(
      'kept',
    );
  });

  it('derives a member key from its reference', () => {
    expect(read(stored({ members: [prMember] })).members[0]!.key).toBe(
      'gh:github.com/acme/shop#12',
    );
  });

  it('leaves out a member it cannot read, and says so', () => {
    const result = readDocument(stored({ members: [prMember, { ref: { kind: 'nonsense' } }] }));
    expect(result.ok && result.document.members).toHaveLength(1);
    expect(result.ok && result.problems).toHaveLength(1);
  });

  it('drops a duplicate member and a relation to nothing', () => {
    const document = read(
      stored({
        members: [prMember, prMember],
        relations: [
          {
            id: 'r1',
            kind: 'blocks',
            from: 'gh:github.com/acme/shop#12',
            to: 'outcome:gone',
            note: '',
          },
        ],
      }),
    );
    expect(document.members).toHaveLength(1);
    expect(document.relations).toHaveLength(0);
  });

  it('keeps a rule kind this version does not know', () => {
    const document = read(
      stored({
        members: [prMember],
        outcomes: [
          {
            id: 'o1',
            title: 'Deployed',
            required: true,
            rules: [
              { id: 'x', kind: 'deployed', target: 'gh:github.com/acme/shop#12', value: 'prod' },
            ],
          },
        ],
      }),
    );
    expect(document.outcomes[0]!.rules[0]!.kind).toBe('deployed');
    expect(document.outcomes[0]!.verification.state).toBe('unverified');
  });
});

describe('limitProblem', () => {
  it('passes a new workstream', () => {
    expect(limitProblem(newDocument('x', NOW, device))).toBeNull();
  });

  it('names the limit a workstream breaks', () => {
    const document = newDocument('x', NOW, device);
    expect(limitProblem({ ...document, goal: 'x'.repeat(LIMITS.goal + 1) })).toMatch(/goal/);
    expect(
      limitProblem({
        ...document,
        nextAction: {
          text: 'x'.repeat(LIMITS.nextAction + 1),
          target: null,
          setAt: NOW,
          setBy: 'you',
        },
      }),
    ).toMatch(/next action/);
  });
});
