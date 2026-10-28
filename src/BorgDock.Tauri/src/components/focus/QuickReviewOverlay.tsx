import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { openUrl } from '@tauri-apps/plugin-opener';
import clsx from 'clsx';
import { FocusTrap } from 'focus-trap-react';
import {
  ChevronLeft,
  ChevronRight,
  GitCommitHorizontal,
  History,
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { checkCountsFor, prRowKey } from '@/components/pr/pr-card-data';
import { DiffFileSection } from '@/components/pr-detail/diff/DiffFileSection';
import { ImageDiff } from '@/components/pr-detail/diff/ImageDiff';
import { LinkedWorkItemBadge } from '@/components/pr-detail/LinkedWorkItemBadge';
import { DetailDialog } from '@/components/shared/DetailDialog';
import { Button, checkBarSummary, IconButton, Seg2 } from '@/components/shared/primitives';
import { usePrConversation } from '@/hooks/usePrConversation';
import { useQuickReviewDocument } from '@/hooks/useQuickReviewDocument';
import { type QuickReviewKeymap, useQuickReviewKeyboard } from '@/hooks/useQuickReviewKeyboard';
import { useReviewReadiness } from '@/hooks/useReviewReadiness';
import { useReviewSince } from '@/hooks/useReviewSince';
import { useWorkItemLinks } from '@/hooks/useWorkItemLinks';
import { isImagePath } from '@/services/github/images';
import { postComment } from '@/services/github/mutations';
import { getClientForRepo } from '@/services/github/singleton';
import {
  isGeneratedPath,
  markGeneratedReviewed,
  orderQuickReviewPrs,
  type ReviewCommentDraft,
  type ReviewEvent,
  reviewLineAnchor,
  reviewProgress,
  unreviewedLabel,
} from '@/services/quick-review';
import { reviewVerb } from '@/services/review-since';
import { usePrStore } from '@/stores/pr-store';
import { type ReviewDecision, useQuickReviewStore } from '@/stores/quick-review-store';
import { toastError } from '@/stores/toast-store';
import type { DiffLine, PullRequest, PullRequestWithChecks } from '@/types';
import { motionMs, motionOK } from '@/utils/motion';
import { formatAgo } from '@/utils/relative-time';
import {
  getReviewDraftStorageWarning,
  subscribeReviewDraftStorage,
} from '@/utils/review-draft-storage';
import { ApproveButton, QuickReviewCard, QuickReviewCardHeader } from './QuickReviewCard';
import { QuickReviewChecks } from './QuickReviewChecks';
import { QuickReviewComment } from './QuickReviewComment';
import { type ContextTab, QuickReviewContext } from './QuickReviewContext';
import { QuickReviewDecisionBar } from './QuickReviewDecisionBar';
import { QuickReviewDiscussion } from './QuickReviewDiscussion';
import { QuickReviewEndCard } from './QuickReviewEndCard';
import { QuickReviewFinish } from './QuickReviewFinish';
import { QuickReviewNavigation } from './QuickReviewNavigation';
import { QuickReviewPrHeader } from './QuickReviewPrHeader';
import { proofCount, proofsFor, QuickReviewProof } from './QuickReviewProof';
import { QuickReviewSummary } from './QuickReviewSummary';
import { holdApproval, undoHeldApproval, useHeldApproval } from './quick-review-approval';
import './quick-review.css';

/** How long a decided card takes to fly off the deck (`.qr-card--gone-*`). */
const FLING_MS = 420;
/** How many cards peek behind the top one. */
const PEEKS = 2;
const FULLSCREEN_KEY = 'borgdock-quick-review-fullscreen';
const WRAP_LINES_KEY = 'borgdock-quick-review-wrap-lines';
const RICH_DIFF_KEY = 'borgdock-quick-review-rich-diff';
const SPLIT_DIFF_KEY = 'borgdock-quick-review-split-diff';
const CONTEXT_OPEN_KEY = 'borgdock-quick-review-context-open';

function readReviewPreference(key: string, fallback = false): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
}

function writeReviewPreference(key: string, value: boolean) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    return;
  }
}

function FullscreenButton({ fullscreen, onToggle }: { fullscreen: boolean; onToggle: () => void }) {
  const Icon = fullscreen ? Minimize2 : Maximize2;
  const label = fullscreen ? 'Exit full screen' : 'Full screen';
  return (
    <IconButton
      icon={<Icon size={14} aria-hidden="true" />}
      tooltip={label}
      aria-label={label}
      aria-pressed={fullscreen}
      onClick={onToggle}
    />
  );
}

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

