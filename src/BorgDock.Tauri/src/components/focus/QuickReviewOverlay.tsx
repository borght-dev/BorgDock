import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { openUrl } from '@tauri-apps/plugin-opener';
import clsx from 'clsx';
import { FocusTrap } from 'focus-trap-react';
import { X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { prRowKey } from '@/components/pr/pr-card-data';
import { DiffFileSection } from '@/components/pr-detail/diff/DiffFileSection';
import { Markdown } from '@/components/shared/Markdown';
import { Button, IconButton } from '@/components/shared/primitives';
import { useQuickReviewDocument } from '@/hooks/useQuickReviewDocument';
import { type QuickReviewKeymap, useQuickReviewKeyboard } from '@/hooks/useQuickReviewKeyboard';
import {
  isGeneratedPath,
  markGeneratedReviewed,
  type ReviewCommentDraft,
  type ReviewEvent,
  reviewLineAnchor,
  reviewProgress,
  unreviewedLabel,
} from '@/services/quick-review';
import { type ReviewDecision, useQuickReviewStore } from '@/stores/quick-review-store';
import type { DiffLine, PullRequestWithChecks } from '@/types';
import { motionMs, motionOK } from '@/utils/motion';
import {
  getReviewDraftStorageWarning,
  subscribeReviewDraftStorage,
} from '@/utils/review-draft-storage';
import { ApproveButton, QuickReviewCard, QuickReviewCardHeader } from './QuickReviewCard';
import { QuickReviewComment } from './QuickReviewComment';
import { QuickReviewDiscussion } from './QuickReviewDiscussion';
import { QuickReviewFinish } from './QuickReviewFinish';
import { QuickReviewNavigation } from './QuickReviewNavigation';
import { QuickReviewSummary } from './QuickReviewSummary';
import './quick-review.css';

/** How long a decided card takes to fly off the deck (`.qr-card--gone-*`). */
const FLING_MS = 600;
/** How many cards peek behind the top one. */
const PEEKS = 2;

type FlingDirection = 'left' | 'right';

interface LeavingCard {
  pr: PullRequestWithChecks;
  dir: FlingDirection;
  id: number;
}

function prKey(pr: PullRequestWithChecks): string {
  return prRowKey(pr.pullRequest);
}

/** Approved and commented reviews fly right; "Review later" flies left. */
function flingFor(decision: ReviewDecision): FlingDirection {
  return decision === 'skipped' ? 'left' : 'right';
}

/**
 * The deck's motion after a decision: the decided card is kept for
 * `FLING_MS` so it can fly off (not under reduced motion), and the cards
 * behind it rise one slot. Going back or starting a new session does neither.
 */
function useDeckMotion(
  queue: PullRequestWithChecks[],
  index: number,
  complete: boolean,
  decisions: Map<string, ReviewDecision>,
) {
  const [leaving, setLeaving] = useState<LeavingCard | null>(null);
  const [rising, setRising] = useState(false);
  const previous = useRef({ queue, index, complete });
  const timer = useRef<number | undefined>(undefined);
  const flings = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    const before = previous.current;
    previous.current = { queue, index, complete };
    if (before.queue !== queue) {
      setLeaving(null);
      setRising(false);
      return;
    }
    const advanced = index === before.index + 1 || (complete && !before.complete);
    if (!advanced) {
      if (index < before.index) setRising(false);
      return;
    }
    setRising(true);
    const pr = queue[before.index];
    const decision = pr ? decisions.get(prKey(pr)) : undefined;
    if (!pr || !decision || !motionOK()) return;
    flings.current += 1;
    setLeaving({ pr, dir: flingFor(decision), id: flings.current });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLeaving(null), FLING_MS + 50);
  }, [queue, index, complete, decisions]);

  return { leaving, rising };
}

/**
 * Mounted while `open`, and for `ms` after it closes so the closing
 * animation can run (`closing`). Instant under reduced motion.
 */
