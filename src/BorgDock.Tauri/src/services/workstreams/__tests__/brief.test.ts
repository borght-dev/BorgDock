import { describe, expect, it } from 'vitest';
import {
  buildBrief,
  DEFAULT_WORKSTREAM_PROMPTS,
  fillPrompt,
  PROMPT_LIMIT,
  parseProposal,
} from '../brief';
import { addMembers, addOutcome, openDecision } from '../edits';
import { decisionKey, outcomeKey, refKey } from '../identity';
import { acceptProposalItem } from '../proposals';
import { CONTEXT, member, ok, pr, workstream } from './fixtures';

const A = pr('shop', 12);
const B = pr('shop', 15);
const PARSE = { adoOrganization: 'acme', adoProject: 'Shop', environments: [] };

function scene() {
  let d = workstream({
    members: [member(A, { label: 'Queue rewrite' }), member(B, { label: 'Patch' })],
  });
  const outcome = addOutcome(
    d,
    'Customers can pay',
    true,
    [{ kind: 'pr-merged', target: refKey(A) }],
    CONTEXT,
  );
  d = ok(outcome);
  const decision = openDecision(d, 'Rewrite or patch?', [refKey(A), refKey(B)], CONTEXT);
  d = ok(decision);
  return { d, outcomeId: outcome.outcomeId!, decisionId: decision.decisionId! };
}

function reply(json: unknown): string {
  return `I read everything.\n\n\`\`\`borgdock-proposal\n${JSON.stringify(json)}\n\`\`\`\n`;
}

describe('the brief', () => {
  it('names every key and id an agent needs to answer with', () => {
    const { d, outcomeId, decisionId } = scene();
    const brief = buildBrief(d, undefined);
    expect(brief).toContain(refKey(A));
    expect(brief).toContain(outcomeKey(outcomeId));
    expect(brief).toContain(decisionKey(decisionId));
    expect(brief).toContain('https://github.com/acme/shop/pull/12');
  });

  it('leaves context out first when the workstream is too big, and says so', () => {
    const many = Array.from({ length: 150 }, (_, i) => ({
      ref: pr('shop', 1000 + i),
      label: 'x'.repeat(150),
      role: 'context' as const,
    }));
    const d = ok(
      addMembers(workstream({ members: [member(A, { role: 'primary' })] }), many, CONTEXT),
    );
    const brief = buildBrief(d, undefined);
    expect(brief).toContain(refKey(A));
    expect(brief).toMatch(/records left out for length/);
    expect(fillPrompt(DEFAULT_WORKSTREAM_PROMPTS.review, d, brief).length).toBeLessThanOrEqual(
      PROMPT_LIMIT,
    );
  });
});

describe('proposals', () => {
  it('reads the last proposal block and keeps what the workstream holds', () => {
    const { d, outcomeId, decisionId } = scene();
    const proposal = parseProposal(
      reply({
        version: 1,
        nextAction: { text: 'Merge the patch', target: refKey(B) },
        decisions: [
          { decision: decisionId, choose: refKey(B), rationale: 'Smaller' },
          { decision: 'gone', choose: refKey(B) },
        ],
        outcomes: [
          { outcome: outcomeKey(outcomeId), evidence: [refKey(B)], note: 'Paid on staging' },
        ],
        members: [
          { add: 'https://github.com/acme/shop/pull/20', role: 'supporting', why: 'Follow-up' },
          { key: refKey(A), role: 'superseded' },
        ],
        risks: ['The patch skips the queue'],
      }),
      d,
      'run-1',
      CONTEXT.now,
      PARSE,
    )!;
    expect(proposal.items.map((i) => i.kind)).toEqual([
      'next-action',
      'decision',
      'outcome-evidence',
      'add-member',
      'set-role',
      'risk',
    ]);
    expect(proposal.dropped).toEqual([`decision gone → ${refKey(B)}`]);
  });

  it('is nothing when the reply holds no block', () => {
    expect(parseProposal('All good.', scene().d, 'run', CONTEXT.now, PARSE)).toBeNull();
  });

  it('accepting a confirmation makes it yours, labelled as proposed by the agent', () => {
    const { d, outcomeId } = scene();
    const proposal = parseProposal(
      reply({ outcomes: [{ outcome: outcomeId, evidence: [refKey(B)], note: 'Paid on staging' }] }),
      d,
      'run-1',
      CONTEXT.now,
      PARSE,
    )!;
    const withProposal = { ...d, proposals: [proposal] };
    const accepted = ok(
      acceptProposalItem(withProposal, proposal, proposal.items[0]!, CONTEXT, PARSE),
    );
    expect(accepted.outcomes[0]!.verification).toMatchObject({
      state: 'confirmed',
      proposedBy: 'run-1',
    });
    expect(accepted.proposals[0]!.items[0]!.status).toBe('accepted');
    expect(accepted.log[0]!.kind).toBe('proposal-accepted');
  });

  it('accepting a decision supersedes the other option', () => {
    const { d, decisionId } = scene();
    const proposal = parseProposal(
      reply({ decisions: [{ decision: decisionId, choose: refKey(B) }] }),
      d,
      'run-1',
      CONTEXT.now,
      PARSE,
    )!;
    const accepted = ok(
      acceptProposalItem(
        { ...d, proposals: [proposal] },
        proposal,
        proposal.items[0]!,
        CONTEXT,
        PARSE,
      ),
    );
    expect(accepted.members.find((m) => m.key === refKey(A))!.role).toBe('superseded');
  });
});
