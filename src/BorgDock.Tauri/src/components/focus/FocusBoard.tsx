import clsx from 'clsx';
import {
  AlarmClock,
  ExternalLink,
  GitBranch,
  GitMerge,
  MessageSquareText,
  RotateCw,
  Sparkles,
} from 'lucide-react';
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { PrRowOverlays } from '@/components/pr/PrRowOverlays';
import {
  avatarInitials,
  checkCountsFor,
  ROW_CHIP_LABEL,
  rowChipFor,
  toPrCardData,
} from '@/components/pr/pr-card-data';
import {
  Avatar,
  Button,
  CheckBar,
  checkBarSummary,
  ProgressButton,
} from '@/components/shared/primitives';
import { usePrCardActions } from '@/hooks/usePrCardActions';
import { useProgressAction } from '@/hooks/useProgressAction';
import {
  bucketFor,
  FOCUS_BUCKET_LABEL,
  FOCUS_BUCKETS,
  type FocusBucket,
  type FocusBucketContext,
  focusKey,
  isSnoozed,
  startOfTomorrow,
  whyFor,
} from '@/services/focus-bucket';
import { showPr } from '@/services/navigation';
import { workbenchPrimaryAction } from '@/services/pr-action-resolver';
import { mergePrWithToast } from '@/services/pr-actions';
import { isFailing, isMyPr, isWaitingOnMe } from '@/services/pr-grouping';
import { openPrDetail } from '@/services/windows';
import { showToast } from '@/stores/toast-store';
import { useUiStore } from '@/stores/ui-store';
import type { PullRequestWithChecks } from '@/types';
import { EASE_OUT, FLIP_LEAVE_MS, flip, motionMs, motionOK } from '@/utils/motion';
import { BumpCount } from './BumpCount';

/** Cards `flip()` follows on the board. */
export const FOCUS_CARD_SELECTOR = '.bd-fb-card[data-key]';

/** How long a merged card shows "Merged" before it fades (the mockup's 600 ms). */
export const MERGED_HOLD_MS = 600;

const MIDDLE_BUTTON = 1;
const DAY = 24 * 60 * 60 * 1000;
const ICON = { size: 12, strokeWidth: 2.25, 'aria-hidden': true } as const;

/** The action row a card gets. */
export type FocusCardAction = 'merge' | 'fix' | 'review' | 'comments' | 'open';

/**
 * One action row per card (the mockup's Board): Merge and Open when it is
 * ready; Fix with Claude and Rerun for my failing PR; Review and Later for
 * a review waiting on me; Open comments and Checkout for changes or
 * comments on mine; Open otherwise. Stale cards are compact and have none.
 */
export function focusCardActionFor(
  pr: PullRequestWithChecks,
  bucket: FocusBucket,
  ctx: FocusBucketContext,
): FocusCardAction | null {
  if (bucket === 'stale') return null;
  // Review or Merge by the same rule as the Pull requests row's action.
  const primary = workbenchPrimaryAction(pr, ctx.username, ctx.teams);
  if (primary) return primary;
  const mine = isMyPr(pr, ctx.username);
  if (mine && isFailing(pr)) return 'fix';
  if (isWaitingOnMe(pr, ctx.username, ctx.teams)) return 'review';
  const review = pr.pullRequest.reviewStatus;
  if (mine && (review === 'changesRequested' || review === 'commented')) return 'comments';
  return 'open';
}

interface CardCallbacks {
  onMergeStart: (key: string) => void;
  onMergeEnd: (key: string, ok: boolean) => void;
  onLater: (pr: PullRequestWithChecks) => void;
  onUnsnooze: (pr: PullRequestWithChecks) => void;
}

interface FocusCardProps extends CardCallbacks {
  prWithChecks: PullRequestWithChecks;
  bucket: FocusBucket;
  ctx: FocusBucketContext;
}

