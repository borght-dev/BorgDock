import { GitCommitHorizontal } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { DiffFileSection } from '@/components/pr-detail/diff/DiffFileSection';
import { Button } from '@/components/shared/primitives';
import { classifyNoise } from '@/services/review-noise';
import type { DiffFile, PullRequestCommit } from '@/types';
import { formatAgo } from '@/utils/relative-time';
import { noiseFolds } from './QuickReviewNoise';

type Load<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'error'; error: string };

function firstLine(message: string): string {
  return message.split('\n')[0] ?? '';
}

/**
 * The walk's tree in Commits order: the PR's commits oldest first, each
 * with a checkbox for "read". Reading every commit offers to mark the files
 * reviewed, since the commits together are the whole change.
 */
export function QuickReviewCommitList({
  header,
  commits,
  currentSha,
  read,
  onNavigate,
  onToggleRead,
  onRetry,
  filesLeft,
  onMarkFiles,
}: {
  header: ReactNode;
  commits: Load<PullRequestCommit[]> | null;
  currentSha: string | null;
  read: ReadonlySet<string>;
  onNavigate: (sha: string) => void;
  onToggleRead: (sha: string) => void;
  onRetry: () => void;
  /** Files not marked reviewed yet, generated ones aside. */
  filesLeft: number;
  onMarkFiles: () => void;
}) {
  const currentRef = useRef<HTMLButtonElement>(null);
  const list = commits?.status === 'ready' ? commits.value : [];
  const readCount = list.filter((c) => read.has(c.sha)).length;
  const percent = list.length ? (readCount / list.length) * 100 : 0;

  useEffect(() => {
    if (currentSha) currentRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [currentSha]);

  return (
    <nav className="qr-tree" aria-label="Commits">
      {header}
      <div className="qr-tree__progress" data-quick-review-progress="">
        <div className="qr-tree__counts">
          <span>
            <b>{readCount}</b> of {list.length} commits read
          </span>
          <span>
            {list.length && readCount === list.length ? 'done' : `${list.length - readCount} left`}
          </span>
        </div>
        <span className="qr-tree__bar" aria-hidden="true">
          <i style={{ width: `${percent}%` }} />
        </span>
      </div>
      {!commits || commits.status === 'loading' ? (
        <p className="qr-tree__note qr-muted">Loading commits…</p>
      ) : commits.status === 'error' ? (
        <p className="qr-warning" data-tone="error">
          {commits.error}
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </p>
      ) : (
        <ol className="qr-commits">
          {list.map((commit, i) => {
            const isRead = read.has(commit.sha);
            const current = commit.sha === currentSha;
            const title = firstLine(commit.message);
            return (
              <li key={commit.sha} className="qr-file-row">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isRead}
                  aria-label={`Read: ${title}`}
                  className="qr-cb"
                  data-done={isRead || undefined}
                  onClick={() => onToggleRead(commit.sha)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                </button>
                <button
                  ref={current ? currentRef : undefined}
                  type="button"
                  className="qr-file qr-commit"
                  data-done={isRead ? 'true' : undefined}
                  aria-current={current ? 'step' : undefined}
                  title={commit.message}
                  onClick={() => onNavigate(commit.sha)}
                >
                  <span className="qr-commit__msg">{title}</span>
                  <span className="qr-commit__meta">
                    {i + 1} · <code>{commit.sha.slice(0, 7)}</code>
                    {commit.authorLogin && <> · {commit.authorLogin}</>}
                    {commit.date && <> · {formatAgo(commit.date)}</>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {list.length > 0 && readCount === list.length && filesLeft > 0 && (
        <div className="qr-commits__done">
          Every commit read.
          <Button variant="secondary" size="sm" onClick={onMarkFiles}>
            Mark {filesLeft} {filesLeft === 1 ? 'file' : 'files'} reviewed
          </Button>
        </div>
      )}
    </nav>
  );
}

/** Above the diff in Commits order: the commit, its whole message and its size. */
export function CommitHead({
  commit,
  files,
}: {
  commit: PullRequestCommit;
  files: readonly DiffFile[] | null;
}) {
  const [title, ...rest] = commit.message.split('\n');
  const body = rest.join('\n').trim();
  const additions = files?.reduce((n, f) => n + f.additions, 0) ?? 0;
  const deletions = files?.reduce((n, f) => n + f.deletions, 0) ?? 0;
  return (
    <div className="qr-commit-head" data-quick-review-commit="">
      <GitCommitHorizontal size={14} strokeWidth={2.25} aria-hidden="true" />
      <div className="qr-commit-head__text">
        <p>
          <b>{title}</b>
        </p>
        {body && <p className="qr-commit-head__body">{body}</p>}
        <p className="qr-muted">
          <code>{commit.sha.slice(0, 7)}</code>
          {commit.authorLogin && <> · {commit.authorLogin}</>}
          {commit.date && <> · {formatAgo(commit.date)}</>}
          {files && (
            <>
              {' '}
              · {files.length} {files.length === 1 ? 'file' : 'files'} ·{' '}
              <span className="qr-positive">+{additions}</span>{' '}
              <span className="qr-negative">−{deletions}</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * The commit's files one under the other, each with its path above it and
 * its noise folded. Read only: line comments anchor on the PR's diff, not on
 * a commit's.
 */
export function CommitDiff({
  load,
  commitSha,
  splitDiff,
  openedFolds,
  onToggleFold,
  onRetry,
  onCopyPath,
}: {
  load: Load<DiffFile[]> | null;
  commitSha: string | null;
  splitDiff: boolean;
  openedFolds: ReadonlySet<string>;
  onToggleFold: (key: string) => void;
  onRetry: () => void;
  onCopyPath: (path: string) => void;
}) {
  if (!commitSha) return null;
  if (!load || load.status === 'loading')
    return <p className="qr-notice qr-muted">Loading the commit…</p>;
  if (load.status === 'error')
    return (
      <p className="qr-warning qr-commit-error" data-tone="error">
        {load.error}
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </p>
    );
  const noise = classifyNoise(load.value);
  return (
    <div className="qr-diff">
      {load.value.map((file) => {
        const fileNoise = noise.get(file.filename);
        return (
          <section
            key={`${commitSha}:${file.filename}`}
            className="qr-commit-file"
            aria-label={file.filename}
          >
            <header className="qr-commit-file__head">
              <button
                type="button"
                className="qr-pane__path"
                title={`${file.filename} · click to copy`}
                onClick={() => onCopyPath(file.filename)}
              >
                {file.filename}
              </button>
              {fileNoise?.mechanical && <span className="qr-muted">{fileNoise.label}</span>}
              <span className="qr-muted qr-pane__delta">
                <span className="qr-positive">+{file.additions}</span>{' '}
                <span className="qr-negative">−{file.deletions}</span>
              </span>
            </header>
            <DiffFileSection
              file={file}
              header={false}
              viewMode={splitDiff ? 'split' : 'unified'}
              onCopyPath={onCopyPath}
              hunkFolds={noiseFolds(
                file,
                fileNoise,
                `commit:${commitSha}`,
                openedFolds,
                onToggleFold,
              )}
            />
          </section>
        );
      })}
      <p className="qr-notice qr-muted">
        End of the commit. Switch to Guide or Folders to comment on a line.
      </p>
    </div>
  );
}