function usePresence(open: boolean, ms: number): 'open' | 'closing' | 'closed' {
  const [phase, setPhase] = useState<'open' | 'closing' | 'closed'>(open ? 'open' : 'closed');
  useEffect(() => {
    if (open) {
      setPhase('open');
      return;
    }
    if (!motionOK()) {
      setPhase('closed');
      return;
    }
    setPhase((p) => (p === 'closed' ? 'closed' : 'closing'));
    const timer = window.setTimeout(() => setPhase('closed'), ms);
    return () => window.clearTimeout(timer);
  }, [open, ms]);
  if (open) return 'open';
  return phase === 'open' ? 'closing' : phase;
}

/** A card behind the top one, or the one flying off: the header is all it shows. */
function GhostCard({
  pr,
  depth,
  gone,
}: {
  pr: PullRequestWithChecks;
  depth?: number;
  gone?: FlingDirection;
}) {
  return (
    <div
      className={clsx('qr-card', 'qr-card--ghost', gone && `qr-card--gone-${gone}`)}
      data-i={gone ? 'x' : String(depth)}
      aria-hidden="true"
    >
      <QuickReviewCardHeader pr={pr.pullRequest} />
    </div>
  );
}

/**
 * QuickReviewOverlay — Quick Review over whichever view is on top
 * (plans/ui-overhaul-workbench.md, phase 4, after the iteration 2 mockup).
 *
 * A deck of cards, one per PR: the current one on top, the next two peeking
 * behind. The card summarises the PR (files by folder, what is left to
 * review, CI); "Review files" turns it into a file walk (tree, diff, Mark
 * reviewed and next); Approve is enabled once every non-generated file is
 * marked and flings the card right, Review later flings it left. The
 * overlay scales in from 0.96 and fades (`--motion-base`, `--ease-out`) and
 * reverses on close; every movement collapses to instant under reduced
 * motion.
 */
export function QuickReviewOverlay() {
  const state = useQuickReviewStore((s) => s.state);
  const queue = useQuickReviewStore((s) => s.queue);
  const index = useQuickReviewStore((s) => s.currentIndex);
  const decisions = useQuickReviewStore((s) => s.decisions);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const deck = useDeckMotion(queue, index, state === 'complete', decisions);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  // Ended from elsewhere (or reopened) while the close animation ran.
  useEffect(() => {
    if (state === 'idle') {
      window.clearTimeout(closeTimer.current);
      setClosing(false);
    }
  }, [state]);

  const requestClose = useCallback(() => {
    if (useQuickReviewStore.getState().state === 'submitting') return;
    if (!motionOK()) {
      useQuickReviewStore.getState().endSession();
      return;
    }
    setClosing(true);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(
      () => {
        setClosing(false);
        useQuickReviewStore.getState().endSession();
      },
      motionMs('--motion-base', 260),
    );
  }, []);

  useQuickReviewKeyboard(state === 'complete' && !closing ? { Escape: requestClose } : undefined);

  if (state === 'idle') return null;
  const current = queue[index];
  const complete = state === 'complete';
  const decided = complete ? queue.length : index;
  return (
    <FocusTrap
      focusTrapOptions={{
        allowOutsideClick: true,
        escapeDeactivates: false,
        initialFocus: '[data-overlay="quick-review"]',
        fallbackFocus: '[data-overlay="quick-review"]',
        tabbableOptions: { displayCheck: 'none' },
      }}
    >
      <div className="qr-overlay" data-state={closing ? 'closing' : 'open'}>
        <button
          type="button"
          tabIndex={-1}
          className="qr-backdrop"
          aria-label="Close Quick Review"
          disabled={state === 'submitting'}
          onClick={requestClose}
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
            <h2 className="qr-heading">Quick review</h2>
            <span className="qr-prog">
              <span>
                PR {Math.min(index + 1, queue.length)} / {queue.length}
              </span>
              <span className="qr-bar" aria-hidden="true">
                <i style={{ width: `${(decided / Math.max(queue.length, 1)) * 100}%` }} />
              </span>
            </span>
            {index > 0 && !complete && (
              <Button
                variant="ghost"
                size="sm"
                disabled={state === 'submitting'}
                onClick={() => useQuickReviewStore.getState().goBack()}
              >
                Previous PR
              </Button>
            )}
            <IconButton
              icon={<X size={12} strokeWidth={2.25} aria-hidden="true" />}
              tooltip="Close"
              aria-label="Close"
              disabled={state === 'submitting'}
              onClick={requestClose}
            />
          </div>
          {complete ? (
            <div className="qr-body">
              <div className="qr-stage">
                <div className="qr-deck">
                  <div className="qr-card qr-summary" data-i="0">
                    <QuickReviewSummary
                      queue={queue}
                      decisions={decisions}
                      onClose={requestClose}
                    />
                  </div>
                  {deck.leaving && (
                    <GhostCard key={deck.leaving.id} pr={deck.leaving.pr} gone={deck.leaving.dir} />
                  )}
                </div>
              </div>
            </div>
          ) : (
            current && (
              <QuickReviewWorkspace
                key={prKey(current)}
                pr={current}
                peeks={queue.slice(index + 1, index + 1 + PEEKS)}
                leaving={deck.leaving}
                rising={deck.rising}
                closing={closing}
                onClose={requestClose}
              />
            )
          )}
        </div>
      </div>
    </FocusTrap>
  );
}

