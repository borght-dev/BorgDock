import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { type Loaded, useFilePreview, useMergeBase } from '@/hooks/useRenderedFile';
import { PREVIEW_MESSAGE, type PreviewOrder, readPreviewReport } from '@/services/file-preview';
import type { DiffFile } from '@/types';
import './rendered-file.css';

/** Which version of a changed page is on screen. */
export type HtmlView = 'after' | 'before' | 'both';

/** A page wider than this is not scaled down further; it scrolls sideways. */
const MAX_PAGE_WIDTH = 2400;

interface FrameHandle {
  order: (order: PreviewOrder) => void;
}

interface FrameProps {
  url: string;
  title: string;
  /** Scale a page wider than the pane down to fit it. */
  fit: boolean;
  onScroll: (y: number) => void;
  /** The pointer left a page that held the keyboard. */
  onLeave?: () => void;
}

/**
 * One page in a sandboxed frame. `sandbox="allow-scripts"` without
 * `allow-same-origin` runs the page's scripts in an origin of their own:
 * no storage, no cookies, no way to read this window. Everything the frame
 * posts back is read as numbers (`readPreviewReport`).
 */
const PreviewFrame = forwardRef<FrameHandle, FrameProps>(function PreviewFrame(
  { url, title, fit, onScroll, onLeave },
  ref,
) {
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  /** The page's own width, measured while the frame was as wide as the pane; null when it fits. */
  const [pageWidth, setPageWidth] = useState<number | null>(null);
  const boxWidth = useRef(0);
  const scrolled = useRef(onScroll);
  scrolled.current = onScroll;

  useEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const measure = () => {
      const { width, height } = node.getBoundingClientRect();
      // A new pane width starts the measuring over, with the frame back at that width.
      if (Math.abs(width - boxWidth.current) >= 1) setPageWidth(null);
      boxWidth.current = width;
      setBox({ width, height });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const report = readPreviewReport(event.data);
      if (!report) return;
      if (report.kind === 'scroll') {
        scrolled.current(report.y);
        return;
      }
      if (Math.abs(report.viewport - boxWidth.current) >= 2) return;
      setPageWidth(
        report.width > report.viewport + 1 ? Math.min(report.width, MAX_PAGE_WIDTH) : null,
      );
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useImperativeHandle(ref, () => ({
    order: (order) =>
      // An opaque origin has no address: `*` is the only target that reaches it.
      frameRef.current?.contentWindow?.postMessage({ [PREVIEW_MESSAGE]: order }, '*'),
  }));

  const scaled = fit && pageWidth !== null && box.width > 0;
  const scale = scaled ? box.width / pageWidth : 1;
  return (
    <div
      ref={boxRef}
      className="bd-rendered-frame"
      onMouseLeave={() => {
        if (document.activeElement !== frameRef.current) return;
        frameRef.current?.blur();
        onLeave?.();
      }}
    >
      {box.width > 0 && (
        <iframe
          ref={frameRef}
          src={url}
          title={title}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          style={{
            width: scaled ? pageWidth : box.width,
            height: box.height / scale,
            transform: scaled ? `scale(${scale})` : undefined,
          }}
        />
      )}
    </div>
  );
});

export interface RenderedHtmlHandle {
  /** Scrolls the page: the frame has its own scroll position. */
  scrollBy: (x: number, y: number) => void;
}

interface RenderedHtmlProps {
  owner: string;
  repo: string;
  file: DiffFile;
  baseSha: string;
  headSha: string;
  view: HtmlView;
  fit: boolean;
  /** Called when the page at the head commit cannot be drawn, with the reason. */
  onUnavailable: (reason: string) => void;
  onLeave?: () => void;
  /** For stories and tests: the pages' addresses, instead of reading them from GitHub. */
  pages?: { after: Loaded<string>; before?: Loaded<string> };
}

function short(sha: string) {
  return sha.slice(0, 7);
}

/** Whether the pull request changed an existing page, so there is an earlier version to show. */
export function hasEarlierVersion(file: Pick<DiffFile, 'status'>): boolean {
  return file.status === 'modified' || file.status === 'renamed';
}

/**
 * An HTML file drawn as a browser would, at the head commit, beside or
 * instead of the version the pull request started from. Changes are not
 * marked inside the page: nothing says which pixels a changed line drew.
 */
export const RenderedHtml = forwardRef<RenderedHtmlHandle, RenderedHtmlProps>(function RenderedHtml(
  { owner, repo, file, baseSha, headSha, view, fit, onUnavailable, onLeave, pages },
  ref,
) {
  const earlier = hasEarlierVersion(file);
  const shown: HtmlView = earlier ? view : 'after';
  const wantBefore = shown !== 'after';
  const mergeBase = useMergeBase(owner, repo, baseSha, headSha, wantBefore && !pages);
  const readAfter = useFilePreview(
    pages ? null : { owner, repo, path: file.filename, ref: headSha },
  );
  const readBefore = useFilePreview(
    !pages && wantBefore && mergeBase.status === 'ready'
      ? { owner, repo, path: file.previousFilename ?? file.filename, ref: mergeBase.value }
      : null,
  );
  const after = pages?.after ?? readAfter;
  const before: Loaded<string> =
    pages?.before ?? (mergeBase.status === 'unavailable' ? mergeBase : readBefore);
  const afterFrame = useRef<FrameHandle>(null);
  const beforeFrame = useRef<FrameHandle>(null);

  useImperativeHandle(ref, () => ({
    scrollBy: (x, y) => {
      afterFrame.current?.order({ kind: 'scrollBy', x, y });
      beforeFrame.current?.order({ kind: 'scrollBy', x, y });
    },
  }));

  const reason = after.status === 'unavailable' ? after.reason : null;
  const unavailable = useRef(onUnavailable);
  unavailable.current = onUnavailable;
  useEffect(() => {
    if (reason) unavailable.current(reason);
  }, [reason]);

  function side(
    label: 'Before' | 'After',
    page: Loaded<string>,
    sha: string | null,
    frame: React.RefObject<FrameHandle | null>,
    other: React.RefObject<FrameHandle | null>,
  ) {
    return (
      <figure className="bd-rendered-side" aria-label={`${label}: ${file.filename}`}>
        {shown === 'both' && (
          <figcaption>
            <strong>{label}</strong>
            {sha && <code className="bd-rendered-side__commit">{short(sha)}</code>}
          </figcaption>
        )}
        {page.status === 'ready' ? (
          <PreviewFrame
            ref={frame}
            url={page.value}
            title={`${label}: ${file.filename}`}
            fit={fit}
            // The two versions scroll as one, so the same part of the page stays side by side.
            onScroll={(y) => other.current?.order({ kind: 'scrollTo', y })}
            onLeave={onLeave}
          />
        ) : (
          <p className="bd-rendered-status" role="status">
            {page.status === 'loading' ? 'Reading the page…' : page.reason}
          </p>
        )}
      </figure>
    );
  }

  return (
    <div className="bd-rendered-html" data-view={shown}>
      {wantBefore &&
        side(
          'Before',
          before,
          mergeBase.status === 'ready' ? mergeBase.value : null,
          beforeFrame,
          afterFrame,
        )}
      {shown !== 'before' && side('After', after, headSha, afterFrame, beforeFrame)}
    </div>
  );
});
