import { describe, expect, it } from 'vitest';
import type { ConversationEntry } from '@/hooks/usePrConversation';
import { descriptionChecklist, descriptionProof, proofImages, reviewProofs } from '../review-proof';

function comment(body: string, overrides: Partial<ConversationEntry> = {}): ConversationEntry {
  return {
    kind: 'comment',
    id: 'proof',
    author: 'another-developer',
    authorIsBot: false,
    body,
    createdAt: '2026-10-05T12:00:00Z',
    ...overrides,
  } as ConversationEntry;
}
const HEAD = 'a1b2c3d4e5f67890123456789012345678901234';

describe('developer proof', () => {
  it('detects text proof from any developer and associates an explicit SHA', () => {
    const [proof] = reviewProofs(
      [comment(`## PROOF\n\nVera CLI verification passed. Head SHA: ${HEAD}`)],
      HEAD,
    );
    expect(proof?.entry.author).toBe('another-developer');
    expect(proof?.freshness).toBe('current');
    expect(proof?.images).toEqual([]);
  });
  it('preserves hidden Vera metadata while using rendered private image URLs', () => {
    const [proof] = reviewProofs(
      [
        comment(
          '<p>Completed</p><img src="https://private.example/proof.png?signature=abc&amp;expires=123" alt="Proof">',
          { sourceBody: `<!-- vera proof: {"head_sha":"${HEAD}"} -->` },
        ),
      ],
      HEAD,
    );
    expect(proof?.freshness).toBe('current');
    expect(proof?.images[0]?.src).toBe(
      'https://private.example/proof.png?signature=abc&expires=123',
    );
  });
  it('flags older commits and leaves ambiguous or absent commits unverified', () => {
    expect(reviewProofs([comment('PROOF. Commit: bbbbbbb')], HEAD)[0]?.freshness).toBe('outdated');
    expect(
      reviewProofs([comment('PROOF. Commit: bbbbbbb. Head SHA: a1b2c3d')], HEAD)[0]?.freshness,
    ).toBe('unknown');
    expect(
      reviewProofs([comment('PROOF. Tests passed; random value abcdef01.')], HEAD)[0]?.freshness,
    ).toBe('unknown');
  });
  it('does not promote a casual screenshot remark above the actual evidence', () => {
    const actual = comment('## Verification\n\n![Screenshot](https://example.com/proof.png)');
    expect(
      reviewProofs([
        comment('The screenshot makes the two actions clear.', { id: 'review' }),
        actual,
      ]),
    ).toHaveLength(1);
    expect(reviewProofs([actual])[0]?.images).toHaveLength(1);
  });
  it('extracts Markdown and HTML images without unsafe schemes or duplicates', () => {
    expect(
      proofImages(
        '![One](https://example.com/one.png) <img src="https://example.com/one.png"> <img src="javascript:alert(1)">',
      ),
    ).toEqual([{ src: 'https://example.com/one.png', alt: 'Screenshot' }]);
  });
  it('sorts proof newest first and leaves headings and script content out of excerpts', () => {
    const proofs = reviewProofs([
      comment('PROOF older', { id: 'old', createdAt: '2026-10-04T10:00:00Z' }),
      comment('<h2>PROOF</h2><script>secret</script><p>Newer</p>'),
    ]);
    expect(proofs[0]?.entry.id).toBe('proof');
    expect(proofs[0]?.excerpt).not.toContain('secret');
    expect(proofs[0]?.excerpt).toBe('Newer');
  });
});

describe('the description as proof', () => {
  const pr = { authorLogin: 'mvisser', createdAt: '2026-10-01T00:00:00Z' };

  it('takes the proof section up to the next heading of its level', () => {
    const body =
      '## Summary\n\nWhat changed.\n\n## Verification\n\nThe flow passed.\n\n### After\n\n![After](https://example.com/after.png)\n\n## Notes\n\nUnrelated.';
    const entry = descriptionProof({ ...pr, body });
    expect(entry?.body).toBe(
      '## Verification\n\nThe flow passed.\n\n### After\n\n![After](https://example.com/after.png)\n',
    );
    const [proof] = reviewProofs([entry!]);
    expect(proof?.excerpt).toBe('The flow passed.');
    expect(proof?.images).toEqual([{ src: 'https://example.com/after.png', alt: 'After' }]);
  });

  it('is null without a proof heading', () => {
    expect(descriptionProof({ ...pr, body: '## Summary\n\nVerified by hand.' })).toBeNull();
  });

  it('includes unlabelled description images before the Claude footer only', () => {
    const entry = descriptionProof({
      ...pr,
      body: `## Summary
![Before](https://example.com/before.png)
## Result
<img src="https://example.com/after.png" alt="After">
Generated with [Claude Code](https://claude.ai)
![Blacksmith](https://example.com/blacksmith.png)
## Proof
![Bot](https://example.com/bot.png)`,
    });
    const [proof] = reviewProofs([entry!]);
    expect(proof?.images.map((image) => image.src)).toEqual([
      'https://example.com/after.png',
      'https://example.com/before.png',
    ]);
    expect(proof?.entry.body).not.toContain('blacksmith');
    expect(proof?.entry.body).not.toContain('bot.png');
  });

  it('preserves Claude mentions in prose and image alt text', () => {
    const entry = descriptionProof({
      ...pr,
      body: `The fixture was generated with Claude Code.
![Generated with Claude Code](https://example.com/fixture.png)
## Proof
Verified by hand.
![After](https://example.com/after.png)
\u{1f916} Generated with [Claude Code](https://claude.ai)
![Badge](https://example.com/badge.png)`,
    });
    const [proof] = reviewProofs([entry!]);
    expect(proof?.excerpt).toContain('Verified by hand.');
    expect(proof?.images.map((image) => image.src)).toEqual([
      'https://example.com/fixture.png',
      'https://example.com/after.png',
    ]);
  });

  it('ignores a description containing only generated images', () => {
    expect(
      descriptionProof({
        ...pr,
        body: 'Generated with Claude Code\n![Badge](https://example.com/badge.png)',
      }),
    ).toBeNull();
  });

  it('reads the task list as a checklist', () => {
    expect(
      descriptionChecklist(
        'Intro\n- [x] Unit tests for the `hook`\n* [ ] Playwright\n- plain item',
      ),
    ).toEqual([
      { text: 'Unit tests for the hook', done: true },
      { text: 'Playwright', done: false },
    ]);
  });
});
