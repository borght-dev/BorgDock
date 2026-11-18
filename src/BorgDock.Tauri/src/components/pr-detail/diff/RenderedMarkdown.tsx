import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import {
  type ComponentProps,
  createContext,
  memo,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Components } from 'react-markdown';
import { Markdown } from '@/components/shared/Markdown';
import { MarkdownImage } from '@/components/shared/MarkdownImage';
import { type FileAtRef, type Loaded, useFileText } from '@/hooks/useRenderedFile';
import { parsePatch } from '@/services/diff-parser';
import { getImageAtRef } from '@/services/github/images';
import { getClientForRepo } from '@/services/github/singleton';
import type { ReviewCommentDraft } from '@/services/quick-review';
import {
  CHANGE_MARK_ATTRIBUTES,
  draftOnRenderedBlock,
  type PatchLines,
  patchLines,
  readRemovedMark,
  remarkChangeMarks,
  resolveRepoPath,
  withFencedFrontMatter,
} from '@/services/rendered-file';
import type { DiffFile } from '@/types';
import './rendered-file.css';

/** A place the change navigation stops at: a touched block or a removed-text marker. */
export const RENDERED_STOP = '[data-rendered-stop]';

interface Rendering {
  file: FileAtRef;
  source: string;
  patch: PatchLines;
  drafts: readonly ReviewCommentDraft[];
  renderDraft: (draft: ReviewCommentDraft) => ReactNode;
  onAddComment?: (line: number) => void;
}

const RenderingContext = createContext<Rendering | null>(null);

type HastProperties = Record<string, unknown>;

function RemovedText({ title, lines }: { title: string; lines: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bd-rendered-removed" data-rendered-stop="">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span aria-hidden="true">−</span>
        <span>
          {lines.length} {lines.length === 1 ? 'line' : 'lines'} removed here
          {title && (
            <>
              : <b>{title}</b>
            </>
          )}
        </span>
        <span className="bd-rendered-removed__toggle">
          {open ? 'Hide' : 'Show'}
          {open ? (
            <ChevronUp size={13} strokeWidth={2.25} aria-hidden="true" />
          ) : (
            <ChevronDown size={13} strokeWidth={2.25} aria-hidden="true" />
          )}
        </span>
      </button>
      {open && <pre>{lines.join('\n')}</pre>}
    </div>
  );
}

function TouchedBlock({
  properties,
  children,
}: {
  properties: HastProperties;
  children: ReactNode;
}) {
  const rendering = useContext(RenderingContext);
  const [from, to] = String(properties.dataRenderedLines ?? '')
    .split('-')
    .map(Number);
  const commentLine = Number(properties.dataRenderedComment);
  const drafts =
    rendering && from && to
      ? rendering.drafts.filter(
          (draft) =>
            draft.line >= from &&
            draft.line <= to &&
            draftOnRenderedBlock(draft, rendering.source, rendering.patch),
        )
      : [];
  // A page can write these attributes itself: only a line the diff added takes a comment.
  const canComment = !!rendering?.onAddComment && rendering.patch.added.has(commentLine);
  return (
    <>
      <div
        className="bd-rendered-change"
        data-rendered-change={properties.dataRenderedChange === 'added' ? 'added' : 'changed'}
        data-rendered-stop=""
      >
        {canComment && (
          <button
            type="button"
            className="bd-rendered-change__add"
            aria-label={
              from === to ? `Comment on line ${from}` : `Comment on lines ${from} to ${to}`
            }
            onClick={() => rendering?.onAddComment?.(commentLine)}
          >
            <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
          </button>
        )}
        {children}
      </div>
      {drafts.map((draft) => rendering?.renderDraft(draft))}
    </>
  );
}

function MarkedDiv({ node, children, ...rest }: ComponentProps<'div'> & { node?: unknown }) {
  const properties = (node as { properties?: HastProperties } | undefined)?.properties ?? {};
  const removed = readRemovedMark(properties.dataRenderedRemoved);
  if (removed) return <RemovedText title={removed.title} lines={removed.lines} />;
  if (properties.dataRenderedChange)
    return <TouchedBlock properties={properties}>{children}</TouchedBlock>;
  return <div {...rest}>{children}</div>;
}

const images = new Map<string, Promise<string>>();

/** An image the page loads from its own repository, read at the commit on screen. */
function RepositoryImage({ file, path, alt }: { file: FileAtRef; path: string; alt?: string }) {
  const [state, setState] = useState<{ key: string; src: string | null } | null>(null);
  const key = `${file.owner}/${file.repo}@${file.ref}:${path}`;
  useEffect(() => {
    let active = true;
    let loading = images.get(key);
    if (!loading) {
      const client = getClientForRepo(file.owner, file.repo);
      if (!client) {
        setState({ key, src: null });
        return;
      }
      loading = getImageAtRef(client, file.owner, file.repo, path, file.ref).then(
        (image) => image.src,
      );
      images.set(key, loading);
      loading.catch(() => images.delete(key));
    }
    loading.then(
      (src) => active && setState({ key, src }),
      () => active && setState({ key, src: null }),
    );
    return () => {
      active = false;
    };
  }, [key, file.owner, file.repo, file.ref, path]);
  if (state?.key !== key) return <span className="bd-rendered-image" data-state="loading" />;
  if (!state.src) return <span className="bd-rendered-image">{alt || path} (image not found)</span>;
  return <img className="bd-rendered-image" src={state.src} alt={alt ?? ''} />;
}