function CardMergeButton({
  prWithChecks,
  onMergeStart,
  onMergeEnd,
}: Pick<FocusCardProps, 'prWithChecks' | 'onMergeStart' | 'onMergeEnd'>) {
  const p = prWithChecks.pullRequest;
  const key = focusKey(prWithChecks);
  const merge = useProgressAction(async () => {
    onMergeStart(key);
    const ok = await mergePrWithToast({
      repoOwner: p.repoOwner,
      repoName: p.repoName,
      number: p.number,
      title: p.title,
      htmlUrl: p.htmlUrl,
    });
    onMergeEnd(key, ok);
    return ok;
  }, 'Merge failed');
  return (
    <ProgressButton
      variant="primary"
      size="sm"
      leading={<GitMerge {...ICON} />}
      state={merge.state}
      onTrigger={() => void merge.trigger()}
      label="Merge"
      busyLabel="Merging"
      doneLabel="Merged"
      aria-label={`Merge #${p.number}`}
      data-card-action="merge"
    />
  );
}

function CardActions({
  kind,
  prWithChecks,
  ctx,
  actions,
  onMergeStart,
  onMergeEnd,
  onLater,
  onUnsnooze,
}: Omit<FocusCardProps, 'bucket'> & {
  kind: FocusCardAction;
  actions: ReturnType<typeof usePrCardActions>;
}) {
  const p = prWithChecks.pullRequest;
  const n = p.number;
  const openButton = (
    <Button
      variant="secondary"
      size="sm"
      trailing={<ExternalLink {...ICON} />}
      aria-label={`Open #${n} on GitHub`}
      title="Open on GitHub"
      data-card-action="open"
      onClick={actions.handleOpenInBrowser}
    >
      Open
    </Button>
  );
  let row: ReactNode;
  switch (kind) {
    case 'merge':
      row = (
        <>
          <CardMergeButton
            prWithChecks={prWithChecks}
            onMergeStart={onMergeStart}
            onMergeEnd={onMergeEnd}
          />
          {openButton}
        </>
      );
      break;
    case 'fix':
      row = (
        <>
          <Button
            variant="primary"
            size="sm"
            leading={<Sparkles {...ICON} />}
            aria-label={`Fix #${n} with Claude`}
            data-card-action="fix"
            onClick={actions.handleFix}
          >
            Fix with Claude
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leading={<RotateCw {...ICON} />}
            aria-label={`Rerun failed checks of #${n}`}
            data-card-action="rerun"
            onClick={actions.handleRerun}
          >
            Rerun
          </Button>
        </>
      );
      break;
    case 'review': {
      const snoozed = isSnoozed(prWithChecks, ctx);
      row = (
        <>
          <Button
            variant="primary"
            size="sm"
            leading={<MessageSquareText {...ICON} />}
            aria-label={`Review #${n}`}
            data-card-action="review"
            onClick={actions.handleReview}
          >
            Review
          </Button>
          {snoozed ? (
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Bring #${n} back to Needs you`}
              data-card-action="unsnooze"
              onClick={(e) => {
                e.stopPropagation();
                onUnsnooze(prWithChecks);
              }}
            >
              Bring back
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              leading={<AlarmClock {...ICON} />}
              aria-label={`Snooze #${n} until tomorrow`}
              data-card-action="later"
              onClick={(e) => {
                e.stopPropagation();
                onLater(prWithChecks);
              }}
            >
              Later
            </Button>
          )}
        </>
      );
      break;
    }
    case 'comments':
      row = (
        <>
          <Button
            variant="primary"
            size="sm"
            leading={<MessageSquareText {...ICON} />}
            aria-label={`Open the comments on #${n}`}
            data-card-action="comments"
            onClick={(e) => {
              e.stopPropagation();
              useUiStore.getState().selectPrKey(focusKey(prWithChecks), n);
              void showPr({
                owner: p.repoOwner,
                repo: p.repoName,
                number: n,
                tab: 'discussion',
                keepSection: true,
              });
            }}
          >
            Open comments
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leading={<GitBranch {...ICON} />}
            aria-label={`Check out ${p.headRef}`}
            data-card-action="checkout"
            onClick={actions.handleCheckout}
          >
            Checkout
          </Button>
        </>
      );
      break;
    case 'open':
      row = openButton;
      break;
  }
  return (
    <div className="bd-fb-card__acts" data-fb-action="">
      {row}
    </div>
  );
}

