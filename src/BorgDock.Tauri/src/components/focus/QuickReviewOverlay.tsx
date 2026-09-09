import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { openUrl } from '@tauri-apps/plugin-opener';
import FocusTrap from 'focus-trap-react';
import { useRef, useState, useSyncExternalStore } from 'react';
import { DiffFileSection } from '@/components/pr-detail/diff/DiffFileSection';
import { Markdown } from '@/components/shared/Markdown';
import { Button, IconButton } from '@/components/shared/primitives';
import { useQuickReviewDocument } from '@/hooks/useQuickReviewDocument';
import { useQuickReviewKeyboard } from '@/hooks/useQuickReviewKeyboard';
import { type ReviewCommentDraft, reviewLineAnchor } from '@/services/quick-review';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import type { DiffLine, PullRequestWithChecks } from '@/types';
import {
  getReviewDraftStorageWarning,
  subscribeReviewDraftStorage,
} from '@/utils/review-draft-storage';
import { QuickReviewComment } from './QuickReviewComment';
import { QuickReviewDiscussion } from './QuickReviewDiscussion';
import { QuickReviewFinish } from './QuickReviewFinish';
import { QuickReviewNavigation } from './QuickReviewNavigation';
import { QuickReviewSummary } from './QuickReviewSummary';
import './quick-review.css';

export function QuickReviewOverlay() {
  const state = useQuickReviewStore((s) => s.state);
  const queue = useQuickReviewStore((s) => s.queue);
  const index = useQuickReviewStore((s) => s.currentIndex);
  const decisions = useQuickReviewStore((s) => s.decisions);
  const endSession = useQuickReviewStore((s) => s.endSession);
  if (state === 'idle') return null;
  const current = queue[index];
  return (
    <FocusTrap
      focusTrapOptions={{
        allowOutsideClick: true,
        escapeDeactivates: false,
        fallbackFocus: '[data-overlay="quick-review"]',
        tabbableOptions: { displayCheck: 'none' },
      }}
    >
      <div className="qr-overlay">
        <button
          type="button"
          className="qr-backdrop"
          aria-label="Close Quick Review"
          disabled={state === 'submitting'}
          onClick={endSession}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Quick Review"
          tabIndex={-1}
          data-overlay="quick-review"
          className="qr-dialog"
        >
          <div className="qr-titlebar">
            <strong>Quick Review</strong>
            <span className="qr-muted">
              PR {index + 1} / {queue.length}
            </span>
            <span className="qr-spacer" />
            <IconButton
              icon={<span aria-hidden="true">×</span>}
              tooltip="Close"
              disabled={state === 'submitting'}
              onClick={endSession}
            />
          </div>
          {state === 'complete' ? (
            <div className="qr-main qr-summary">
              <QuickReviewSummary queue={queue} decisions={decisions} onClose={endSession} />
            </div>
          ) : (
            current && (
              <QuickReviewWorkspace
                key={`${current.pullRequest.repoOwner}/${current.pullRequest.repoName}#${current.pullRequest.number}`}
                pr={current}
              />
            )
          )}
        </div>
      </div>
    </FocusTrap>
  );
}