function PageImage({ src, alt }: ComponentProps<'img'>) {
  const rendering = useContext(RenderingContext);
  if (typeof src !== 'string') return null;
  const path = rendering ? resolveRepoPath(rendering.file.path, src) : null;
  if (rendering && path) return <RepositoryImage file={rendering.file} path={path} alt={alt} />;
  return <MarkdownImage src={src} alt={alt} />;
}

const COMPONENTS: Components = { div: MarkedDiv, img: PageImage };

/**
 * The page itself. Memoized on the text and the diff: typing a draft comment
 * re-renders only the blocks that read the context, not the whole document.
 */
const Page = memo(function Page({ source, patch }: { source: string; patch: PatchLines }) {
  return (
    <Markdown
      remarkPlugins={[[remarkChangeMarks, { source, patch }]]}
      components={COMPONENTS}
      dataAttributes={CHANGE_MARK_ATTRIBUTES}
    >
      {source}
    </Markdown>
  );
});

interface RenderedMarkdownProps {
  /** The file at the commit on screen. */
  file: FileAtRef;
  /** The diff on screen: the whole pull request's, or the changes since the last review. */
  diff: Pick<DiffFile, 'patch' | 'hunks'>;
  /** A new file is all new: its blocks take comments but get no marks. */
  newFile: boolean;
  drafts: readonly ReviewCommentDraft[];
  renderDraft: (draft: ReviewCommentDraft) => ReactNode;
  /** Starts a draft on a new-side line; absent where the diff takes no comments. */
  onAddComment?: (line: number) => void;
  /** Called with how many changes the page marks, once it is drawn. */
  onStops?: (count: number) => void;
  /** Called when the file cannot be drawn, with the reason. */
  onUnavailable: (reason: string) => void;
  /** For stories and tests: the text, instead of reading it from GitHub. */
  text?: Loaded<string>;
}

/**
 * A Markdown file drawn as the document it is, at the commit on screen. The
 * blocks the diff touched carry a bar in the margin and take a comment; text
 * the diff removed leaves a marker where it stood.
 */
export function RenderedMarkdown({
  file,
  diff,
  newFile,
  drafts,
  renderDraft,
  onAddComment,
  onStops,
  onUnavailable,
  text,
}: RenderedMarkdownProps) {
  const read = useFileText(text ? null : file);
  const loaded = text ?? read;
  const rootRef = useRef<HTMLDivElement>(null);
  const raw = loaded.status === 'ready' ? loaded.value : null;
  const { hunks, patch: patchText } = diff;
  const patch = useMemo(
    () => patchLines(hunks?.length ? hunks : parsePatch(patchText ?? '')),
    [hunks, patchText],
  );
  const page = useMemo(
    () => (raw === null ? null : { source: withFencedFrontMatter(raw), patch }),
    [raw, patch],
  );

  const reason = loaded.status === 'unavailable' ? loaded.reason : null;
  const unavailableRef = useRef(onUnavailable);
  unavailableRef.current = onUnavailable;
  useEffect(() => {
    if (reason) unavailableRef.current(reason);
  }, [reason]);

  const stopsRef = useRef(onStops);
  stopsRef.current = onStops;
  const pageKey = page ? `${file.ref}:${file.path}:${page.source.length}` : null;
  useEffect(() => {
    if (!pageKey || !rootRef.current) return;
    const stops = newFile ? [] : [...rootRef.current.querySelectorAll<HTMLElement>(RENDERED_STOP)];
    stopsRef.current?.(stops.length);
    // Open on the first change: the reader came for what the pull request did.
    stops[0]?.scrollIntoView?.({ block: 'center' });
  }, [pageKey, newFile]);

  if (!page)
    return (
      <p className="bd-rendered-status" role="status">
        {reason ?? 'Reading the file…'}
      </p>
    );
  const others = drafts.filter((draft) => !draftOnRenderedBlock(draft, page.source, page.patch));
  return (
    <RenderingContext.Provider
      value={{ file, source: page.source, patch: page.patch, drafts, renderDraft, onAddComment }}
    >
      <div
        ref={rootRef}
        className="bd-rendered-markdown markdown-body"
        data-new-file={newFile || undefined}
      >
        <Page source={page.source} patch={page.patch} />
      </div>
      {others.length > 0 && (
        <section className="bd-rendered-others" aria-label="Drafts on lines the page does not show">
          <h4>Drafts on other lines of this file</h4>
          {others.map(renderDraft)}
        </section>
      )}
    </RenderingContext.Provider>
  );
}
