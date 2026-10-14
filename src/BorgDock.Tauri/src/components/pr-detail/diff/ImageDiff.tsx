import { useEffect, useState } from 'react';
import { ImageViewer } from '@/components/shared/ImageViewer';
import { Button } from '@/components/shared/primitives';
import {
  getImageComparison,
  type ImageComparison,
  type ImageRevision,
} from '@/services/github/images';
import { getClientForRepo } from '@/services/github/singleton';
import type { ProofImage } from '@/services/review-proof';
import type { DiffFile } from '@/types';
import './image-diff.css';

function RevisionPreview({
  label,
  revision,
  onOpen,
}: {
  label: string;
  revision: ImageRevision;
  onOpen: () => void;
}) {
  const [dimensions, setDimensions] = useState('');
  const [failed, setFailed] = useState(false);
  return (
    <figure className="bd-image-diff__revision">
      <figcaption>
        <strong>{label}</strong>
        {revision.state === 'ready' && (
          <code title={revision.image.path}>{revision.image.path}</code>
        )}
      </figcaption>
      <div className="bd-image-diff__canvas">
        {revision.state === 'ready' && !failed ? (
          <button type="button" onClick={onOpen} aria-label={`View ${label.toLowerCase()} image`}>
            <img
              src={revision.image.src}
              alt={`${label}: ${revision.image.path}`}
              onLoad={(event) =>
                setDimensions(
                  `${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`,
                )
              }
              onError={() => setFailed(true)}
            />
          </button>
        ) : (
          <p role={revision.state === 'error' || failed ? 'alert' : undefined}>
            {failed
              ? 'This image could not be decoded. View it on GitHub.'
              : revision.state === 'error'
                ? revision.message
                : label === 'Before'
                  ? 'New image'
                  : 'Image removed'}
          </p>
        )}
      </div>
      {revision.state === 'ready' && !failed && (
        <small>
          {dimensions} · {Math.max(1, Math.round(revision.image.size / 1024))} KB · Click to zoom
        </small>
      )}
    </figure>
  );
}

interface ImageDiffProps {
  file: DiffFile;
  owner: string;
  repo: string;
  baseSha: string;
  headSha: string;
}

export function ImageDiff(props: ImageDiffProps) {
  const [attempt, setAttempt] = useState(0);
  return (
    <ImageComparisonView
      key={`${props.owner}/${props.repo}:${props.file.filename}:${props.baseSha}:${props.headSha}:${attempt}`}
      {...props}
      onRetry={() => setAttempt((value) => value + 1)}
    />
  );
}

function ImageComparisonView({
  file,
  owner,
  repo,
  baseSha,
  headSha,
  onRetry,
}: ImageDiffProps & { onRetry: () => void }) {
  const [comparison, setComparison] = useState<ImageComparison | null>(null);
  const [error, setError] = useState('');
  const [viewer, setViewer] = useState<{ images: ProofImage[]; index: number } | null>(null);
  useEffect(() => {
    let active = true;
    setComparison(null);
    setError('');
    const client = getClientForRepo(owner, repo);
    if (!client) {
      setError('Connect your GitHub account to preview images.');
      return;
    }
    void getImageComparison(client, owner, repo, file, baseSha, headSha).then(
      (value) => {
        if (active) setComparison(value);
      },
      (reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Images could not be loaded.');
      },
    );
    return () => {
      active = false;
    };
  }, [file, owner, repo, baseSha, headSha]);

  function openImage(side: 'before' | 'after') {
    if (!comparison) return;
    const images: ProofImage[] = [];
    let index = 0;
    for (const key of ['before', 'after'] as const) {
      const revision = comparison[key];
      if (revision.state !== 'ready') continue;
      if (key === side) index = images.length;
      const image = revision.image;
      images.push({
        src: image.src,
        alt: `${key === 'before' ? 'Before' : 'After'}: ${image.path}`,
        browserUrl: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${encodeURIComponent(image.ref)}/${image.path.split('/').map(encodeURIComponent).join('/')}`,
      });
    }
    setViewer({ images, index });
  }

  const failed =
    error || comparison?.before.state === 'error' || comparison?.after.state === 'error';
  return (
    <section className="bd-image-diff" aria-label="Image comparison">
      {error && <p role="alert">{error}</p>}
      {!comparison && !error && <p role="status">Loading image revisions…</p>}
      {comparison && (
        <div className="bd-image-diff__grid">
          <RevisionPreview
            label="Before"
            revision={comparison.before}
            onOpen={() => openImage('before')}
          />
          <RevisionPreview
            label="After"
            revision={comparison.after}
            onOpen={() => openImage('after')}
          />
        </div>
      )}
      {failed && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry images
        </Button>
      )}
      {viewer && (
        <ImageViewer
          title="Image diff"
          images={viewer.images}
          initialIndex={viewer.index}
          onClose={() => setViewer(null)}
        />
      )}
    </section>
  );
}