function QuickReviewWorkspace({ pr }: { pr: PullRequestWithChecks }) {
  const storageWarning = useSyncExternalStore(
    subscribeReviewDraftStorage,
    getReviewDraftStorageWarning,
  );
  const {
    document: doc,
    update,
    snapshot,
    loading,
    loadError,
    stale,
    reload,
    submit,
  } = useQuickReviewDocument(pr.pullRequest);
  const state = useQuickReviewStore((s) => s.state);
  const error = useQuickReviewStore((s) => s.error);
  const index = useQuickReviewStore((s) => s.currentIndex);
  const [finishing, setFinishing] = useState(false);
  const [showingComments, setShowingComments] = useState(false);
  const [commentsOpened, setCommentsOpened] = useState(false);
  const [reattachId, setReattachId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const mainRef = useRef<HTMLDivElement>(null);
  const files = snapshot?.files ?? [];
  const fileIndex = files.findIndex((f) => f.filename === doc.step);
  const file = files[fileIndex];
  const commentsByLine = new Map<string, ReviewCommentDraft[]>();
  for (const comment of doc.comments) {
    if (comment.outdated || comment.path !== file?.filename) continue;
    const key = `${comment.side}:${comment.line}`;
    const list = commentsByLine.get(key) ?? [];
    list.push(comment);
    commentsByLine.set(key, list);
  }
  const detail = snapshot?.pr ?? pr.pullRequest;
  const busy = state === 'submitting';
  const ready = !!snapshot && !loading && !loadError && !stale;
  const unreadyComments = doc.comments.some((c) => !c.saved || c.outdated || !c.body.trim());
  const validBody =
    doc.event === 'APPROVE' ||
    !!doc.body.trim() ||
    (doc.event === 'COMMENT' && doc.comments.length > 0);
  const canSubmit = ready && !busy && !unreadyComments && validBody && detail.state === 'open';

  function go(path: string | null) {
    setShowingComments(false);
    setFinishing(false);
    update((d) => ({ ...d, step: path }));
    mainRef.current?.scrollTo?.(0, 0);
  }
  function finish() {
    setShowingComments(false);
    setFinishing(true);
    mainRef.current?.scrollTo?.(0, 0);
  }
  function next(mark = false) {
    if (showingComments) {
      setShowingComments(false);
      return;
    }
    if (!ready || finishing || busy) return;
    if (mark && file)
      update((d) => ({ ...d, reviewed: [...new Set([...d.reviewed, file.filename])] }));
    if (fileIndex === files.length - 1) finish();
    else go(files[fileIndex + 1]?.filename ?? null);
  }
  function toggleReviewed() {
    if (!ready || !file || finishing || busy || showingComments) return;
    update((d) => ({
      ...d,
      reviewed: d.reviewed.includes(file.filename)
        ? d.reviewed.filter((p) => p !== file.filename)
        : [...d.reviewed, file.filename],
    }));
  }
  useQuickReviewKeyboard({
    next: () => next(),
    previous: () => {
      if (showingComments) {
        setShowingComments(false);
      } else if (finishing) {
        setFinishing(false);
      } else go(files[fileIndex - 1]?.filename ?? null);
    },
    markReviewed: toggleReviewed,
  });

  function changeComment(id: string, change: Partial<ReviewCommentDraft>) {
    update((d) => ({
      ...d,
      comments: d.comments.map((c) => (c.id === id ? { ...c, ...change } : c)),
    }));
  }
  function addComment(line: DiffLine) {
    const anchor = reviewLineAnchor(line);
    if (!file || !anchor || !ready || busy) return;
    if (reattachId) {
      changeComment(reattachId, { ...anchor, path: file.filename, outdated: false, saved: false });
      setReattachId(null);
      return;
    }
    update((d) => ({
      ...d,
      comments: [
        ...d.comments,
        {
          id: crypto.randomUUID(),
          path: file.filename,
          ...anchor,
          body: '',
          saved: false,
          outdated: false,
        },
      ],
    }));
  }
  function commentView(comment: ReviewCommentDraft) {
    return (
      <QuickReviewComment
        key={comment.id}
        comment={comment}
        onChange={(change) => changeComment(comment.id, change)}
        onDelete={() =>
          update((d) => ({ ...d, comments: d.comments.filter((c) => c.id !== comment.id) }))
        }
        onReattach={() => {
          setReattachId(comment.id);
          go(
            files.some((f) => f.filename === comment.path)
              ? comment.path
              : (files[0]?.filename ?? null),
          );
        }}
      />
    );
  }
  async function openGitHub() {
    try {
      await openUrl(detail.htmlUrl);
    } catch {
      setNotice('Could not open GitHub.');
    }
  }

  return (
    <fieldset className="qr-workspace" disabled={busy} aria-busy={busy}>
      <header className="qr-pr-header">
        <div className="qr-row qr-muted">
          <span>
            {detail.repoOwner}/{detail.repoName} #{detail.number}
          </span>
          <span className="qr-spacer" />
          <Button variant="ghost" size="sm" onClick={() => void openGitHub()}>
            Open in GitHub
          </Button>
        </div>
        <h2>{detail.title}</h2>
        <div className="qr-row qr-muted">
          <span>{detail.authorLogin}</span>
          <span className="qr-branch">
            {detail.headRef} → {detail.baseRef}
          </span>
          <span className="qr-positive">+{detail.additions}</span>
          <span className="qr-negative">−{detail.deletions}</span>
          <span>{detail.changedFiles} files</span>
          <span>{detail.commitCount} commits</span>
        </div>
      </header>
      <div className="qr-body">
        <QuickReviewNavigation
          document={doc}
          groups={snapshot?.groups ?? []}
          currentPath={file?.filename ?? null}
          finishing={finishing}
          showingComments={showingComments}
          onComments={() => {
            setCommentsOpened(true);
            setShowingComments(true);
          }}
          onNavigate={go}
        />
        <div className="qr-main" hidden={!showingComments} data-quick-review-comments>
          {commentsOpened && <QuickReviewDiscussion pr={detail} enabled={commentsOpened} />}
        </div>
        <div className="qr-main" ref={mainRef} hidden={showingComments} data-quick-review-content>
          {(loadError || error || stale) && (
            <div className="qr-warning" role="alert">
              {loadError || error || 'New changes are available.'}
              <Button variant="secondary" size="md" onClick={reload} disabled={loading}>
                Reload files
              </Button>
            </div>
          )}
          {loading && (
            <p className="qr-notice" role="status">
              Loading current PR and changed files…
            </p>
          )}
          {reattachId && (
            <div className="qr-warning">
              Choose + beside a line to reattach your draft.
              <Button variant="ghost" size="sm" onClick={() => setReattachId(null)}>
                Cancel
              </Button>
            </div>
          )}
          {finishing ? (
            <QuickReviewFinish
              document={doc}
              total={files.length}
              unfinished={unreadyComments}
              comments={doc.comments.map(commentView)}
              update={update}
            />
          ) : !file ? (
            <article className="qr-description">
              <h3>PR description</h3>
              <div className="markdown-body">
                <Markdown>{detail.body || 'No description provided.'}</Markdown>
              </div>
              {ready && files.length === 0 && <p>No changed files in this PR.</p>}
            </article>
          ) : (
            <>
              <div className="qr-file-toolbar">
                <span>
                  File {fileIndex + 1} of {files.length}
                </span>
                <label>
                  <input
                    type="checkbox"
                    checked={doc.reviewed.includes(file.filename)}
                    onChange={toggleReviewed}
                    disabled={!ready}
                  />{' '}
                  Reviewed
                </label>
              </div>
              <details className="qr-context">
                <summary>PR description</summary>
                <div className="markdown-body">
                  <Markdown>{detail.body || 'No description provided.'}</Markdown>
                </div>
              </details>
              <DiffFileSection
                key={`${file.filename}:${doc.headSha}:${doc.baseSha}`}
                file={file}
                viewMode="unified"
                onCopyPath={(path) =>
                  void writeText(path).catch(() => setNotice('Could not copy file path.'))
                }
                onOpenInGitHub={() => void openGitHub()}
                onAddComment={ready ? addComment : undefined}
                renderLineAttachment={(line) => {
                  const anchor = reviewLineAnchor(line);
                  return anchor
                    ? commentsByLine.get(`${anchor.side}:${anchor.line}`)?.map(commentView)
                    : null;
                }}
              />
              <p className="qr-notice qr-muted">
                End of file. Use + beside a line to add a draft comment.
              </p>
            </>
          )}
        </div>
      </div>
      <div className="qr-actions" data-quick-review-actions>
        <Button
          variant="ghost"
          size="md"
          className="qr-later"
          onClick={() => useQuickReviewStore.getState().advance('skipped')}
        >
          Review later
        </Button>
        <Button
          variant="secondary"
          size="md"
          className="qr-prev"
          disabled={showingComments || (!finishing && fileIndex < 0)}
          onClick={() =>
            finishing ? setFinishing(false) : go(files[fileIndex - 1]?.filename ?? null)
          }
        >
          ← Previous
        </Button>
        <Button
          variant="secondary"
          size="md"
          className="qr-next"
          disabled={!showingComments && (!ready || finishing || fileIndex === files.length - 1)}
          onClick={() => next()}
        >
          {showingComments ? 'Back to review' : fileIndex < 0 ? 'Start review →' : 'Next file →'}
        </Button>
        {finishing ? (
          <Button
            variant="primary"
            size="md"
            className="qr-mark"
            disabled={!canSubmit || showingComments}
            loading={busy}
            onClick={() => void submit()}
          >
            {doc.event === 'APPROVE'
              ? 'Submit approval'
              : doc.event === 'REQUEST_CHANGES'
                ? 'Request changes'
                : 'Submit review'}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="md"
            className="qr-mark"
            disabled={!ready || !file || showingComments}
            onClick={() => next(true)}
          >
            {fileIndex === files.length - 1 ? 'Mark reviewed & finish' : 'Mark reviewed & next'}
          </Button>
        )}
        <Button
          variant="secondary"
          size="md"
          className="qr-finish"
          disabled={finishing && !showingComments}
          onClick={finish}
        >
          Finish review{doc.comments.length ? ` · ${doc.comments.length}` : ''}
        </Button>
      </div>
      <footer className="qr-footer">
        <span role="status">
          {busy ? 'Submitting review…' : storageWarning || notice || 'Drafts saved on this device.'}
        </span>
        <span className="qr-spacer" />
        {index > 0 && (
          <Button variant="ghost" size="sm" onClick={() => useQuickReviewStore.getState().goBack()}>
            Previous PR
          </Button>
        )}
        <span className="qr-shortcuts">N next · P previous · V reviewed · Esc close</span>
      </footer>
    </fieldset>
  );
}