function ageInDays(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY));
}

/**
 * One Board card. Click (Enter / Space on its body) selects it and pushes
 * the detail view without leaving Focus; Ctrl/Cmd+click and middle-click
 * open the pop-out; right-click opens the PR context menu.
 */
export function FocusCard({ prWithChecks, bucket, ctx, ...callbacks }: FocusCardProps) {
  const pr = prWithChecks.pullRequest;
  const key = focusKey(prWithChecks);
  const selected = useUiStore((s) => s.selectedPrKey === key);
  const actions = usePrCardActions(prWithChecks);
  const mine = isMyPr(prWithChecks, ctx.username);
  const card = useMemo(() => toPrCardData(prWithChecks, mine), [prWithChecks, mine]);
  const chip = rowChipFor(card);
  const compact = bucket === 'stale';
  const kind = focusCardActionFor(prWithChecks, bucket, ctx);
  const { repoOwner: owner, repoName: repo, number } = pr;

  const open = useCallback(
    (popOut: boolean) => {
      useUiStore.getState().selectPrKey(key, number);
      if (popOut) void openPrDetail({ owner, repo, number });
      else void showPr({ owner, repo, number, keepSection: true });
    },
    [key, owner, repo, number],
  );

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest?.('[data-fb-action]')) return;
    open(e.ctrlKey || e.metaKey);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    open(e.ctrlKey || e.metaKey);
  };

  const checks = checkCountsFor(prWithChecks);

  return (
    <>
      <div
        className={clsx('bd-fb-card', compact && 'bd-fb-card--compact')}
        data-key={key}
        data-pr-key={key}
        data-pr-number={String(number)}
        data-pr-owner={owner}
        data-pr-repo={repo}
        data-bucket={bucket}
        data-selected={selected ? 'true' : undefined}
        onClick={handleClick}
        onAuxClick={(e) => {
          if (e.button !== MIDDLE_BUTTON) return;
          if ((e.target as HTMLElement).closest?.('[data-fb-action]')) return;
          e.preventDefault();
          open(true);
        }}
        onMouseDown={(e) => {
          if (e.button === MIDDLE_BUTTON) e.preventDefault();
        }}
        onContextMenu={actions.handleContextMenu}
      >
        <div
          className="bd-fb-card__main"
          role="button"
          tabIndex={0}
          aria-label={`${pr.title}, #${number}`}
          aria-current={selected ? 'true' : undefined}
          onKeyDown={handleKeyDown}
        >
          <div className="bd-fb-card__repo">
            <span>
              {repo} #{number}
            </span>
            {compact ? (
              <span className="bd-fb-card__age">{ageInDays(pr.updatedAt, ctx.now)} d</span>
            ) : (
              <span className={clsx('bd-wb-chip', `bd-wb-chip--${chip}`)} data-chip={chip}>
                {ROW_CHIP_LABEL[chip]}
              </span>
            )}
          </div>
          <div className="bd-fb-card__title" title={pr.title}>
            {pr.title}
          </div>
          {!compact && (
            <>
              <div className="bd-fb-card__why" data-focus-reason="">
                {whyFor(prWithChecks, ctx)}
              </div>
              <div className="bd-fb-card__foot">
                <Avatar
                  className="bd-fb-card__avatar"
                  initials={avatarInitials(pr.authorLogin)}
                  tone={mine ? 'own' : 'them'}
                  size="sm"
                  aria-hidden="true"
                />
                <span className="bd-fb-card__author">{pr.authorLogin}</span>
                <CheckBar
                  className="bd-fb-card__checks"
                  ok={checks.ok}
                  fail={checks.fail}
                  run={checks.run}
                  total={checks.total}
                  title={checkBarSummary(checks).label}
                />
              </div>
            </>
          )}
        </div>
        {kind && (
          <CardActions
            kind={kind}
            prWithChecks={prWithChecks}
            ctx={ctx}
            actions={actions}
            {...callbacks}
          />
        )}
      </div>
      <PrRowOverlays prWithChecks={prWithChecks} actions={actions} />
    </>
  );
}

