import { describe, expect, it } from 'vitest';
import { addOutcome, confirmOutcome, openDecision, setNextAction } from '../edits';
import { fromJson, toJson, toMarkdown } from '../export';
import { refKey } from '../identity';
import { CONTEXT, member, ok, pr, workstream } from './fixtures';

const A = pr('shop', 12);
const B = pr('shop', 15);

function scene() {
  let d = workstream({
    goal: 'Pay in one step.',
    members: [
      member(A, { label: 'Queue rewrite', role: 'primary' }),
      member(B, { label: 'Patch' }),
    ],
  });
  const outcome = addOutcome(d, 'Customers can pay', true, [], CONTEXT);
  d = ok(outcome);
  d = ok(confirmOutcome(d, outcome.outcomeId!, [refKey(A)], 'Paid on staging', CONTEXT));
  d = ok(openDecision(d, 'Rewrite or patch?', [refKey(A), refKey(B)], CONTEXT));
  return ok(setNextAction(d, 'Merge the rewrite', null, 'you', CONTEXT));
}

describe('export', () => {
  it('writes Markdown someone can read without BorgDock', () => {
    const markdown = toMarkdown(scene(), undefined);
    expect(markdown).toContain('# Checkout rewrite');
    expect(markdown).toContain('**Next:** Merge the rewrite');
    expect(markdown).toContain('- [x] Customers can pay (confirmed: Paid on staging)');
    expect(markdown).toContain('Rewrite or patch? Open between acme/shop#12, acme/shop#15');
    expect(markdown).toContain(
      '- [acme/shop#12](https://github.com/acme/shop/pull/12) Queue rewrite',
    );
  });

  it('round-trips through JSON', () => {
    const document = scene();
    const read = fromJson(toJson(document));
    expect(read).toEqual({ ok: true, document });
  });

  it('refuses what is not a workstream, or one from a newer BorgDock', () => {
    expect(fromJson('nope')).toMatchObject({ ok: false });
    expect(fromJson(JSON.stringify({ ...scene(), schema: 99 }))).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/newer/),
    });
  });
});
