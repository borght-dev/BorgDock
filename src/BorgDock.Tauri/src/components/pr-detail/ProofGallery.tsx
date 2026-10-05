import { openUrl } from '@tauri-apps/plugin-opener';
import { useState } from 'react';
import { DetailDialog } from '@/components/shared/DetailDialog';
import { ImagePreview, ImageViewer } from '@/components/shared/ImageViewer';
import { Markdown } from '@/components/shared/Markdown';
import { Button, Pill } from '@/components/shared/primitives';
import type { PrConversation } from '@/hooks/usePrConversation';
import { reviewProofs } from '@/services/review-proof';
import { formatAgo } from '@/utils/relative-time';
import './proof-gallery.css';

export function ProofGallery({
  conversation,
  headSha,
  onOpenComments,
}: {
  conversation: PrConversation;
  headSha?: string;
  onOpenComments?: () => void;
}) {
  const { items, loading, errors, reload } = conversation;
  const proofs = reviewProofs(items, headSha);
  const [all, setAll] = useState(false);
  const [comment, setComment] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ id: string; index: number } | null>(null);
  const [error, setError] = useState('');
  const selected = proofs.find((proof) => proof.entry.id === comment);
  const viewed = proofs.find((proof) => proof.entry.id === viewer?.id);
  return (
    <section className="bd-proof" aria-label="Developer proof">
      <div className="bd-proof__heading">
        <h3>Developer proof</h3>
        {onOpenComments && (
          <Button variant="ghost" size="sm" onClick={onOpenComments}>
            All comments · {items.length}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={reload} disabled={loading}>
          Refresh
        </Button>
      </div>
      {loading && <p role="status">Loading proof comments…</p>}
      {!!errors.length && (
        <div role="alert" className="qr-warning">
          Some comments could not be loaded. {errors.join(' ')}{' '}
          <Button variant="secondary" size="sm" onClick={reload}>
            Retry
          </Button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {!loading && !errors.length && !proofs.length && (
        <p className="bd-proof__empty">
          No developer proof found. Refresh or check the PR comments.
        </p>
      )}
      {(all ? proofs : proofs.slice(0, 1)).map((proof) => (
        <article className="bd-proof__entry" key={proof.entry.id}>
          <div className="bd-proof__meta">
            <b>{proof.entry.author || 'Deleted user'}</b>
            <span title={new Date(proof.entry.createdAt).toLocaleString()}>
              {formatAgo(proof.entry.createdAt)}
            </span>
            <Pill
              tone={
                proof.freshness === 'current'
                  ? 'success'
                  : proof.freshness === 'outdated'
                    ? 'warning'
                    : 'neutral'
              }
            >
              {proof.freshness === 'current'
                ? `Head ${proof.commit?.slice(0, 7)}`
                : proof.freshness === 'outdated'
                  ? `Older commit ${proof.commit?.slice(0, 7)}`
                  : 'Commit unverified'}
            </Pill>
            <span>
              {proof.entry.filePath
                ? 'Inline comment'
                : proof.entry.kind === 'review'
                  ? 'Review'
                  : 'PR comment'}
            </span>
          </div>
          <p className="bd-proof__excerpt">
            {proof.excerpt}
            {proof.excerpt.length === 300 ? '…' : ''}
          </p>
          {!!proof.images.length && (
            <div className="bd-proof__images">
              {proof.images.map((image, index) => (
                <ImagePreview
                  key={image.src}
                  image={image}
                  disabled={!!viewer || !!comment}
                  onOpen={() => setViewer({ id: proof.entry.id, index })}
                />
              ))}
            </div>
          )}
          <div className="bd-proof__actions">
            <Button variant="secondary" size="sm" onClick={() => setComment(proof.entry.id)}>
              Read full comment
            </Button>
            {proof.entry.htmlUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void openUrl(proof.entry.htmlUrl!).catch(() =>
                    setError('Could not open the source comment.'),
                  )
                }
              >
                View on GitHub ↗
              </Button>
            )}
          </div>
        </article>
      ))}
      {proofs.length > 1 && (
        <Button variant="ghost" size="sm" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show latest proof' : `Earlier proof · ${proofs.length - 1}`}
        </Button>
      )}
      {selected && (
        <DetailDialog title={`Proof by ${selected.entry.author}`} onClose={() => setComment(null)}>
          <div className="bd-proof__full markdown-body">
            <Markdown
              previewImages
              onImagePreview={(src) => {
                const index = selected.images.findIndex((image) => image.src === src);
                if (index >= 0) setViewer({ id: selected.entry.id, index });
              }}
            >
              {selected.entry.body ?? ''}
            </Markdown>
          </div>
        </DetailDialog>
      )}
      {viewed && viewer && (
        <ImageViewer
          images={viewed.images}
          initialIndex={viewer.index}
          onClose={() => setViewer(null)}
        />
      )}
    </section>
  );
}
