import { describe, expect, it } from 'vitest';
import type { ConversationEntry } from '@/hooks/usePrConversation';
import { descriptionProof, firstProofMedia, proofRecordings, reviewProofs } from '../review-proof';

const UPLOAD = 'https://github.com/user-attachments/assets/0f1e2d3c-aaaa-bbbb-cccc-1234567890ab';
const PR = { authorLogin: 'mvisser', createdAt: '2026-10-01T00:00:00Z' };

function proofsOf(body: string) {
  const entry = descriptionProof({ ...PR, body });
  return entry ? reviewProofs([entry]) : [];
}

describe('proofRecordings', () => {
  it('finds an upload on a line of its own, a video element and a link to a video file', () => {
    const body = [
      '## Proof',
      '',
      UPLOAD,
      '',
      '<video src="https://example.com/flow.mp4" controls></video>',
      '',
      '[Screen recording](https://example.com/checkout.webm)',
      'https://example.com/demo.mov?raw=1',
    ].join('\n');
    expect(proofRecordings(body)).toEqual([
      { src: 'https://example.com/flow.mp4', label: 'Recording 1' },
      { src: 'https://example.com/checkout.webm', label: 'Recording 2' },
      { src: UPLOAD, label: 'Recording 3' },
      { src: 'https://example.com/demo.mov?raw=1', label: 'Recording 4' },
    ]);
  });

  it('names a single recording plainly', () => {
    expect(proofRecordings(`Proof:\n\n${UPLOAD}`)).toEqual([{ src: UPLOAD, label: 'Recording' }]);
  });

  it('does not take an image, a page or an upload inside a sentence for a recording', () => {
    const body = [
      `![After](${UPLOAD})`,
      `See ${UPLOAD} for the flow.`,
      'https://example.com/docs/page',
      '[Docs](https://example.com/guide.html)',
    ].join('\n');
    expect(proofRecordings(body)).toEqual([]);
  });

  it('leaves out a recording in a bot footer', () => {
    expect(proofRecordings(`<!-- tool:footer -->\n${UPLOAD}\n<!-- /tool:footer -->`)).toEqual([]);
  });
});

describe('recordings as proof', () => {
  it('makes a description with only a recording a proof', () => {
    const [proof] = proofsOf(`## Summary\n\nWhat changed.\n\n${UPLOAD}\n`);
    expect(proof?.images).toEqual([]);
    expect(proof?.recordings).toEqual([{ src: UPLOAD, label: 'Recording' }]);
  });

  it('keeps a recording outside the proof section', () => {
    const [proof] = proofsOf(
      `${UPLOAD}\n\n## Verification\n\nThe flow passed.\n\n![After](https://example.com/after.png)`,
    );
    expect(proof?.images.map((image) => image.src)).toEqual(['https://example.com/after.png']);
    expect(proof?.recordings.map((recording) => recording.src)).toEqual([UPLOAD]);
  });
});

describe('firstProofMedia', () => {
  it('is the screenshots when a proof has only those', () => {
    const proofs = proofsOf(
      '## Proof\n\n![A](https://example.com/a.png)\n\n![B](https://example.com/b.png)',
    );
    expect(firstProofMedia(proofs)).toEqual({
      kind: 'image',
      images: [
        { src: 'https://example.com/a.png', alt: 'A' },
        { src: 'https://example.com/b.png', alt: 'B' },
      ],
    });
  });

  it('is the recording when it comes before the first screenshot', () => {
    const proofs = proofsOf(`## Proof\n\n${UPLOAD}\n\n![A](https://example.com/a.png)`);
    expect(firstProofMedia(proofs)).toEqual({
      kind: 'recording',
      recording: { src: UPLOAD, label: 'Recording' },
    });
  });

  it('is the screenshot when it comes before the recording', () => {
    const proofs = proofsOf(`## Proof\n\n![A](https://example.com/a.png)\n\n${UPLOAD}`);
    expect(firstProofMedia(proofs)?.kind).toBe('image');
  });

  it('skips a proof that is only text', () => {
    const text: ConversationEntry = {
      kind: 'comment',
      id: 'newer',
      author: 'vera',
      authorIsBot: false,
      body: 'Verification passed.',
      createdAt: '2026-10-06T00:00:00Z',
    } as ConversationEntry;
    const shots: ConversationEntry = {
      ...text,
      id: 'older',
      body: 'Proof\n\n![A](https://example.com/a.png)',
      createdAt: '2026-10-05T00:00:00Z',
    };
    expect(firstProofMedia(reviewProofs([text, shots]))?.kind).toBe('image');
  });

  it('is null without any proof to open', () => {
    expect(firstProofMedia([])).toBeNull();
    expect(firstProofMedia(proofsOf('## Verification\n\nChecked by hand.'))).toBeNull();
  });
});
