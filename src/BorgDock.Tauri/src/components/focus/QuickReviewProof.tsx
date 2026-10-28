import { CircleCheck, CircleHelp, Square, SquareCheck, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { avatarInitials } from '@/components/pr/pr-card-data';
import { ImagePreview, ImageViewer } from '@/components/shared/ImageViewer';
import { Avatar } from '@/components/shared/primitives';
import type { ConversationEntry, PrConversation } from '@/hooks/usePrConversation';
import {
  descriptionChecklist,
  descriptionProof,
  type ProofImage,
  type ReviewProof,
  reviewProofs,
} from '@/services/review-proof';
import { type ReviewSince, reviewVerb } from '@/services/review-since';
import type { PullRequest } from '@/types';
import { formatAgo } from '@/utils/relative-time';

const ICON = { size: 14, strokeWidth: 2.25, 'aria-hidden': true } as const;
/** Thumbnails drawn per proof; the last one says how many more there are. */
const SHOWN_IMAGES = 3;

function short(sha: string) {
  return sha.slice(0, 7);
}

/** Every proof of `pr`: its description's proof section and the comments that read as proof. */
export function proofsFor(pr: PullRequest, conversation: PrConversation): ReviewProof[] {
  const description = descriptionProof(pr);
  return reviewProofs(
    description ? [description, ...conversation.items] : conversation.items,
    pr.headSha,
  );
}

/** The Proof tab's count: screenshots when there are any, otherwise proofs. */
export function proofCount(proofs: readonly ReviewProof[]): number {
  return proofs.reduce((n, proof) => n + proof.images.length, 0) || proofs.length;
}

function sourceOf(entry: ConversationEntry) {
  if (entry.id === 'description') return 'description';
  return entry.kind === 'review' ? 'review' : 'comment';
}

function Freshness({
  proof,
  headSha,
  onAsk,
}: {
  proof: ReviewProof;
  headSha: string;
  onAsk?: (commit: string) => void;
}) {
  if (proof.freshness === 'current')
    return (
      <p className="qr-fresh" data-fresh="current">
        <CircleCheck {...ICON} />
        <span>
          Matches the head commit <code>{short(headSha)}</code>
        </span>
      </p>
    );
  if (proof.freshness === 'outdated' && proof.commit)
    return (
      <div className="qr-fresh" data-fresh="outdated">
        <TriangleAlert {...ICON} />
        <span>
          Proof is for <code>{short(proof.commit)}</code>, not the head commit{' '}
          <code>{short(headSha)}</code>.
          {onAsk && (
            <button type="button" className="qr-fresh__ask" onClick={() => onAsk(proof.commit!)}>
              Ask for fresh proof
            </button>
          )}
        </span>
      </div>
    );
  return (
    <p className="qr-fresh" data-fresh="unknown">
      <CircleHelp {...ICON} />
      <span>Names no commit, so it may predate the latest push.</span>
    </p>
  );
}

function ProofBlock({
  proof,
  headSha,
  now,
  onAsk,
  onOpenImage,
}: {
  proof: ReviewProof;
  headSha: string;
  now?: number;
  onAsk?: (commit: string) => void;
  onOpenImage: (images: ProofImage[], index: number) => void;
}) {
  const { entry, images } = proof;
  const hidden = images.length - SHOWN_IMAGES;
  return (
    <article
      className="qr-proof"
      aria-label={`Proof from the ${sourceOf(entry)} by ${entry.author}`}
    >
      <Freshness proof={proof} headSha={headSha} onAsk={onAsk} />
      <p className="qr-proof__src">
        <Avatar initials={avatarInitials(entry.author)} size="sm" aria-hidden="true" />
        <span>
          {entry.author} · {sourceOf(entry)}
        </span>
        <span className="qr-muted">{formatAgo(entry.createdAt, now)}</span>
      </p>
      {proof.excerpt && <p className="qr-proof__excerpt">{proof.excerpt}</p>}
      {images.length > 0 && (
        <div className="qr-proof__shots" data-count={Math.min(images.length, SHOWN_IMAGES)}>
          {images.slice(0, SHOWN_IMAGES).map((image, index) => (
            <div key={image.src} className="qr-proof__shot">
              <ImagePreview image={image} onOpen={() => onOpenImage(images, index)} />
              {index === SHOWN_IMAGES - 1 && hidden > 0 ? (
                <span className="qr-proof__more" aria-hidden="true">
                  +{hidden}
                </span>
              ) : (
                <span className="qr-proof__cap" aria-hidden="true">
                  {image.alt}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

interface Props {
  pr: PullRequest;
  proofs: readonly ReviewProof[];
  conversation: PrConversation;
  since: ReviewSince | null;
  onAskForProof?: (commit: string) => void;
  now?: number;
}

/**
 * The context panel's Proof tab: screenshots and verification text from the
 * description and the comments, each marked current or outdated against the
 * head commit; the description's checklist; and, on a re-review, the
 * viewer's last review with the author's replies since.
 */
export function QuickReviewProof({ pr, proofs, conversation, since, onAskForProof, now }: Props) {
  const [viewer, setViewer] = useState<{ images: ProofImage[]; index: number } | null>(null);
  const checklist = descriptionChecklist(pr.body);
  const headSha = pr.headSha ?? '';
  const author = pr.authorLogin.toLowerCase();
  const replies = since
    ? conversation.items
        .filter(
          (item) =>
            item.author.toLowerCase() === author &&
            Date.parse(item.createdAt) > Date.parse(since.review.submittedAt) &&
            !!item.body?.trim(),
        )
        .slice(0, 2)
    : [];
  return (
    <div className="qr-proofs">
      {viewer && (
        <ImageViewer
          images={viewer.images}
          initialIndex={viewer.index}
          onClose={() => setViewer(null)}
        />
      )}
      {proofs.map((proof) => (
        <ProofBlock
          key={proof.entry.id}
          proof={proof}
          headSha={headSha}
          now={now}
          onAsk={onAskForProof}
          onOpenImage={(images, index) => setViewer({ images, index })}
        />
      ))}
      {!proofs.length &&
        (conversation.loading ? (
          <p className="qr-muted" role="status">
            Looking for proof…
          </p>
        ) : (
          <p className="qr-muted">
            No proof yet. A description section or comment with screenshots, or the words proof,
            verification or evidence, shows up here.
          </p>
        ))}
      {checklist.length > 0 && (
        <section className="qr-side-sec" aria-label="Checklist">
          <h4>
            Checklist <span className="qr-muted">from the description</span>
          </h4>
          <ul className="qr-checklist">
            {checklist.map((item) => (
              <li key={item.text} data-done={item.done || undefined}>
                {item.done ? <SquareCheck {...ICON} /> : <Square {...ICON} />}
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {since && (
        <section className="qr-side-sec" aria-label="Since your last review">
          <h4>Since your last review</h4>
          <div className="qr-prev">
            <p className="qr-prev__who">
              You · {formatAgo(since.review.submittedAt, now)} ·{' '}
              <b data-state={since.review.state}>{reviewVerb(since.review.state)}</b>
            </p>
            {since.review.body.trim() ? (
              <p>{since.review.body.trim()}</p>
            ) : (
              <p className="qr-muted">No overall comment.</p>
            )}
          </div>
          {replies.map((reply) => (
            <div key={reply.id} className="qr-prev">
              <p className="qr-prev__who">
                {reply.author} · {formatAgo(reply.createdAt, now)}
              </p>
              <p>{plainText(reply.body ?? '')}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function plainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 280);
}
