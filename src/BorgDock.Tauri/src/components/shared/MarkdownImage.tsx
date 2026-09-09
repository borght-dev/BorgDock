import { openUrl } from '@tauri-apps/plugin-opener';
import { useState } from 'react';

/** Screenshot preview with a browser fallback for private or expired attachments. */
export function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  if (!src || !/^https?:\/\//i.test(src)) return <span>{alt || 'Image unavailable'}</span>;
  return (
    <span className="block my-2">
      <button
        type="button"
        className="block max-w-full cursor-zoom-in text-left text-[var(--color-accent)]"
        aria-label={`Open image in browser: ${alt || 'Screenshot'}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpenFailed(false);
          void openUrl(src).catch(() => setOpenFailed(true));
        }}
      >
        {failed ? (
          <span>Image could not load. Open image in browser.</span>
        ) : (
          <img
            src={src}
            alt={alt || 'Screenshot'}
            loading="lazy"
            className="max-h-80 max-w-full object-contain"
            onError={() => setFailed(true)}
          />
        )}
      </button>
      {openFailed && <span role="alert">Could not open image. Use the comment's GitHub link.</span>}
    </span>
  );
}
