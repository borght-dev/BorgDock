import { openUrl } from '@tauri-apps/plugin-opener';
import { useRef, useState } from 'react';
import type { ProofImage } from '@/services/review-proof';
import { DetailDialog } from './DetailDialog';
import { Button } from './primitives';
import { HoverPopover } from './primitives/HoverPopover';

export function ImageViewer({
  images,
  initialIndex = 0,
  onClose,
}: {
  images: readonly ProofImage[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const image = images[index];
  if (!image) return null;
  function resetView() {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }
  function step(delta: number) {
    setIndex((index + delta + images.length) % images.length);
    resetView();
    setError('');
  }
  function scale(value: number) {
    setZoom(Math.min(5, Math.max(1, value)));
    if (value <= 1) setOffset({ x: 0, y: 0 });
  }
  return (
    <DetailDialog
      title={`Proof image ${index + 1} of ${images.length} · ${image.alt}`}
      className="bd-image-viewer"
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') step(1);
        else if (event.key === 'ArrowLeft') step(-1);
        else if (event.key === '+' || event.key === '=') scale(zoom + 0.25);
        else if (event.key === '-') scale(zoom - 0.25);
        else if (event.key === '0') resetView();
        else return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div
        className="bd-image-canvas"
        role="group"
        aria-label="Image viewer"
        tabIndex={0}
        onWheel={(event) => scale(zoom + (event.deltaY < 0 ? 0.15 : -0.15))}
        onPointerDown={(event) => {
          if (zoom <= 1) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
        }}
        onPointerMove={(event) => {
          if (drag.current)
            setOffset({
              x: drag.current.ox + event.clientX - drag.current.x,
              y: drag.current.oy + event.clientY - drag.current.y,
            });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <img
          key={image.src}
          src={image.src}
          alt={image.alt}
          draggable={false}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
          onError={() =>
            setError('Image could not load. Open it in your browser or refresh the source comment.')
          }
        />
      </div>
      <div className="bd-image-controls">
        <Button variant="secondary" size="sm" onClick={() => step(-1)} disabled={images.length < 2}>
          Previous image
        </Button>
        <Button variant="secondary" size="sm" onClick={() => step(1)} disabled={images.length < 2}>
          Next image
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => scale(zoom - 0.25)}
          aria-label="Zoom out"
          disabled={zoom <= 1}
        >
          −
        </Button>
        <output aria-live="polite">{Math.round(zoom * 100)}%</output>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => scale(zoom + 0.25)}
          aria-label="Zoom in"
          disabled={zoom >= 5}
        >
          +
        </Button>
        <Button variant="ghost" size="sm" onClick={resetView}>
          Fit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void openUrl(image.src).catch(() => setError('Could not open image in browser.'))
          }
        >
          Open in browser
        </Button>
        <span className="bd-image-hint">Scroll to zoom · Drag to pan · ← → images</span>
      </div>
      {error && (
        <p role="alert" className="qr-warning">
          {error}
        </p>
      )}
    </DetailDialog>
  );
}

export function ImagePreview({
  image,
  onOpen,
  disabled = false,
}: {
  image: ProofImage;
  onOpen: () => void;
  disabled?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <HoverPopover
      disabled={disabled || failed}
      maxWidth={600}
      maxHeight={360}
      content={
        <div className="bd-image-hover">
          <img src={image.src} alt={image.alt} />
          <p>Click to zoom and pan</p>
        </div>
      }
    >
      <button
        type="button"
        className="bd-image-thumbnail"
        aria-label={`Preview image: ${image.alt}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpen();
        }}
      >
        {failed ? (
          <span>Image unavailable · Click for browser fallback</span>
        ) : (
          <img src={image.src} alt={image.alt} loading="lazy" onError={() => setFailed(true)} />
        )}
      </button>
    </HoverPopover>
  );
}