/** The card element for `key` on the board, matched by `data-key` (keys hold `/` and `#`). */
function cardElement(board: HTMLElement | null, key: string): HTMLElement | null {
  if (!board) return null;
  for (const el of board.querySelectorAll<HTMLElement>(FOCUS_CARD_SELECTOR)) {
    if (el.dataset.key === key) return el;
  }
  return null;
}

/** A card kept in its old slot while it animates out (a merge, a snooze). */
interface HeldCard {
  pr: PullRequestWithChecks;
  bucket: FocusBucket;
  index: number;
}

type Columns = Record<FocusBucket, PullRequestWithChecks[]>;

function buildColumns(
  prs: readonly PullRequestWithChecks[],
  ctx: FocusBucketContext,
  held: ReadonlyMap<string, HeldCard>,
): Columns {
  const columns: Columns = { you: [], wait: [], ready: [], stale: [] };
  const current = new Map<string, PullRequestWithChecks>();
  for (const pr of prs) {
    const key = focusKey(pr);
    current.set(key, pr);
    if (held.has(key)) continue;
    columns[bucketFor(pr, ctx)].push(pr);
  }
  // A held card stays in its column and slot, even once the merge has
  // taken it off the open list, until its fade has run.
  for (const [key, card] of held) {
    const list = columns[card.bucket];
    list.splice(Math.min(card.index, list.length), 0, current.get(key) ?? card.pr);
  }
  return columns;
}

export interface FocusBoardProps {
  /** The Focus PRs in rank order; each column keeps that order. */
  prs: readonly PullRequestWithChecks[];
  ctx: FocusBucketContext;
  /**
   * Keys of the cards held on the board while their merge finishes. The
   * "Merged today" tally leaves them out, so it bumps when the card goes.
   */
  onHeldChange?: (keys: ReadonlySet<string>) => void;
}

/**
 * FocusBoard — Focus as four computed columns (plans/ui-overhaul-workbench.md,
 * phase 5; the iteration-2 mockup's "Board, without drag"): Needs you,
 * Waiting on others, Ready to merge, Stale. `bucketFor` places every card
 * and `whyFor` says why; nothing is dragged, the actions do the moving.
 *
 * - Merge fills its button, flips to "Merged", holds a beat, fades the card
 *   and the rest of the column FLIPs up; the head's tally bumps then.
 * - Later snoozes a review until tomorrow: the card fades and FLIPs into
 *   Waiting on others, with an Undo toast.
 * - Column counts bump when they change. Each column scrolls on its own.
 */
