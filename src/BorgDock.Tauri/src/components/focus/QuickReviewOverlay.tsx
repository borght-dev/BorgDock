import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { openUrl } from '@tauri-apps/plugin-opener';
import clsx from 'clsx';
import { FocusTrap } from 'focus-trap-react';
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  GitCommitHorizontal,
  History,
  Maximize2,
  Minimize2,
  UserRound,
  X,
} from 'lucide-react';
import {
  type CSSProperties,
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
import { usePrefetchReviewSnapshot } from '@/hooks/usePrefetchReviewSnapshot';
import { useQuickReviewDocument } from '@/hooks/useQuickReviewDocument';
import { type QuickReviewKeymap, useQuickReviewKeyboard } from '@/hooks/useQuickReviewKeyboard';
import { useResizableWidth } from '@/hooks/useResizableWidth';
import { useReviewCommits } from '@/hooks/useReviewCommits';
import { useReviewReadiness } from '@/hooks/useReviewReadiness';
import { useReviewSince } from '@/hooks/useReviewSince';
import { useRunFit } from '@/hooks/useRunFit';
import { useWorkItemLinks } from '@/hooks/useWorkItemLinks';
import { authorCandidates, type RunFit } from '@/services/author-run';
import { nextFromAuthor, readRunReports, startAuthorRun } from '@/services/author-run-session';
import { useE2eStore } from '@/services/e2e/load';
import { isImagePath } from '@/services/github/images';
import { postComment } from '@/services/github/mutations';
import { getClientForRepo } from '@/services/github/singleton';
import type { ApprovalMerge } from '@/services/pr-review';
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
import { guideEntryFor, guideGroups } from '@/services/review-guide';
import { classifyNoise } from '@/services/review-noise';
import { reviewVerb } from '@/services/review-since';
import type { RiskCitation, RiskReason } from '@/services/risk-assessment';
import { useCiFailuresStore } from '@/stores/ci-failures-store';
import { usePrStore } from '@/stores/pr-store';
import { type ReviewDecision, useQuickReviewStore } from '@/stores/quick-review-store';
import { ensureReviewGuide, guideKey, useReviewGuideStore } from '@/stores/review-guide-store';
import { ensureRiskAssessment, useRiskView } from '@/stores/risk-assessment-store';
import { toastError } from '@/stores/toast-store';
import type { DiffLine, PullRequest, PullRequestWithChecks } from '@/types';
import { motionMs, motionOK } from '@/utils/motion';
import { formatAgo } from '@/utils/relative-time';
import {
  getReviewDraftStorageWarning,
  subscribeReviewDraftStorage,
} from '@/utils/review-draft-storage';
import { ApproveButton, QuickReviewCard } from './QuickReviewCard';
import { QuickReviewChecks } from './QuickReviewChecks';
import { QuickReviewComment } from './QuickReviewComment';
import { CommitDiff, CommitHead, QuickReviewCommitList } from './QuickReviewCommits';
import { type ContextTab, QuickReviewContext } from './QuickReviewContext';
import { QuickReviewDecisionBar } from './QuickReviewDecisionBar';
import { QuickReviewDiscussion } from './QuickReviewDiscussion';
import { QuickReviewFinish } from './QuickReviewFinish';
import {
  ChapterStrip,
  QuickReviewGuideSection,
  type ReadingOrder,
  ReadingOrderSwitch,
} from './QuickReviewGuide';
import { QuickReviewNavigation } from './QuickReviewNavigation';
import { noiseFolds } from './QuickReviewNoise';
import { QuickReviewPrHeader } from './QuickReviewPrHeader';
import { proofCount, proofsFor, QuickReviewProof } from './QuickReviewProof';
import {
  QuickReviewRiskSection,
  RiskFileStrip,
  RiskLineMark,
  RiskPill,
  riskTagsByPath,
} from './QuickReviewRisk';
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
const TREE_WIDTH_KEY = 'borgdock-quick-review-tree-width';
const ORDER_KEY = 'borgdock-quick-review-order';
const ORDERS: readonly ReadingOrder[] = ['guide', 'folders', 'commits'];

function readOrder(): ReadingOrder {
  try {
    const value = localStorage.getItem(ORDER_KEY);
    return ORDERS.find((order) => order === value) ?? 'guide';
  } catch {
    return 'guide';
  }
}
/**
 * Below this window width the walk opens with its context panel folded to
 * the rail, so the diff keeps room for the file name and the code; the same
 * width as the narrow layout in quick-review.css.
 */
const NARROW_WALK = '(max-width: 1280px)';

function narrowWindow(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(NARROW_WALK).matches;
}

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
      <QuickReviewPrHeader pr={pr} detail={pr.pullRequest} />
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
  const activity = useQuickReviewStore((s) => s.activity);
  const run = useQuickReviewStore((s) => s.run);
  const needsMyReview = usePrStore((s) => s.needsMyReview());
  const prs = usePrStore((s) => s.pullRequests);
  const username = usePrStore((s) => s.username);
  const e2eEntries = useE2eStore((s) => s.entries);
  const ciGroups = useCiFailuresStore((s) => s.groups);
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
  const reviewedKeys = new Set([
    ...Object.keys(activity),
    ...handledInRun.current,
    ...queue.map(prKey),
  ]);
  const lastAuthor = queue.length === 1 ? queue[0]?.pullRequest.authorLogin : undefined;
  const continueAuthor = complete ? (run?.author ?? lastAuthor) : undefined;
  const nextPr = complete
    ? orderQuickReviewPrs(
        [...new Map([...needsMyReview, ...prs].map((pr) => [prKey(pr), pr])).values()].filter(
          (pr) =>
            (!continueAuthor ||
              pr.pullRequest.authorLogin.toLowerCase() !== continueAuthor.toLowerCase()) &&
            authorCandidates([pr], pr.pullRequest.authorLogin, username).length > 0 &&
            pr.pullRequest.mergeable !== false &&
            pr.pullRequest.reviewStatus !== 'changesRequested',
        ),
      ).find((pr) => !reviewedKeys.has(prKey(pr)))
    : undefined;
  const authorNext = continueAuthor
    ? nextFromAuthor(
        { prs, entries: e2eEntries, groups: ciGroups },
        continueAuthor,
        username,
        reviewedKeys,
      )
    : undefined;
  useEffect(() => {
    if (!continueAuthor) return;
    const { pullRequests, username: me } = usePrStore.getState();
    void readRunReports(authorCandidates(pullRequests, continueAuthor, me), pullRequests);
  }, [continueAuthor]);
  const upNext = complete ? undefined : queue[index + 1];
  const markHandled = () => {
    queue.forEach((pr) => {
      handledInRun.current.add(prKey(pr));
    });
  };
  const reviewNext = () => {
    if (!nextPr) return;
    markHandled();
    useQuickReviewStore.getState().startSinglePr(nextPr);
  };
  const reviewAuthorNext = () => {
    if (!authorNext) return;
    markHandled();
    void startAuthorRun(authorNext, new Set(handledInRun.current));
  };
  const preferAuthor =
    authorNext && (authorNext.overallStatus === 'green' || nextPr?.overallStatus !== 'green');
  const enterNext = preferAuthor ? reviewAuthorNext : nextPr ? reviewNext : undefined;
  useQuickReviewKeyboard(
    complete && !closing
      ? {
          Escape: requestClose,
          z: undoHeldApproval,
          ...(enterNext ? { Enter: enterNext } : {}),
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
            {run && (
              <span className="qr-run" title={`${run.author}'s open PRs, oldest first`}>
                <UserRound size={13} strokeWidth={2.25} aria-hidden="true" />
                {run.author} · oldest first
                {run.filling && <span className="qr-muted"> · finding the rest…</span>}
              </span>
            )}
            {upNext && (
              <span className="qr-upnext" title={upNext.pullRequest.title}>
                Up next{' '}
                <b>
                  #{upNext.pullRequest.number} {upNext.pullRequest.title}
                </b>
              </span>
            )}
            {queue.length > 1 && (
              <span className="qr-prog">
                <span>
                  PR {Math.min(index + 1, queue.length)} / {queue.length}
                </span>
                <span className="qr-bar" aria-hidden="true">
                  <i style={{ width: `${(decided / Math.max(queue.length, 1)) * 100}%` }} />
                </span>
              </span>
            )}
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
                        activity={Object.values(activity)}
                        nextPr={nextPr}
                        onNext={reviewNext}
                        authorNext={authorNext}
                        held={run?.held ?? []}
                        onAuthorNext={reviewAuthorNext}
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
                    ...(preferAuthor
                      ? [['Enter', `next from ${authorNext.pullRequest.authorLogin}`] as const]
                      : nextPr
                        ? [['Enter', 'review next PR'] as const]
                        : []),
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

/** The approve button that merges too, and what it does after the approval. */
export interface MergeOffer {
  intent: ApprovalMerge;
  label: string;
  /** Said in the Undo toast: "Approving #12 · auto-merge on". */
  followUp: string;
  /** Why merging past red checks is fine. */
  hint?: string;
}

/**
 * A PR red only from failures that are not its doing merges with admin
 * rights; otherwise auto-merge, unless it is already on.
 */
export function mergeOfferFor(fit: RunFit, autoMergeEnabled: boolean): MergeOffer | null {
  if (fit.kind === 'ready' && fit.bypass)
    return {
      intent: 'bypass',
      label: 'Approve & merge',
      followUp: 'then merges as admin',
      hint: `${fit.bypass}. Merges with admin rights, past the failing checks.`,
    };
  if (autoMergeEnabled) return null;
  return { intent: 'auto', label: 'Approve & auto-merge', followUp: 'auto-merge on' };
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
  const [contextOpen, setContextOpen] = useState(
    () => !narrowWindow() && readReviewPreference(CONTEXT_OPEN_KEY, true),
  );
  const [contextTab, setContextTab] = useState<ContextTab>('proof');
  const [describing, setDescribing] = useState(false);
  const [scope, setScope] = useState<Scope>('since');
  const [order, setOrder] = useState<ReadingOrder>(readOrder);
  usePrefetchReviewSnapshot(snapshot && !loading ? peeks[0]?.pullRequest : undefined, {
    guide: order === 'guide',
    risk: true,
  });
  const [commitSha, setCommitSha] = useState<string | null>(null);
  const [openedFolds, setOpenedFolds] = useState<ReadonlySet<string>>(() => new Set());
  const [reattachId, setReattachId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [endNotice, setEndNotice] = useState('');
  const [commentsPopup, setCommentsPopup] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const walkRef = useRef<HTMLElement>(null);
  const treeWidth = useResizableWidth(walkRef, {
    storageKey: TREE_WIDTH_KEY,
    defaultWidth: 262,
    minWidth: 200,
    maxWidth: 640,
    // The diff keeps 420px and the context panel its own column.
    reserve: contextOpen ? 760 : 470,
    label: 'File list width',
    measure: () => walkRef.current?.querySelector('.qr-tree')?.getBoundingClientRect().width,
  });
  const endBodyRef = useRef<HTMLTextAreaElement>(null);
  const lastMode = useRef<Mode>('card');
  const pendingWalk = useRef(startInWalk);
  const focusDecision = useRef(false);
  const sinceApplied = useRef(false);
  const approveReasonId = useId();
  const walkPhase = usePresence(mode === 'walk', motionMs('--motion-push', 260));

  const detail = snapshot?.pr ?? pr.pullRequest;
  const fit = useRunFit(pr);
  const mergeOffer = mergeOfferFor(fit, !!detail.autoMergeEnabled);
  const client = getClientForRepo(detail.repoOwner, detail.repoName);
  const conversation = usePrConversation(detail, true);
  const proofs = proofsFor(detail);
  const links = useWorkItemLinks(detail);
  const workItems = new Map(links.workItems.map((item) => [item.id, item]));
  const since = useReviewSince(snapshot);
  const changed = since?.files ? new Set(since.files.map((f) => f.filename)) : null;
  const sinceScoped = !!changed && scope === 'since';

  const files = snapshot?.files ?? [];
  const paths = files.map((f) => f.filename);
  const guideEntry = useReviewGuideStore((s) =>
    snapshot ? (s.entries[guideKey(snapshot.pr)] ?? null) : null,
  );
  const guide = guideEntry?.status === 'ready' ? guideEntry.guide : null;
  const guided = order === 'guide' && !!guide;
  const riskHead = snapshot?.pr.headSha ?? null;
  const riskView = useRiskView(detail, riskHead);
  /** The assessment on screen: this head's, or an older head's shown stale. */
  const riskShown =
    riskView.kind === 'ready'
      ? riskView.assessment
      : riskView.kind === 'waiting'
        ? null
        : riskView.previous;
  const riskStale = riskView.kind !== 'ready' && !!riskShown;
  const riskTags = riskTagsByPath(riskShown);
  /** The cited line "Open in walk" went to: highlighted and scrolled into view. `at` counts the opens. */
  const [riskTarget, setRiskTarget] = useState<{
    path: string;
    side: 'new' | 'old';
    from: number;
    at: number;
  } | null>(null);
  /** A reason the walk's strip asked the card to show. */
  const [riskFocus, setRiskFocus] = useState<{ id: string; at: number } | null>(null);
  const walkGroups = (guided ? guideGroups(guide, files) : (snapshot?.groups ?? []))
    .map((group) =>
      sinceScoped ? { ...group, files: group.files.filter((f) => changed.has(f.filename)) } : group,
    )
    .filter((group) => group.files.length > 0);
  const walkFiles = walkGroups.flatMap((group) => group.files);
  const noise = classifyNoise(files);
  const commitsView = order === 'commits';
  const reviewCommits = useReviewCommits(detail, commitsView, commitSha);
  const commitList = reviewCommits.commits?.status === 'ready' ? reviewCommits.commits.value : [];
  const commitIndex = commitList.findIndex((c) => c.sha === commitSha);
  const commit = commitList[commitIndex];
  const commitFiles = reviewCommits.files?.status === 'ready' ? reviewCommits.files.value : null;
  const commitsRead = new Set(doc.commitsRead ?? []);
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
  const fileNoise = file
    ? (sinceFile && since?.files ? classifyNoise(since.files) : noise).get(file.filename)
    : undefined;
  const chapter = guided && prFile ? guideEntryFor(guide, prFile.filename) : null;
  const imageFile = !!file && isImagePath(file.filename);
  const richDiffVisible = imageFile && richDiff && !commitsView;
  // Reasons whose cited lines end on a line of the shown diff; not on an
  // interdiff or an older head's assessment, whose line numbers differ.
  const riskMarks = new Map<string, RiskReason[]>();
  if (riskShown && !riskStale && file && !sinceFile) {
    for (const reason of riskShown.reasons) {
      const cited = [...reason.citations, reason.test?.citation];
      // Its removed lines sit beside the new ones: one mark under the new is enough.
      const citesNew = cited.some(
        (c) => c?.where === 'diff' && c.path === file.filename && c.side === 'new',
      );
      for (const citation of cited) {
        if (citation?.where !== 'diff' || citation.path !== file.filename) continue;
        if (citation.side === 'old' && citesNew) continue;
        const key = `${citation.side}:${citation.to}`;
        const list = riskMarks.get(key) ?? [];
        if (!list.includes(reason)) list.push(reason);
        riskMarks.set(key, list);
      }
    }
  }
  function riskMarksFor(line: DiffLine): RiskReason[] | null {
    if (!riskMarks.size) return null;
    const found = new Set([
      ...(line.type !== 'delete' && line.newLineNumber !== undefined
        ? (riskMarks.get(`new:${line.newLineNumber}`) ?? [])
        : []),
      ...(line.type !== 'add' && line.oldLineNumber !== undefined
        ? (riskMarks.get(`old:${line.oldLineNumber}`) ?? [])
        : []),
    ]);
    return found.size ? [...found] : null;
  }
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
    if (loadError) return "Files didn't load";
    if (!snapshot || loading) return 'Files are still loading';
    if (stale) return 'New changes: reload the files';
    if (progress.left > 0) return unreviewedLabel(progress.left);
    if (unreadyComments) return 'Unsaved or outdated drafts';
    if (detail.state.toLowerCase() !== 'open') return 'PR is not open';
    return null;
  }
  const approveIssue = approveBlocker();

  useEffect(() => onWalkingChange(mode === 'walk'), [mode, onWalkingChange]);

  // Guide order asks the summary agent for this head's guide; the card
  // shows it as soon as it is written.
  useEffect(() => {
    if (snapshot && order === 'guide') void ensureReviewGuide(snapshot);
  }, [snapshot, order]);

  // Every order gets this head's regression risk, simple PRs included.
  useEffect(() => {
    if (snapshot) void ensureRiskAssessment(snapshot);
  }, [snapshot]);

  // "Open in walk" puts the cited line in the middle of the diff.
  const riskTargetFile = file?.filename;
  useEffect(() => {
    if (!riskTarget || mode !== 'walk' || riskTargetFile !== riskTarget.path) return;
    const kind =
      riskTarget.side === 'old' ? '[data-line-kind="del"]' : ':not([data-line-kind="del"])';
    const frame = requestAnimationFrame(() => {
      mainRef.current
        ?.querySelector<HTMLElement>(`tr${kind}[data-line-no="${riskTarget.from}"]`)
        ?.scrollIntoView?.({ block: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [riskTarget, mode, riskTargetFile]);

  // A guide written while you read in folders reorders the tree: start it
  // at its first file not reviewed yet. A cached guide keeps your place.
  const guideStatus = guideEntry?.status;
  const lastGuideStatus = useRef(guideStatus);
  useEffect(() => {
    const written = lastGuideStatus.current === 'loading' && guideStatus === 'ready';
    lastGuideStatus.current = guideStatus;
    if (!written || order !== 'guide') return;
    const top = walkFiles.find((f) => !reviewed.has(f.filename)) ?? walkFiles[0];
    if (top && top.filename !== doc.step) go(top.filename);
  });

  // Commits order opens on the first commit not read yet.
  useEffect(() => {
    if (!commitList.length || commitList.some((c) => c.sha === commitSha)) return;
    setCommitSha((commitList.find((c) => !commitsRead.has(c.sha)) ?? commitList[0])?.sha ?? null);
  });

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
  function chooseOrder(next: ReadingOrder) {
    setOrder(next);
    try {
      localStorage.setItem(ORDER_KEY, next);
    } catch {
      // The order still changes for this session.
    }
    mainRef.current?.scrollTo?.(0, 0);
  }
  function cycleOrder() {
    chooseOrder(ORDERS[(ORDERS.indexOf(order) + 1) % ORDERS.length] ?? 'guide');
  }
  function writeGuide() {
    if (snapshot) void ensureReviewGuide(snapshot, { force: true });
  }
  function assessRisk() {
    if (snapshot) void ensureRiskAssessment(snapshot, { force: true });
  }
  /** Opens the walk at a changed file the risk cites, at the cited line when there is one. */
  function openRisk(path: string, target: { side: 'new' | 'old'; from: number } | null) {
    if (!ready || !paths.includes(path)) return;
    // Cited lines are the whole PR's: an interdiff numbers them differently.
    if (sinceScoped && (target || !changed?.has(path))) setScope('all');
    // Commits order shows commits, not the file.
    if (order === 'commits') setOrder('folders');
    go(path);
    setMode('walk');
    update((d) => ({ ...d, walked: true }));
    setRiskTarget((before) => (target ? { path, ...target, at: (before?.at ?? 0) + 1 } : null));
  }
  function openRiskCitation(citation: RiskCitation) {
    if (citation.where === 'description') return;
    openRisk(
      citation.path,
      citation.where === 'diff' ? { side: citation.side, from: citation.from } : null,
    );
  }
  function openRiskOnGitHub(citation: RiskCitation) {
    if (citation.where !== 'file' || !riskShown) return;
    const repository = detail.htmlUrl.replace(/\/pull\/\d+.*$/, '');
    const path = citation.path.split('/').map(encodeURIComponent).join('/');
    void openUrl(
      `${repository}/blob/${riskShown.headSha}/${path}#L${citation.from}-L${citation.to}`,
    ).catch(() => setNotice('Could not open GitHub.'));
  }
  function showRiskReason(id: string) {
    setRiskFocus((before) => ({ id, at: (before?.at ?? 0) + 1 }));
    toCard();
  }
  function toggleFold(key: string) {
    setOpenedFolds((before) => {
      const next = new Set(before);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }
  function goCommit(sha: string) {
    setCommitSha(sha);
    mainRef.current?.scrollTo?.(0, 0);
  }
  function stepCommit(delta: number) {
    const target = commitList[commitIndex + delta];
    if (target) goCommit(target.sha);
  }
  function toggleCommitRead(sha: string) {
    update((d) => {
      const read = d.commitsRead ?? [];
      return {
        ...d,
        commitsRead: read.includes(sha) ? read.filter((s) => s !== sha) : [...read, sha],
      };
    });
  }
  /** Marks the current commit read and moves to the next one not read yet. */
  function markCommitAndNext() {
    if (!commit) return;
    const done = new Set([...commitsRead, commit.sha]);
    update((d) => ({ ...d, commitsRead: [...new Set([...(d.commitsRead ?? []), commit.sha])] }));
    const next =
      commitList.slice(commitIndex + 1).find((c) => !done.has(c.sha)) ??
      commitList.find((c) => !done.has(c.sha));
    if (next) goCommit(next.sha);
  }
  /** Every commit was read, so every file was seen: mark them all reviewed. */
  function markAllFilesReviewed() {
    if (!ready || busy) return;
    update((d) => ({ ...d, reviewed: [...new Set([...d.reviewed, ...paths])] }));
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
  function toggleReviewed(path: string) {
    if (!ready || busy) return;
    update((d) => ({
      ...d,
      reviewed: d.reviewed.includes(path)
        ? d.reviewed.filter((p) => p !== path)
        : [...d.reviewed, path],
    }));
  }
  function skipGenerated() {
    if (!ready || busy) return;
    update((d) => markGeneratedReviewed(d, paths));
  }
  /** Approves with Undo: the deck moves on now, GitHub hears of it when the toast runs out. */
  /** Approves with Undo, and with `merging` goes on as `mergeOffer` says. */
  function approve(merging = !!mergeOffer) {
    if (busy || approveIssue) return;
    const offer = merging ? mergeOffer : null;
    const send = prepare('APPROVE', offer?.intent);
    if (send) holdApproval(pr, send, offer?.followUp ?? null);
  }
  function later() {
    if (busy) return;
    useQuickReviewStore.getState().advance('skipped');
  }
  function submitComposed() {
    if (busy || submitIssue) return;
    if (doc.event === 'APPROVE') {
      const send = prepare();
      if (send) holdApproval(pr, send, null);
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
          v: commitsView ? markCommitAndNext : markAndNext,
          n: () => (commitsView ? stepCommit(1) : step(1)),
          j: () => scrollFile(1),
          p: () => (commitsView ? stepCommit(-1) : step(-1)),
          o: cycleOrder,
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
            // Once Approve can go it is the card's next step, so Enter takes
            // it, as in the walk's decision bar.
            Enter: approveIssue ? openWalk : () => approve(),
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
    <div className="qr-warning" role="alert" data-tone={stale && !loadError ? undefined : 'error'}>
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
          variant={approveIssue ? 'primary' : 'secondary'}
          size="lg"
          className="qr-files-btn"
          aria-keyshortcuts={approveIssue ? 'Enter' : undefined}
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
            shortcut={!mergeOffer}
            reasonId={approveReasonId}
          />
          {mergeOffer && (
            <ApproveButton
              issue={approveIssue}
              busy={busy}
              onApprove={() => approve(true)}
              label={mergeOffer.label}
              hint={mergeOffer.hint}
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
  const autoMergeLabel = mergeOffer ? mergeOffer.label.toLowerCase() : 'approve';
  const walkShortcuts: Array<readonly [string, string]> = allReviewed
    ? [
        ['Enter', autoMergeLabel],
        ...(mergeOffer ? [['A', 'approve'] as const] : []),
        ['R', 'request changes'],
        ['C', 'comment'],
        ['N/P', commitsView ? 'commit' : 'file'],
        ['Esc', 'overview'],
      ]
    : [
        ...(wrapLines || richDiffVisible ? [] : [['H/L', 'scroll horizontally'] as const]),
        ['J/K', 'scroll'],
        ['N/P', commitsView ? 'commit' : 'file'],
        ['V', commitsView ? 'read & next' : 'mark & next'],
        ['O', 'reading order'],
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
            // While Approve is blocked its keys do nothing, so they are not offered.
            approveIssue
              ? (['Enter', 'review files'] as const)
              : (['Enter/A/→', autoMergeLabel] as const),
            ['W', 'write review'] as const,
            ['←', 'review later'] as const,
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
  const guideReason =
    guideEntry?.status === 'skipped'
      ? `${guideEntry.reason.charAt(0).toLowerCase()}${guideEntry.reason.slice(1)}`
      : null;
  const guideNote = guideReason
    ? `No guide (${guideReason}). ${riskView.kind === 'ready' ? 'Risk is assessed anyway.' : "Risk doesn't wait for one."}`
    : guideEntry?.status === 'ready'
      ? `Guide: ${guideEntry.guide.chapters.length} chapters`
      : null;
  const riskPill = <RiskPill view={riskView} />;
  const orderSwitch = (
    <ReadingOrderSwitch
      order={order}
      onChange={chooseOrder}
      guide={guideEntry}
      onWrite={writeGuide}
    />
  );

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
              filesFailed={!!loadError && !snapshot}
              onReloadFiles={reload}
              reviewed={doc.reviewed}
              alert={alert}
              risk={{
                pill: riskPill,
                section: (
                  <QuickReviewRiskSection
                    key={riskShown ? `${riskShown.headSha}:${riskShown.createdAt}` : 'none'}
                    view={riskView}
                    head={riskHead}
                    files={ready ? paths : null}
                    guideNote={guideNote}
                    onAssess={assessRisk}
                    onOpenCitation={ready ? openRiskCitation : undefined}
                    onOpenFile={ready ? (path) => openRisk(path, null) : undefined}
                    onOpenOnGitHub={openRiskOnGitHub}
                    focus={riskFocus}
                  />
                ),
              }}
              guide={
                order === 'guide' ? (
                  <QuickReviewGuideSection
                    entry={guideEntry}
                    onOpenFile={
                      ready
                        ? (path) => {
                            if (sinceScoped && !changed?.has(path)) setScope('all');
                            go(path);
                            setMode('walk');
                            update((d) => ({ ...d, walked: true }));
                          }
                        : undefined
                    }
                    onWrite={writeGuide}
                  />
                ) : undefined
              }
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
              commentCount={conversation.items.length}
              reReview={!!since}
              onOpenComments={() => setCommentsPopup(true)}
              onOpenGitHub={() => void openGitHub()}
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
            data-resizing={treeWidth.resizing || undefined}
            style={
              treeWidth.chosen
                ? ({ '--qr-tree-width': `${treeWidth.width}px` } as CSSProperties)
                : undefined
            }
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
              risk={riskPill}
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
            <div className="qr-tree-divider" {...treeWidth.separatorProps} />
            {commitsView ? (
              <QuickReviewCommitList
                header={orderSwitch}
                commits={reviewCommits.commits}
                currentSha={commitSha}
                read={commitsRead}
                onNavigate={goCommit}
                onToggleRead={toggleCommitRead}
                onRetry={reviewCommits.retry}
                filesLeft={progress.left}
                onMarkFiles={markAllFilesReviewed}
              />
            ) : (
              <QuickReviewNavigation
                header={orderSwitch}
                noise={noise}
                document={doc}
                groups={walkGroups}
                currentPath={prFile?.filename ?? null}
                onNavigate={go}
                onToggleReviewed={toggleReviewed}
                progress={walkProgress}
                riskTags={riskTags}
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
            )}
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
                {commitsView ? (
                  <span className="qr-muted qr-pane__count">
                    {commit
                      ? `Commit ${commitIndex + 1} of ${commitList.length}`
                      : reviewCommits.commits?.status === 'error'
                        ? "Commits didn't load."
                        : 'Loading commits…'}
                  </span>
                ) : file && prFile ? (
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
                {imageFile && !commitsView && (
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
                {prFile && !commitsView && (
                  <label
                    className="qr-pane__check"
                    data-done={reviewed.has(prFile.filename) || undefined}
                  >
                    <input
                      type="checkbox"
                      checked={reviewed.has(prFile.filename)}
                      onChange={() => toggleReviewed(prFile.filename)}
                      disabled={!ready}
                    />
                    {reviewed.has(prFile.filename)
                      ? 'Reviewed'
                      : generatedFile
                        ? 'Generated, skippable'
                        : fileNoise?.mechanical
                          ? `${fileNoise.label}, mark reviewed`
                          : 'Mark reviewed'}
                  </label>
                )}
              </div>
              {commitsView && commit && <CommitHead commit={commit} files={commitFiles} />}
              {!commitsView && chapter && (
                <ChapterStrip
                  number={chapter.number}
                  total={guide?.chapters.length ?? 0}
                  title={chapter.chapter.title}
                  intent={chapter.chapter.intent}
                  check={chapter.chapter.check}
                  why={chapter.why}
                />
              )}
              {!commitsView && prFile && riskShown && (
                <RiskFileStrip
                  assessment={riskShown}
                  path={prFile.filename}
                  stale={riskStale}
                  onShowReason={showRiskReason}
                />
              )}
              {!commitsView && sinceFile && since && (
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
                {commitsView ? (
                  <CommitDiff
                    load={reviewCommits.files}
                    commitSha={commit?.sha ?? null}
                    splitDiff={splitDiff}
                    openedFolds={openedFolds}
                    onToggleFold={toggleFold}
                    onRetry={reviewCommits.retry}
                    onCopyPath={(path) =>
                      void writeText(path).catch(() => setNotice('Could not copy file path.'))
                    }
                  />
                ) : (
                  file && (
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
                        hunkFolds={noiseFolds(
                          file,
                          fileNoise,
                          sinceFile ? 'since' : 'pr',
                          openedFolds,
                          toggleFold,
                          (hunk) =>
                            inlineDrafts &&
                            hunk.lines.some((line) => {
                              const anchor = reviewLineAnchor(line);
                              return (
                                !!anchor && commentsByLine.has(`${anchor.side}:${anchor.line}`)
                              );
                            }),
                        )}
                        highlightLine={
                          riskTarget &&
                          !sinceFile &&
                          riskTarget.side === 'new' &&
                          riskTarget.path === file.filename
                            ? riskTarget.from
                            : null
                        }
                        renderLineAttachment={(line) => {
                          const anchor = inlineDrafts ? reviewLineAnchor(line) : null;
                          const drafts = anchor
                            ? commentsByLine.get(`${anchor.side}:${anchor.line}`)
                            : undefined;
                          const marks = riskMarksFor(line);
                          if (!marks && !drafts?.length) return null;
                          return (
                            <>
                              {marks && <RiskLineMark reasons={marks} />}
                              {drafts?.map(commentView)}
                            </>
                          );
                        }}
                      />
                      {!inlineDrafts && !richDiffVisible && fileDrafts.map(commentView)}
                      {allReviewed ? (
                        <p className="qr-notice qr-notice--done">
                          <CircleCheck size={16} strokeWidth={2.25} aria-hidden="true" />
                          {fileIndex === walkFiles.length - 1
                            ? 'That was the last file.'
                            : 'Every file is reviewed.'}{' '}
                          <span className="qr-muted">Add an overall comment and decide below.</span>
                        </p>
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
                  )
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
              drafts={doc.comments}
              body={doc.body}
              onBodyChange={(body) => update((d) => ({ ...d, body }))}
              bodyRef={endBodyRef}
              notice={endNotice}
              onJump={jumpTo}
              ready={ready}
              approveIssue={approveIssue}
              merge={mergeOffer}
              unit={commitsView ? 'commit' : 'file'}
              canGoBack={commitsView ? commitIndex > 0 : fileIndex > 0}
              canGoOn={
                commitsView
                  ? commitIndex >= 0 && commitIndex < commitList.length - 1
                  : fileIndex >= 0 && fileIndex < walkFiles.length - 1
              }
              hasFile={commitsView ? !!commit : !!prFile}
              onSkipGenerated={skipGenerated}
              onPrevious={() => (commitsView ? stepCommit(-1) : step(-1))}
              onNext={() => (commitsView ? stepCommit(1) : step(1))}
              onMark={commitsView ? markCommitAndNext : markAndNext}
              onApprove={(merging) => approve(merging)}
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