/** Focus to the walk's current file in the tree, or to Mark reviewed when there is none. */
function focusCurrentFile(walk: HTMLElement | null) {
  const target =
    walk?.querySelector<HTMLElement>('.qr-file[aria-current]') ??
    walk?.querySelector<HTMLElement>('.qr-mark');
  target?.focus();
}

/** The line of shortcuts under the dialog: each key with what it does. */
function Shortcuts({ keys }: { keys: ReadonlyArray<readonly [string, string]> }) {
  return (
    <span className="qr-shortcuts">
      {keys.map(([key, action]) => (
        <span key={key}>
          <kbd>{key}</kbd> {action}
        </span>
      ))}
    </span>
  );
}

/**
 * QuickReviewOverlay — Quick Review over whichever view is on top
 * (plans/ui-overhaul-workbench.md, phase 4, after the iteration 2 mockup;
 * the file walk after design/quick-review-v2).
 *
 * A deck of cards, one per PR: the current one on top, the next two peeking
 * behind. The card summarises the PR (files by folder, what is left to
 * review, CI); "Review files" turns it into a file walk: the PR's header and
 * description above, the tree, the diff and a context panel with the proof
 * beside it. Marking the last file turns the walk's footer into the
 * decision bar. Approving moves on at once and posts the review when its
 * Undo toast runs out; the next PR opens where the last one was decided (on
 * the card or in the walk). The overlay scales in from 0.96 and fades
 * (`--motion-base`, `--ease-out`) and reverses on close; every movement
 * collapses to instant under reduced motion.
 */