type Mode = 'card' | 'walk' | 'compose';

interface WorkspaceProps {
  pr: PullRequestWithChecks;
  /** The next PRs of the queue, drawn behind the top card. */
  peeks: PullRequestWithChecks[];
  /** The card that was just decided, flying off. */
  leaving: LeavingCard | null;
  /** The deck just moved up a card. */
  rising: boolean;
  /** The overlay is animating out: no more keys. */
  closing: boolean;
  onClose: () => void;
}

function QuickReviewWorkspace({ pr, peeks, leaving, rising, closing, onClose }: WorkspaceProps) {
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
  const [mode, setMode] = useState<Mode>('card');
  const [showingComments, setShowingComments] = useState(false);
  const [commentsOpened, setCommentsOpened] = useState(false);
  const [reattachId, setReattachId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const mainRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const walkRef = useRef<HTMLElement>(null);
  const lastMode = useRef<Mode>('card');
  const approveReasonId = useId();
  const walkPhase = usePresence(mode === 'walk', motionMs('--motion-push', 360));

  const files = snapshot?.files ?? [];
  const paths = files.map((f) => f.filename);
  const progress = reviewProgress(paths, doc.reviewed);
  const reviewed = new Set(doc.reviewed);
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

  /** Why a review with this decision cannot be submitted yet, or null. */
  function issueFor(event: ReviewEvent): string | null {
    if (!snapshot || loading) return 'Wait for the latest files to finish loading.';
    if (loadError) return 'Reload the files before submitting.';
    if (stale) return 'Reload files before submitting this review.';
    if (event === 'APPROVE' && progress.left > 0) return unreviewedLabel(progress.left);
    if (unreadyComments)
      return 'Save or delete unfinished drafts and reattach outdated comments before submitting.';
    if (event === 'REQUEST_CHANGES' && !doc.body.trim())
      return 'Add an overall comment before requesting changes.';
    if (event === 'COMMENT' && !doc.body.trim() && doc.comments.length === 0)
      return 'Add an overall or inline comment before submitting.';
    if (detail.state.toLowerCase() !== 'open') return 'This PR is no longer open.';
    return null;
  }
  const submitIssue = issueFor(doc.event);
  /**
   * Why Approve is not possible yet, in a few words for the line under the
   * card's actions. The same checks as `issueFor('APPROVE')`, and the one
   * predicate the button and the → key both read.
   */
  function approveBlocker(): string | null {
    if (!snapshot || loading) return 'Files are still loading';
    if (loadError) return 'Reload the files first';
    if (stale) return 'New changes: reload the files';
    if (progress.left > 0) return unreviewedLabel(progress.left);
    if (unreadyComments) return 'Unsaved or outdated drafts';
    if (detail.state.toLowerCase() !== 'open') return 'PR is not open';
    return null;
  }
  const approveIssue = approveBlocker();

  // Focus follows the view: into the tree when the walk opens, back to the
  // button that opened it when the walk closes.
  useEffect(() => {
    const before = lastMode.current;
    lastMode.current = mode;
    if (before === mode) return;
    if (mode === 'walk') {
      const target =
        walkRef.current?.querySelector<HTMLElement>('.qr-file[aria-current]') ??
        walkRef.current?.querySelector<HTMLElement>('.qr-mark');
      target?.focus();
    } else if (mode === 'card') {
      const selector = before === 'walk' ? '.qr-files-btn' : '.qr-write';
      stageRef.current?.querySelector<HTMLElement>(selector)?.focus();
    }
  }, [mode]);

  function go(path: string | null) {
    setShowingComments(false);
    update((d) => ({ ...d, step: path }));
    mainRef.current?.scrollTo?.(0, 0);
  }
  function openWalk() {
    if (!ready || files.length === 0) return;
    const resume = file && !reviewed.has(file.filename) ? file.filename : undefined;
    const firstOpen = files.find((f) => !reviewed.has(f.filename))?.filename;
    const target = resume ?? firstOpen ?? file?.filename ?? files[0]?.filename ?? null;
    setShowingComments(false);
    update((d) => ({ ...d, walked: true, step: target }));
    setMode('walk');
  }
  function toCard() {
    setShowingComments(false);
    setMode('card');
  }
  function step(delta: number) {
    if (!ready || busy || fileIndex < 0) return;
    const target = files[fileIndex + delta];
    if (target) go(target.filename);
  }
  /** Marks the current file and moves to the next file not reviewed yet. */
  function markAndNext() {
    if (!ready || !file || busy) return;
    const done = new Set([...doc.reviewed, file.filename]);
    update((d) => ({ ...d, reviewed: [...new Set([...d.reviewed, file.filename])] }));
    const next =
      files.slice(fileIndex + 1).find((f) => !done.has(f.filename)) ??
      files.find((f) => !done.has(f.filename));
    if (next) go(next.filename);
  }
  function toggleReviewed() {
    if (!ready || !file || busy) return;
    update((d) => ({
      ...d,
      reviewed: d.reviewed.includes(file.filename)
        ? d.reviewed.filter((p) => p !== file.filename)
        : [...d.reviewed, file.filename],
    }));
  }
  function skipGenerated() {
    if (!ready || busy) return;
    update((d) => markGeneratedReviewed(d, paths));
  }
  function approve() {
    if (busy || approveIssue) return;
    void submit('APPROVE');
  }
  function later() {
    if (busy) return;
    useQuickReviewStore.getState().advance('skipped');
  }
  function submitComposed() {
    if (busy || submitIssue) return;
    void submit();
  }

  const keymap: QuickReviewKeymap | undefined = closing
    ? undefined
    : mode === 'walk'
      ? {
          v: markAndNext,
          n: () => step(1),
          j: () => step(1),
          p: () => step(-1),
          k: () => step(-1),
          Escape: () => (showingComments ? setShowingComments(false) : toCard()),
        }
      : mode === 'compose'
        ? { Escape: toCard }
        : { ArrowRight: approve, ArrowLeft: later, Enter: openWalk, Escape: onClose };
  useQuickReviewKeyboard(keymap);

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
          setMode('walk');
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

  const problem = loadError || error || (stale ? 'New changes are available.' : null);
  const alert = problem ? (
    <div className="qr-warning" role="alert">
      {problem}
      <Button variant="secondary" size="md" onClick={reload} disabled={loading}>
        Reload files
      </Button>
    </div>
  ) : null;

  const filesLabel = !doc.walked
    ? 'Review files'
    : progress.left > 0
      ? 'Continue reviewing'
      : 'Review files again';
  const submitLabel =
    doc.event === 'APPROVE'
      ? 'Submit approval'
      : doc.event === 'REQUEST_CHANGES'
        ? 'Request changes'
        : 'Submit review';

  const cardActions =
    mode === 'compose' ? (
      <>
        <Button variant="secondary" size="lg" onClick={toCard}>
          Back
        </Button>
        <span className="qr-spacer" />
        <Button
          variant="primary"
          size="lg"
          className="qr-submit"
          disabled={!!submitIssue}
          loading={busy}
          aria-describedby={submitIssue ? 'quick-review-submit-issue' : undefined}
          title={submitIssue ?? undefined}
          onClick={submitComposed}
        >
          {submitLabel}
        </Button>
      </>
    ) : (
      <>
        <Button
          variant="secondary"
          size="lg"
          className="qr-later"
          aria-keyshortcuts="ArrowLeft"
          onClick={later}
        >
          Review later
        </Button>
        <Button
          variant="primary"
          size="lg"
          className="qr-files-btn"
          aria-keyshortcuts="Enter"
          disabled={!ready || files.length === 0}
          onClick={openWalk}
        >
          {filesLabel}
        </Button>
        <Button variant="ghost" size="lg" className="qr-write" onClick={() => setMode('compose')}>
          Write review{doc.comments.length ? ` · ${doc.comments.length}` : ''}
        </Button>
        <ApproveButton
          issue={approveIssue}
          busy={busy}
          onApprove={approve}
          reasonId={approveReasonId}
        />
      </>
    );

  const walking = mode === 'walk';
  const generatedFile = file ? isGeneratedPath(file.filename) : false;

  return (
    <fieldset className="qr-workspace" disabled={busy} aria-busy={busy} data-mode={mode}>
      <div className="qr-body">
        <div
          ref={stageRef}
          className="qr-stage"
          data-walking={walking ? 'true' : undefined}
          inert={walking}
          aria-hidden={walking || undefined}
        >
          <div className="qr-deck" data-rise={rising ? 'true' : undefined}>
            {peeks
              .map((peek, i) => <GhostCard key={prKey(peek)} pr={peek} depth={i + 1} />)
              .reverse()}
            <QuickReviewCard
              pr={pr}
              detail={detail}
              files={snapshot ? paths : null}
              reviewed={doc.reviewed}
              alert={alert}
              body={
                mode === 'compose' ? (
                  <QuickReviewFinish
                    document={doc}
                    progress={progress}
                    comments={doc.comments.map(commentView)}
                    submitIssue={submitIssue}
                    update={update}
                  />
                ) : undefined
              }
              actions={cardActions}
              actionsNote={
                mode === 'card' && approveIssue ? (
                  <p id={approveReasonId} className="qr-act-note">
                    {approveIssue}
                  </p>
                ) : null
              }
              headerExtra={
                <Button variant="ghost" size="sm" onClick={() => void openGitHub()}>
                  Open in GitHub
                </Button>
              }
            />
            {leaving && <GhostCard key={leaving.id} pr={leaving.pr} gone={leaving.dir} />}
          </div>
        </div>
        {walkPhase !== 'closed' && (
          <section
            ref={walkRef}
            className="qr-walk"
            data-state={walkPhase}
            aria-label="File walk"
            inert={walkPhase === 'closing'}
            aria-hidden={walkPhase === 'closing' || undefined}
          >
            <QuickReviewNavigation
              document={doc}
              groups={snapshot?.groups ?? []}
              currentPath={file?.filename ?? null}
              onNavigate={go}
            />
            <div className="qr-pane">
              {alert}
              {reattachId && (
                <div className="qr-warning">
                  Choose + beside a line to reattach your draft.
                  <Button variant="ghost" size="sm" onClick={() => setReattachId(null)}>
                    Cancel
                  </Button>
                </div>
              )}
              <div className="qr-pane__head">
                {file ? (
                  <>
                    <code className="qr-pane__path" title={file.filename}>
                      {file.filename}
                    </code>
                    <span className="qr-muted">
                      <span className="qr-positive">+{file.additions}</span>{' '}
                      <span className="qr-negative">−{file.deletions}</span>
                    </span>
                    <span className="qr-muted">
                      File {fileIndex + 1} of {files.length}
                    </span>
                    <span className="qr-spacer" />
                    <label className="qr-pane__check">
                      <input
                        type="checkbox"
                        checked={reviewed.has(file.filename)}
                        onChange={toggleReviewed}
                        disabled={!ready}
                      />{' '}
                      {reviewed.has(file.filename)
                        ? 'Reviewed'
                        : generatedFile
                          ? 'Generated, skippable'
                          : 'Not reviewed'}
                    </label>
                  </>
                ) : (
                  <span className="qr-spacer qr-muted">
                    {loading ? 'Loading changed files…' : 'No file selected.'}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-pressed={showingComments}
                  onClick={() => {
                    setCommentsOpened(true);
                    setShowingComments((v) => !v);
                  }}
                >
                  {showingComments ? 'Back to diff' : 'Comments'}
                </Button>
              </div>
              <div className="qr-main" hidden={!showingComments} data-quick-review-comments>
                {commentsOpened && <QuickReviewDiscussion pr={detail} enabled={commentsOpened} />}
              </div>
              <div
                className="qr-main"
                ref={mainRef}
                hidden={showingComments}
                data-quick-review-content
              >
                {file && (
                  <div key={file.filename} className="qr-diff">
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
                  </div>
                )}
              </div>
            </div>
            <div className="qr-foot" data-quick-review-actions>
              <span className="qr-foot__left" data-quick-review-progress="">
                {progress.reviewed} of {progress.total} reviewed, {progress.left} to go
              </span>
              {progress.generatedLeft > 0 && (
                <Button variant="ghost" size="md" className="qr-skip-gen" onClick={skipGenerated}>
                  Skip generated
                </Button>
              )}
              <Button
                variant="secondary"
                size="md"
                className="qr-prev"
                aria-keyshortcuts="P"
                disabled={!ready || fileIndex <= 0}
                onClick={() => step(-1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="md"
                className="qr-next"
                aria-keyshortcuts="N"
                disabled={!ready || fileIndex < 0 || fileIndex >= files.length - 1}
                onClick={() => step(1)}
              >
                Next file
              </Button>
              <Button
                variant="primary"
                size="md"
                className="qr-mark"
                aria-keyshortcuts="V"
                disabled={!ready || !file}
                onClick={markAndNext}
              >
                Mark reviewed and next
              </Button>
              <Button
                variant={progress.left === 0 ? 'primary' : 'secondary'}
                size="md"
                className="qr-finish"
                onClick={toCard}
              >
                Finish review
              </Button>
            </div>
          </section>
        )}
      </div>
      <footer className="qr-footer">
        <span role="status">
          {busy ? 'Submitting review…' : storageWarning || notice || 'Drafts saved on this device.'}
        </span>
        <span className="qr-spacer" />
        <span className="qr-shortcuts">
          {walking
            ? 'V mark reviewed · N next · P previous · Esc back to the card'
            : mode === 'compose'
              ? 'Esc back to the card'
              : '→ approve when enabled · ← review later · Enter review files · Esc close'}
        </span>
      </footer>
    </fieldset>
  );
}