export function FocusBoard({ prs, ctx, onHeldChange }: FocusBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState<ReadonlyMap<string, HeldCard>>(() => new Map());
  const mounted = useRef(true);
  const timers = useRef(new Set<number>());

  useEffect(() => {
    mounted.current = true;
    const pending = timers.current;
    return () => {
      mounted.current = false;
      for (const id of pending) window.clearTimeout(id);
      pending.clear();
    };
  }, []);

  const columns = useMemo(() => buildColumns(prs, ctx, held), [prs, ctx, held]);
  // The latest columns for the callbacks, which run after awaits.
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  const heldKeys = useMemo(() => new Set(held.keys()), [held]);
  useEffect(() => {
    onHeldChange?.(heldKeys);
  }, [heldKeys, onHeldChange]);

  const release = useCallback((key: string) => {
    if (!mounted.current) return;
    void flip(
      boardRef.current,
      () =>
        flushSync(() =>
          setHeld((prev) => {
            if (!prev.has(key)) return prev;
            const next = new Map(prev);
            next.delete(key);
            return next;
          }),
        ),
      FOCUS_CARD_SELECTOR,
    );
  }, []);

  const onMergeStart = useCallback((key: string) => {
    const cols = columnsRef.current;
    for (const bucket of FOCUS_BUCKETS) {
      const index = cols[bucket].findIndex((pr) => focusKey(pr) === key);
      if (index < 0) continue;
      const pr = cols[bucket][index]!;
      setHeld((prev) => new Map(prev).set(key, { pr, bucket, index }));
      return;
    }
  }, []);

  const onMergeEnd = useCallback(
    (key: string, ok: boolean) => {
      if (!ok) {
        // The PR is still open: the card simply stays where it is.
        setHeld((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
        return;
      }
      const animate = motionOK();
      const id = window.setTimeout(
        () => {
          timers.current.delete(id);
          const el = cardElement(boardRef.current, key);
          if (!el || !animate || typeof el.animate !== 'function') {
            release(key);
            return;
          }
          const fade = el.animate(
            [
              { opacity: 1, transform: 'none' },
              { opacity: 0, transform: 'translateY(-8px) scale(0.98)' },
            ],
            { duration: motionMs('--motion-base', 200), easing: EASE_OUT, fill: 'forwards' },
          );
          fade.finished.then(
            () => release(key),
            () => release(key),
          );
        },
        animate ? MERGED_HOLD_MS : 0,
      );
      timers.current.add(id);
    },
    [release],
  );

  /**
   * Snooze or unsnooze a card: the store changes at once (so an Undo right
   * away cannot race it), while the card is held in its old slot for the
   * fade; then it is released and FLIPs to wherever `bucketFor` puts it now.
   */
  const moveCard = useCallback(
    (key: string, changeStore: () => void) => {
      const cols = columnsRef.current;
      const from = FOCUS_BUCKETS.find((b) => cols[b].some((pr) => focusKey(pr) === key));
      const card = cardElement(boardRef.current, key);
      if (!from || !card || !motionOK() || typeof card.animate !== 'function') {
        void flip(boardRef.current, () => flushSync(changeStore), FOCUS_CARD_SELECTOR);
        return;
      }
      const index = cols[from].findIndex((pr) => focusKey(pr) === key);
      const pr = cols[from][index]!;
      flushSync(() => {
        setHeld((prev) => new Map(prev).set(key, { pr, bucket: from, index }));
        changeStore();
      });
      const fade = card.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: FLIP_LEAVE_MS,
        easing: EASE_OUT,
        fill: 'forwards',
      });
      fade.finished.then(
        () => release(key),
        () => release(key),
      );
    },
    [release],
  );

  const onUnsnooze = useCallback(
    (pr: PullRequestWithChecks) => {
      const key = focusKey(pr);
      moveCard(key, () => useUiStore.getState().unsnoozeFocusPr(key));
    },
    [moveCard],
  );

  const onLater = useCallback(
    (pr: PullRequestWithChecks) => {
      const key = focusKey(pr);
      const until = startOfTomorrow(Date.now());
      moveCard(key, () => useUiStore.getState().snoozeFocusPr(key, until));
      showToast({
        message: `#${pr.pullRequest.number} snoozed until tomorrow`,
        actionLabel: 'Undo',
        onAction: () => {
          void flip(
            boardRef.current,
            () => flushSync(() => useUiStore.getState().unsnoozeFocusPr(key)),
            FOCUS_CARD_SELECTOR,
          );
        },
      });
    },
    [moveCard],
  );

  const callbacks: CardCallbacks = { onMergeStart, onMergeEnd, onLater, onUnsnooze };

  return (
    <div ref={boardRef} className="bd-fb-cols" data-focus-board="">
      {FOCUS_BUCKETS.map((bucket) => {
        const list = columns[bucket];
        return (
          <section
            key={bucket}
            className="bd-fb-col"
            data-col={bucket}
            aria-label={`${FOCUS_BUCKET_LABEL[bucket]}, ${list.length}`}
          >
            <header className="bd-fb-col__head">
              <i className="bd-focus-dot" aria-hidden="true" />
              <span className="bd-fb-col__label">{FOCUS_BUCKET_LABEL[bucket]}</span>
              {bucket === 'stale' && (
                <span className="bd-fb-col__hint">{ctx.staleAfterDays} d or more</span>
              )}
              <BumpCount value={list.length} className="bd-fb-col__count" />
            </header>
            <div className="bd-fb-col__stack">
              {list.length === 0 ? (
                <p className="bd-fb-col__empty">Nothing here right now.</p>
              ) : (
                list.map((pr) => (
                  <FocusCard
                    key={focusKey(pr)}
                    prWithChecks={pr}
                    bucket={bucket}
                    ctx={ctx}
                    {...callbacks}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