export function QuickReviewOverlay() {
  const state = useQuickReviewStore((s) => s.state);
  const queue = useQuickReviewStore((s) => s.queue);
  const index = useQuickReviewStore((s) => s.currentIndex);
  const decisions = useQuickReviewStore((s) => s.decisions);
  const needsMyReview = usePrStore((s) => s.needsMyReview());
  const [closing, setClosing] = useState(false);
  const [fullscreen, setFullscreen] = useState(() => readReviewPreference(FULLSCREEN_KEY));
  const [walking, setWalking] = useState(false);
  const handledInRun = useRef(new Set<string>());
  const closeTimer = useRef<number | undefined>(undefined);
  const deck = useDeckMotion(queue, index, state === 'complete', decisions);

  function toggleFullscreen() {
    const next = !fullscreen;
    setFullscreen(next);
    writeReviewPreference(FULLSCREEN_KEY, next);
  }

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  // Ended from elsewhere (or reopened) while the close animation ran.
  useEffect(() => {
    if (state === 'idle') {
      window.clearTimeout(closeTimer.current);
      handledInRun.current.clear();
      setClosing(false);
      setWalking(false);
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
      motionMs('--motion-base', 200),
    );
  }, []);

  const current = queue[index];
  const complete = state === 'complete';
  const reviewedKeys = new Set([...handledInRun.current, ...queue.map(prKey)]);
  const nextPr = complete
    ? orderQuickReviewPrs(needsMyReview).find((pr) => !reviewedKeys.has(prKey(pr)))
    : undefined;
  const upNext = complete ? undefined : queue[index + 1];
  const reviewNext = () => {
    if (!nextPr) return;
    queue.forEach((pr) => {
      handledInRun.current.add(prKey(pr));
    });
    useQuickReviewStore.getState().startSinglePr(nextPr);
  };
  useQuickReviewKeyboard(
    complete && !closing
      ? {
          Escape: requestClose,
          z: undoHeldApproval,
          ...(nextPr ? { Enter: reviewNext } : {}),
        }
      : undefined,
  );

  if (state === 'idle') return null;
  const decided = complete ? queue.length : index;
  const busy = state === 'submitting';
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
          disabled={busy}
          onClick={requestClose}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Quick Review"
          tabIndex={-1}
          data-overlay="quick-review"
          className="qr-dialog"
          data-complete={complete ? 'true' : undefined}
          data-fullscreen={fullscreen}
        >
          <div className="qr-titlebar">
            <h2 className="qr-heading">Quick review</h2>
            {upNext && (
              <span className="qr-upnext" title={upNext.pullRequest.title}>
                Up next{' '}
                <b>
                  #{upNext.pullRequest.number} {upNext.pullRequest.title}
                </b>
              </span>
            )}
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
                disabled={busy}
                leading={<ChevronLeft size={14} aria-hidden="true" />}
                onClick={() => useQuickReviewStore.getState().goBack()}
              >
                Previous PR
              </Button>
            )}
            {walking && !complete && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                trailing={<ChevronRight size={14} aria-hidden="true" />}
                onClick={() => useQuickReviewStore.getState().advance('skipped')}
              >
                Review later
              </Button>
            )}
            <FullscreenButton fullscreen={fullscreen} onToggle={toggleFullscreen} />
            <IconButton
              icon={<X size={12} strokeWidth={2.25} aria-hidden="true" />}
              tooltip="Close"
              aria-label="Close"
              disabled={busy}
              onClick={requestClose}
            />
          </div>
          {complete ? (
            <>
              <div className="qr-body">
                <div className="qr-stage">
                  <div className="qr-deck">
                    <div className="qr-card qr-summary" data-i="0">
                      <QuickReviewSummary
                        queue={queue}
                        decisions={decisions}
                        nextPr={nextPr}
                        onNext={reviewNext}
                        onClose={requestClose}
                      />
                    </div>
                    {deck.leaving && (
                      <GhostCard
                        key={deck.leaving.id}
                        pr={deck.leaving.pr}
                        gone={deck.leaving.dir}
                      />
                    )}
                  </div>
                </div>
              </div>
              <footer className="qr-footer">
                <Shortcuts
                  keys={[
                    ...(nextPr ? [['Enter', 'review next PR'] as const] : []),
                    ['Esc', 'close'],
                  ]}
                />
              </footer>
            </>
          ) : (
            current && (
              <QuickReviewWorkspace
                key={prKey(current)}
                pr={current}
                peeks={queue.slice(index + 1, index + 1 + PEEKS)}
                leaving={deck.leaving}
                rising={deck.rising}
                closing={closing}
                startInWalk={walking}
                onWalkingChange={setWalking}
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
type Scope = 'since' | 'all';

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
  /** The previous PR was decided in the walk: open this one there too. */
  startInWalk: boolean;
  onWalkingChange: (walking: boolean) => void;
  onClose: () => void;
}

/** The Checks tab: required checks are only asked for while it is open. */
function ChecksTab({ pr, detail }: { pr: PullRequestWithChecks; detail: PullRequest }) {
  const readiness = useReviewReadiness(detail);
  return <QuickReviewChecks pr={pr} readiness={readiness} />;
}

function QuickReviewWorkspace({
  pr,
  peeks,
  leaving,
  rising,
  closing,
  startInWalk,
  onWalkingChange,
  onClose,
}: WorkspaceProps) {
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
    prepare,
    submit,
  } = useQuickReviewDocument(pr.pullRequest);
  const state = useQuickReviewStore((s) => s.state);
  const error = useQuickReviewStore((s) => s.error);
  const heldApproval = useHeldApproval();
  const [mode, setMode] = useState<Mode>(startInWalk ? 'walk' : 'card');
  const [wrapLines, setWrapLines] = useState(() => readReviewPreference(WRAP_LINES_KEY));
  const [richDiff, setRichDiff] = useState(() => readReviewPreference(RICH_DIFF_KEY, true));
  const [splitDiff, setSplitDiff] = useState(() => readReviewPreference(SPLIT_DIFF_KEY));
  const [contextOpen, setContextOpen] = useState(() =>
    readReviewPreference(CONTEXT_OPEN_KEY, true),
  );
  const [contextTab, setContextTab] = useState<ContextTab>('proof');
  const [describing, setDescribing] = useState(false);
  const [scope, setScope] = useState<Scope>('since');
  const [reattachId, setReattachId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [endNotice, setEndNotice] = useState('');
  const [commentsPopup, setCommentsPopup] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const walkRef = useRef<HTMLElement>(null);
  const endBodyRef = useRef<HTMLTextAreaElement>(null);
  const lastMode = useRef<Mode>('card');
  const pendingWalk = useRef(startInWalk);
  const focusDecision = useRef(false);
  const sinceApplied = useRef(false);
  const approveReasonId = useId();
  const walkPhase = usePresence(mode === 'walk', motionMs('--motion-push', 260));

  const detail = snapshot?.pr ?? pr.pullRequest;
  const client = getClientForRepo(detail.repoOwner, detail.repoName);
  const conversation = usePrConversation(detail, true);
  const proofs = proofsFor(detail, conversation);
  const links = useWorkItemLinks(detail);
  const workItems = new Map(links.workItems.map((item) => [item.id, item]));
  const since = useReviewSince(snapshot);
  const changed = since?.files ? new Set(since.files.map((f) => f.filename)) : null;
  const sinceScoped = !!changed && scope === 'since';

  const files = snapshot?.files ?? [];
  const paths = files.map((f) => f.filename);
  const walkFiles = sinceScoped ? files.filter((f) => changed.has(f.filename)) : files;
  const walkGroups = (snapshot?.groups ?? [])
    .map((group) =>
      sinceScoped ? { ...group, files: group.files.filter((f) => changed.has(f.filename)) } : group,
    )
    .filter((group) => group.files.length > 0);
  const progress = reviewProgress(paths, doc.reviewed);
  const walkProgress = reviewProgress(
    walkFiles.map((f) => f.filename),
    doc.reviewed,
  );
  const reviewed = new Set(doc.reviewed);
  const fileIndex = walkFiles.findIndex((f) => f.filename === doc.step);
  const prFile = walkFiles[fileIndex];
  const sinceFile = sinceScoped
    ? since?.files?.find((f) => f.filename === prFile?.filename && f.patch)
    : undefined;
  const file = sinceFile ?? prFile;
  const imageFile = !!file && isImagePath(file.filename);
  const richDiffVisible = imageFile && richDiff;
  const commentsByLine = new Map<string, ReviewCommentDraft[]>();
  for (const comment of doc.comments) {
    if (comment.outdated || comment.path !== file?.filename) continue;
    const key = `${comment.side}:${comment.line}`;
    const list = commentsByLine.get(key) ?? [];
    list.push(comment);
    commentsByLine.set(key, list);
  }
  const busy = state === 'submitting';
  const ready = !!snapshot && !loading && !loadError && !stale;
  const allReviewed = ready && progress.left === 0;
  const unreadyComments = doc.comments.some((c) => !c.saved || c.outdated || !c.body.trim());
  const checks = checkBarSummary(checkCountsFor(pr)).state;

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

  useEffect(() => onWalkingChange(mode === 'walk'), [mode, onWalkingChange]);

  // Focus follows the view: into the tree when the walk opens, back to the
  // button that opened it when the walk closes.
  useEffect(() => {
    const before = lastMode.current;
    lastMode.current = mode;
    if (before === mode) return;
    if (mode === 'walk') focusCurrentFile(walkRef.current);
    else if (mode === 'card') {
      const selector = before === 'walk' ? '.qr-files-btn' : '.qr-write';
      stageRef.current?.querySelector<HTMLElement>(selector)?.focus();
    }
  }, [mode]);

  // The previous PR was decided in the walk: this one opens there as soon
  // as its files are in.
  useEffect(() => {
    if (!pendingWalk.current || !ready || files.length === 0) return;
    pendingWalk.current = false;
    openWalk();
    focusCurrentFile(walkRef.current);
  });

  // On a re-review, the files nothing touched since the last review keep
  // that review: they start out marked, and the walk moves to a changed file
  // if it opened on another one before GitHub answered.
  useEffect(() => {
    if (!since?.files || !snapshot || sinceApplied.current) return;
    sinceApplied.current = true;
    const touched = new Set(since.files.map((f) => f.filename));
    const kept = snapshot.files.map((f) => f.filename).filter((path) => !touched.has(path));
    const firstChanged =
      snapshot.files.find((f) => touched.has(f.filename) && !doc.reviewed.includes(f.filename)) ??
      snapshot.files.find((f) => touched.has(f.filename));
    update((d) => ({
      ...d,
      reviewed: [...new Set([...d.reviewed, ...kept])],
      step: d.step === null || touched.has(d.step) ? d.step : (firstChanged?.filename ?? null),
    }));
  });

  // Marking the last file hands the keyboard to the decision bar.
  useEffect(() => {
    if (!focusDecision.current || !allReviewed) return;
    focusDecision.current = false;
    walkRef.current?.querySelector<HTMLElement>('.qr-decide--go')?.focus();
  });

  function go(path: string | null) {
    update((d) => ({ ...d, step: path }));
    mainRef.current?.scrollTo?.(0, 0);
  }
  function openWalk() {
    if (!ready || files.length === 0) return;
    const current = walkFiles[fileIndex];
    const resume = current && !reviewed.has(current.filename) ? current.filename : undefined;
    const firstOpen = walkFiles.find((f) => !reviewed.has(f.filename))?.filename;
    const target = resume ?? firstOpen ?? current?.filename ?? walkFiles[0]?.filename ?? null;
    update((d) => ({ ...d, walked: true, step: target }));
    setMode('walk');
  }
  function toCard() {
    setMode('card');
  }
  function step(delta: number) {
    if (!ready || busy || fileIndex < 0) return;
    const target = walkFiles[fileIndex + delta];
    if (target) go(target.filename);
  }
  function scrollFile(delta: number) {
    mainRef.current?.scrollBy?.(0, delta * 72);
  }
  function scrollFileHorizontally(delta: number) {
    if (wrapLines) return;
    mainRef.current?.querySelector<HTMLElement>('[data-diff-scroll]')?.scrollBy?.(delta * 72, 0);
  }
  function toggleWrapLines() {
    if (richDiffVisible) return;
    const next = !wrapLines;
    setWrapLines(next);
    writeReviewPreference(WRAP_LINES_KEY, next);
  }
  function chooseSplit(next: boolean) {
    setSplitDiff(next);
    writeReviewPreference(SPLIT_DIFF_KEY, next);
  }
  function toggleContext() {
    const next = !contextOpen;
    setContextOpen(next);
    writeReviewPreference(CONTEXT_OPEN_KEY, next);
  }
  function openContext(tab: ContextTab) {
    setContextTab(tab);
    if (!contextOpen) toggleContext();
  }
  function chooseScope(next: Scope) {
    setScope(next);
    if (next === 'since' && changed && doc.step && !changed.has(doc.step)) {
      go(files.find((f) => changed.has(f.filename))?.filename ?? null);
    }
  }
  /** Marks the current file and moves to the next file not reviewed yet. */
  function markAndNext() {
    if (!ready || !prFile || busy) return;
    const done = new Set([...doc.reviewed, prFile.filename]);
    update((d) => ({ ...d, reviewed: [...new Set([...d.reviewed, prFile.filename])] }));
    const next =
      walkFiles.slice(fileIndex + 1).find((f) => !done.has(f.filename)) ??
      walkFiles.find((f) => !done.has(f.filename));
    if (next) go(next.filename);
    else if (reviewProgress(paths, [...done]).left === 0) focusDecision.current = true;
  }
  function toggleReviewed() {
    if (!ready || !prFile || busy) return;
    update((d) => ({
      ...d,
      reviewed: d.reviewed.includes(prFile.filename)
        ? d.reviewed.filter((p) => p !== prFile.filename)
        : [...d.reviewed, prFile.filename],
    }));
  }
  function skipGenerated() {
    if (!ready || busy) return;
    update((d) => markGeneratedReviewed(d, paths));
  }
  /** Approves with Undo: the deck moves on now, GitHub hears of it when the toast runs out. */
  function approve(autoMerge = !detail.autoMergeEnabled) {
    if (busy || approveIssue) return;
    const send = prepare('APPROVE', autoMerge);
    if (send) holdApproval(pr, send, autoMerge && !detail.autoMergeEnabled);
  }
  function later() {
    if (busy) return;
    useQuickReviewStore.getState().advance('skipped');
  }
  function submitComposed() {
    if (busy || submitIssue) return;
    if (doc.event === 'APPROVE') {
      const send = prepare();
      if (send) holdApproval(pr, send, false);
      return;
    }
    void submit();
  }
  /** Request changes or Comment from the decision bar: both need something to say. */
  function decide(event: Exclude<ReviewEvent, 'APPROVE'>) {
    if (busy) return;
    const issue = issueFor(event);
    if (issue) {
      setEndNotice(issue);
      endBodyRef.current?.focus();
      return;
    }
    setEndNotice('');
    void submit(event);
  }
  function jumpTo(comment: ReviewCommentDraft) {
    if (sinceScoped && !changed?.has(comment.path)) setScope('all');
    go(comment.path);
  }

  const keymap: QuickReviewKeymap | undefined = closing
    ? undefined
    : mode === 'walk'
      ? {
          v: markAndNext,
          n: () => step(1),
          j: () => scrollFile(1),
          p: () => step(-1),
          k: () => scrollFile(-1),
          h: () => scrollFileHorizontally(-1),
          l: () => scrollFileHorizontally(1),
          w: toggleWrapLines,
          d: () => setDescribing((v) => !v),
          ']': toggleContext,
          '1': () => openContext('proof'),
          '2': () => openContext('checks'),
          '3': () => openContext('work'),
          '4': () => openContext('comments'),
          z: undoHeldApproval,
          ...(changed ? { s: () => chooseScope(scope === 'since' ? 'all' : 'since') } : {}),
          ...(allReviewed
            ? {
                a: () => approve(false),
                Enter: () => approve(),
                r: () => decide('REQUEST_CHANGES'),
                c: () => decide('COMMENT'),
              }
            : {}),
          Escape: toCard,
        }
      : mode === 'compose'
        ? { Escape: toCard }
        : {
            ArrowRight: () => approve(),
            ArrowLeft: later,
            Enter: openWalk,
            a: () => approve(),
            w: () => setMode('compose'),
            z: undoHeldApproval,
            Escape: onClose,
          };
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
          setScope('all');
          go(paths.includes(comment.path) ? comment.path : (paths[0] ?? null));
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
  async function askForProof(commit: string) {
    if (!client || !detail.headSha) return;
    try {
      await postComment(
        client,
        detail.repoOwner,
        detail.repoName,
        detail.number,
        `@${detail.authorLogin} could you post fresh proof for ${detail.headSha.slice(0, 7)}? The latest proof is for ${commit.slice(0, 7)}.`,
      );
      setNotice('Asked the author for fresh proof.');
      conversation.reload();
    } catch (err) {
      toastError('Could not ask for fresh proof', err);
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
      ? `Continue reviewing · ${progress.left} left`
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
          variant="primary"
          size="lg"
          className="qr-files-btn"
          aria-keyshortcuts="Enter"
          disabled={!ready || files.length === 0}
          onClick={openWalk}
        >
          {filesLabel}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="qr-write"
          aria-keyshortcuts="W"
          onClick={() => setMode('compose')}
        >
          Write review{doc.comments.length ? ` · ${doc.comments.length}` : ''}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="qr-later"
          aria-keyshortcuts="ArrowLeft"
          onClick={later}
        >
          Review later
        </Button>
        <div className="qr-approval-actions" role="group" aria-label="Approval actions">
          <ApproveButton
            issue={approveIssue}
            busy={busy}
            onApprove={() => approve(false)}
            shortcut={!!detail.autoMergeEnabled}
            reasonId={approveReasonId}
          />
          {!detail.autoMergeEnabled && (
            <ApproveButton
              issue={approveIssue}
              busy={busy}
              onApprove={() => approve(true)}
              label="Approve & auto merge"
              reasonId={approveReasonId}
            />
          )}
        </div>
      </>
    );

  const walking = mode === 'walk';
  const generatedFile = prFile ? isGeneratedPath(prFile.filename) : false;
  const folder = file?.filename.includes('/')
    ? file.filename.slice(0, file.filename.lastIndexOf('/'))
    : '';
  const fileDrafts = doc.comments.filter((c) => c.path === file?.filename);
  /**
   * Drafts sit on their lines only in the unified PR diff: the split view
   * cannot take them, and the interdiff numbers lines of the reviewed commit,
   * which GitHub would not accept as anchors on the PR.
   */
  const inlineDrafts = !splitDiff && !sinceFile;
  const autoMergeLabel = detail.autoMergeEnabled ? 'approve' : 'approve & auto-merge';
  const walkShortcuts: Array<readonly [string, string]> = allReviewed
    ? [
        ['Enter', autoMergeLabel],
        ...(detail.autoMergeEnabled ? [] : [['A', 'approve'] as const]),
        ['R', 'request changes'],
        ['C', 'comment'],
        ['N/P', 'file'],
        ['Esc', 'overview'],
      ]
    : [
        ...(wrapLines || richDiffVisible ? [] : [['H/L', 'scroll horizontally'] as const]),
        ['J/K', 'scroll'],
        ['N/P', 'file'],
        ['V', 'mark & next'],
        ['D', 'description'],
        [']', 'context panel'],
        ['1–4', 'panel tab'],
        ...(richDiffVisible ? [] : [['W', 'wrap lines'] as const]),
        ...(changed ? [['S', 'since my review / all'] as const] : []),
        ['Esc', 'overview'],
      ];
  const shortcuts: Array<readonly [string, string]> = [
    ...(walking
      ? walkShortcuts
      : mode === 'compose'
        ? [['Esc', 'back to the card'] as const]
        : [
            ['A/→', detail.autoMergeEnabled ? 'approve' : 'approve & auto merge'] as const,
            ['W', 'write review'] as const,
            ['←', 'review later'] as const,
            ['Enter', 'review files'] as const,
            ['Esc', 'close'] as const,
          ]),
    ...(heldApproval ? [['Z', 'undo approval'] as const] : []),
  ];

  const contextContent: Record<ContextTab, ReactNode> = {
    proof: (
      <QuickReviewProof
        pr={detail}
        proofs={proofs}
        conversation={conversation}
        since={since}
        onAskForProof={client ? (commit) => void askForProof(commit) : undefined}
      />
    ),
    checks: <ChecksTab pr={pr} detail={detail} />,
    work: links.workItemIds.length ? (
      <div className="qr-linked-items">
        {links.workItemIds.map((id) => (
          <LinkedWorkItemBadge key={id} workItemId={id} workItem={workItems.get(id)} />
        ))}
      </div>
    ) : (
      <p className="qr-muted">No linked work items.</p>
    ),
    comments: <QuickReviewDiscussion pr={detail} enabled conversation={conversation} />,
  };

  return (
    <fieldset className="qr-workspace" disabled={busy} aria-busy={busy} data-mode={mode}>
      {commentsPopup && (
        <DetailDialog title="PR comments" onClose={() => setCommentsPopup(false)}>
          <QuickReviewDiscussion pr={detail} enabled conversation={conversation} />
        </DetailDialog>
      )}
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
              onFileSelect={(path) => {
                if (sinceScoped && !changed?.has(path)) setScope('all');
                go(path);
                setMode('walk');
                update((doc) => ({ ...doc, walked: true }));
              }}
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
                <>
                  <Button variant="ghost" size="sm" onClick={() => setCommentsPopup(true)}>
                    All comments · {conversation.items.length}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void openGitHub()}>
                    Open in GitHub
                  </Button>
                </>
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
            data-context={contextOpen ? 'open' : 'rail'}
            aria-label="File walk"
            inert={walkPhase === 'closing'}
            aria-hidden={walkPhase === 'closing' || undefined}
          >
            <QuickReviewPrHeader
              pr={pr}
              detail={detail}
              workItemIds={links.workItemIds}
              workItems={workItems}
              commentCount={conversation.items.length}
              reReview={!!since}
              expanded={describing}
              onToggleDescription={() => setDescribing((v) => !v)}
              onOpenComments={() => openContext('comments')}
              onOpenGitHub={() => void openGitHub()}
            >
              {since && (
                <div className="qr-rereview">
                  <History size={14} strokeWidth={2.25} aria-hidden="true" />
                  <span>
                    You {reviewVerb(since.review.state)} {formatAgo(since.review.submittedAt)} at{' '}
                    <code>{since.review.commitId.slice(0, 7)}</code>.{' '}
                    {since.files ? (
                      <>
                        <b>
                          {since.commits} {since.commits === 1 ? 'commit' : 'commits'}
                        </b>{' '}
                        since, touching{' '}
                        <b>
                          {since.files.length} of {files.length}
                        </b>{' '}
                        files.
                      </>
                    ) : (
                      'The branch was rewritten since, so every file is shown.'
                    )}
                  </span>
                  {changed && (
                    <Seg2
                      size="sm"
                      ariaLabel="Files to review"
                      value={scope}
                      onChange={chooseScope}
                      options={[
                        { value: 'since', label: `Since my review · ${changed.size}` },
                        { value: 'all', label: `All files · ${files.length}` },
                      ]}
                    />
                  )}
                </div>
              )}
            </QuickReviewPrHeader>
            <QuickReviewNavigation
              document={doc}
              groups={walkGroups}
              currentPath={prFile?.filename ?? null}
              onNavigate={go}
              progress={walkProgress}
              changed={changed ?? undefined}
              unchanged={
                sinceScoped && since
                  ? {
                      count: files.length - walkFiles.length,
                      reviewedAgo: formatAgo(since.review.submittedAt),
                      onShowAll: () => chooseScope('all'),
                    }
                  : undefined
              }
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
                {file && prFile ? (
                  <>
                    <button
                      type="button"
                      className="qr-pane__path"
                      title={`${file.filename} · click to copy`}
                      onClick={() =>
                        void writeText(file.filename)
                          .then(() => setNotice('Copied the file path.'))
                          .catch(() => setNotice('Could not copy file path.'))
                      }
                    >
                      {folder && <span className="qr-pane__dir">{folder}</span>}
                      <b>
                        {folder ? '/' : ''}
                        {file.filename.split('/').pop()}
                      </b>
                    </button>
                    <span className="qr-muted qr-pane__delta">
                      <span className="qr-positive">+{file.additions}</span>{' '}
                      <span className="qr-negative">−{file.deletions}</span>
                    </span>
                    <span className="qr-muted qr-pane__count">
                      {fileIndex + 1} of {walkFiles.length}
                    </span>
                  </>
                ) : (
                  <span className="qr-muted">
                    {loading ? 'Loading changed files…' : 'No file selected.'}
                  </span>
                )}
                <span className="qr-spacer" />
                {!richDiffVisible && (
                  <Seg2
                    size="sm"
                    ariaLabel="Diff layout"
                    value={splitDiff ? 'split' : 'unified'}
                    onChange={(value) => chooseSplit(value === 'split')}
                    options={[
                      { value: 'unified', label: 'Unified' },
                      { value: 'split', label: 'Split' },
                    ]}
                  />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Wrap lines"
                  aria-pressed={wrapLines}
                  aria-keyshortcuts="W"
                  className="qr-wrap-lines"
                  disabled={richDiffVisible}
                  onClick={toggleWrapLines}
                >
                  Wrap
                </Button>
                {imageFile && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-pressed={richDiff}
                    className="qr-rich-diff"
                    onClick={() => {
                      setRichDiff(!richDiff);
                      writeReviewPreference(RICH_DIFF_KEY, !richDiff);
                    }}
                  >
                    Rich diff
                  </Button>
                )}
                {prFile && (
                  <label
                    className="qr-pane__check"
                    data-done={reviewed.has(prFile.filename) || undefined}
                  >
                    <input
                      type="checkbox"
                      checked={reviewed.has(prFile.filename)}
                      onChange={toggleReviewed}
                      disabled={!ready}
                    />
                    {reviewed.has(prFile.filename)
                      ? 'Reviewed'
                      : generatedFile
                        ? 'Generated, skippable'
                        : 'Mark reviewed'}
                  </label>
                )}
              </div>
              {sinceFile && since && (
                <div className="qr-interdiff">
                  <GitCommitHorizontal size={14} strokeWidth={2.25} aria-hidden="true" />
                  <span>
                    Showing <code>{since.review.commitId.slice(0, 7)}</code> →{' '}
                    <code>{detail.headSha?.slice(0, 7)}</code>
                    {since.latestMessage && <> · “{since.latestMessage}”</>}
                  </span>
                </div>
              )}
              <div
                className="qr-main"
                ref={mainRef}
                data-quick-review-content
                data-wrap-lines={wrapLines}
              >
                {file && (
                  <div key={file.filename} className="qr-diff">
                    <DiffFileSection
                      key={`${file.filename}:${doc.headSha}:${doc.baseSha}:${sinceFile ? 'since' : 'all'}`}
                      file={file}
                      header={false}
                      viewMode={splitDiff && !richDiffVisible ? 'split' : 'unified'}
                      richContent={
                        richDiffVisible ? (
                          <ImageDiff
                            key={`${file.filename}:${doc.headSha}:${doc.baseSha}`}
                            file={file}
                            owner={detail.repoOwner}
                            repo={detail.repoName}
                            baseSha={doc.baseSha}
                            headSha={doc.headSha}
                          />
                        ) : undefined
                      }
                      onCopyPath={(path) =>
                        void writeText(path).catch(() => setNotice('Could not copy file path.'))
                      }
                      onOpenInGitHub={() => void openGitHub()}
                      onAddComment={inlineDrafts && ready ? addComment : undefined}
                      renderLineAttachment={(line) => {
                        const anchor = inlineDrafts ? reviewLineAnchor(line) : null;
                        return anchor
                          ? commentsByLine.get(`${anchor.side}:${anchor.line}`)?.map(commentView)
                          : null;
                      }}
                    />
                    {!inlineDrafts && !richDiffVisible && fileDrafts.map(commentView)}
                    {allReviewed ? (
                      <QuickReviewEndCard
                        document={doc}
                        update={update}
                        last={fileIndex === walkFiles.length - 1}
                        notice={endNotice}
                        bodyRef={endBodyRef}
                        onJump={jumpTo}
                      />
                    ) : (
                      <p className="qr-notice qr-muted">
                        {richDiffVisible
                          ? 'Check both image revisions, then mark the file reviewed.'
                          : sinceFile
                            ? 'End of the changes since your review. Press S for the whole PR to comment on a line.'
                            : splitDiff
                              ? 'End of file. Switch to Unified to comment on a line.'
                              : 'End of file. Use + beside a line to add a draft comment.'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <QuickReviewContext
              open={contextOpen}
              tab={contextTab}
              onTab={openContext}
              onToggle={toggleContext}
              checks={checks}
              counts={{
                proof: proofCount(proofs),
                work: links.workItemIds.length,
                comments: conversation.items.length,
              }}
            >
              {contextContent[contextTab]}
            </QuickReviewContext>
            <QuickReviewDecisionBar
              progress={progress}
              draftCount={doc.comments.length}
              ready={ready}
              approveIssue={approveIssue}
              autoMergeEnabled={!!detail.autoMergeEnabled}
              canGoBack={fileIndex > 0}
              canGoOn={fileIndex >= 0 && fileIndex < walkFiles.length - 1}
              hasFile={!!prFile}
              onSkipGenerated={skipGenerated}
              onPrevious={() => step(-1)}
              onNext={() => step(1)}
              onMark={markAndNext}
              onApprove={(autoMerge) => approve(autoMerge)}
              onRequestChanges={() => decide('REQUEST_CHANGES')}
              onComment={() => decide('COMMENT')}
            />
          </section>
        )}
      </div>
      <footer className="qr-footer" data-walking={walking}>
        <Shortcuts keys={shortcuts} />
        <span className="qr-spacer" />
        <span role="status">
          {busy ? 'Submitting review…' : storageWarning || notice || 'Drafts saved on this device.'}
        </span>
      </footer>
    </fieldset>
  );
}
