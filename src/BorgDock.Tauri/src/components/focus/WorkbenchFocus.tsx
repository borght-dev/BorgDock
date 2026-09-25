import clsx from 'clsx';
import { CircleCheck, Columns3, List } from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { prRowKey } from '@/components/pr/pr-card-data';
import { WorkbenchPrRow } from '@/components/pr/WorkbenchPrRow';
import { Button, SlidingHighlight } from '@/components/shared/primitives';
import {
  bucketFor,
  countBuckets,
  FOCUS_BUCKET_LABEL,
  FOCUS_BUCKETS,
  type FocusBucketContext,
  type FocusFilter,
  focusKey,
  focusSetOf,
  isSnoozed,
  mergedTodayKeys,
  staleAfterDaysOf,
  whyFor,
} from '@/services/focus-bucket';
import { explainZeroScore } from '@/services/focus-summary';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { myReviewRequestedAt, usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { FocusLayout, PullRequestWithChecks } from '@/types';
import { flip, motionMs, motionOK } from '@/utils/motion';
import { minuteNow } from '@/utils/relative-time';
import { BumpCount } from './BumpCount';
import { FocusBoard } from './FocusBoard';

/** Rows `flip()` follows in the Focus list. */
const FOCUS_ROW_SELECTOR = '[data-key]';

const NO_KEYS: ReadonlySet<string> = new Set();

/** The count strip's segments, in order; "Everything" sits apart on the right. */
const STRIP: ReadonlyArray<{ value: FocusFilter; label: string }> = [
  ...FOCUS_BUCKETS.map((b) => ({ value: b, label: FOCUS_BUCKET_LABEL[b] })),
  { value: 'all', label: 'Everything' },
];

interface FocusCountStripProps {
  value: FocusFilter;
  counts: Record<FocusFilter, number>;
  onChange: (filter: FocusFilter) => void;
}

/**
 * FocusCountStrip — Needs you / Waiting on others / Ready to merge / Stale
 * with their counts (the iteration-2 mockup's `.tl-sum`), and Everything to
 * reset. Clicking one filters the list; the tinted highlight slides to it.
 */
export function FocusCountStrip({ value, counts, onChange }: FocusCountStripProps) {
  return (
    <SlidingHighlight
      activeKey={value}
      className="bd-focus-strip"
      highlightClassName="bd-focus-strip__hl"
      data-active={value}
      role="group"
      aria-label="Filter Focus"
    >
      {STRIP.map((s) => {
        const on = s.value === value;
        return (
          <button
            key={s.value}
            type="button"
            className={clsx('bd-focus-strip__item', on && 'bd-focus-strip__item--active')}
            data-highlight-key={s.value}
            data-focus-filter={s.value}
            aria-pressed={on}
            onClick={() => {
              if (!on) onChange(s.value);
            }}
          >
            {s.value !== 'all' && <i className="bd-focus-dot" aria-hidden="true" />}
            {s.label}
            <BumpCount value={counts[s.value]} className="bd-focus-strip__count" />
          </button>
        );
      })}
    </SlidingHighlight>
  );
}

const LAYOUTS: ReadonlyArray<{ value: FocusLayout; label: string; icon: typeof List }> = [
  { value: 'list', label: 'List', icon: List },
  { value: 'board', label: 'Board', icon: Columns3 },
];

/** List / Board, the same segmented control as the Pull requests filter. */
function FocusLayoutToggle({
  value,
  onChange,
}: {
  value: FocusLayout;
  onChange: (layout: FocusLayout) => void;
}) {
  return (
    <SlidingHighlight
      activeKey={value}
      className="bd-filter bd-focus-layout"
      role="group"
      aria-label="Focus layout"
    >
      {LAYOUTS.map(({ value: v, label, icon: Icon }) => {
        const on = v === value;
        return (
          <button
            key={v}
            type="button"
            className={clsx('bd-filter__item', on && 'bd-filter__item--active')}
            aria-pressed={on}
            data-highlight-key={v}
            data-focus-layout={v}
            onClick={() => {
              if (!on) onChange(v);
            }}
          >
            <Icon size={13} strokeWidth={2} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </SlidingHighlight>
  );
}

function setFocusLayout(layout: FocusLayout) {
  const store = useSettingsStore.getState();
  store.updateSettings({ ui: { ...store.settings.ui, focusLayout: layout } });
}

/** The Focus data: the PRs, the bucket context, the counts. */
function useFocusModel() {
  const { pullRequests, closed, username, teams, timestamps } = usePrStore(
    useShallow((s) => ({
      pullRequests: s.pullRequests,
      closed: s.closedPullRequests,
      username: s.username,
      teams: s.teams,
      timestamps: s.reviewRequestTimestamps,
    })),
  );
  const focusPrs = usePrStore((s) => s.focusPrs)();
  const staleSetting = useSettingsStore((s) => s.settings.ui?.staleAfterDays);
  const snoozes = useUiStore((s) => s.focusSnoozes);
  const now = minuteNow();
  const staleAfterDays = staleAfterDaysOf(staleSetting);

  const ctx = useMemo<FocusBucketContext>(
    () => ({
      username,
      teams,
      now,
      staleAfterDays,
      snoozedUntil: snoozes,
      reviewRequestedAt: (pr) => myReviewRequestedAt(pr, username, timestamps),
    }),
    [username, teams, now, staleAfterDays, snoozes, timestamps],
  );
  const prs = useMemo(
    () => focusSetOf(focusPrs, pullRequests, username, teams),
    [focusPrs, pullRequests, username, teams],
  );
  const counts = useMemo(() => countBuckets(prs, ctx), [prs, ctx]);
  return { pullRequests, closed, prs, ctx, counts, now };
}

/** "Why not the others?": the open PRs Focus leaves out, by reason. */
function excludedReasons(
  all: readonly PullRequestWithChecks[],
  shown: readonly PullRequestWithChecks[],
  username: string,
  teams: readonly string[],
): Array<{ reason: string; count: number }> {
  const inFocus = new Set(shown.map(focusKey));
  const reasons = new Map<string, number>();
  for (const pr of all) {
    if (inFocus.has(focusKey(pr))) continue;
    const reason = explainZeroScore(pr, username, teams);
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  return [...reasons.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

function FocusSummaryLine({
  shown,
  total,
  excluded,
}: {
  shown: number;
  total: number;
  excluded: Array<{ reason: string; count: number }>;
}) {
  const sentence =
    shown === total
      ? `Showing all ${total} open pull requests.`
      : `Showing ${shown} of ${total} open pull requests; the rest stay in Pull requests.`;
  return (
    <div className="bd-focus-summary__text">
      <span>{sentence}</span>
      {excluded.length > 0 && (
        <details className="bd-focus-summary__why">
          <summary>Why not the others?</summary>
          <ul>
            {excluded.map((item) => (
              <li key={item.reason}>
                {item.count} {item.reason.toLowerCase()}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function FocusEmpty({ filtered }: { filtered: boolean }) {
  return (
    <div className="bd-wb-empty" data-focus-empty="">
      <CircleCheck size={28} strokeWidth={1.5} aria-hidden="true" />
      <p>{filtered ? 'Nothing in this bucket right now.' : 'Nothing needs your attention.'}</p>
    </div>
  );
}

/** What a Focus row adds to the Workbench row: its reason, and "Bring back" when snoozed. */
interface RowExtras {
  why: string;
  repo: string;
  snoozed: boolean;
  meta: ReactNode;
  action: ReactNode | undefined;
}

interface FocusListPaneProps {
  prs: PullRequestWithChecks[];
  ctx: FocusBucketContext;
  counts: Record<FocusFilter, number>;
  now: number;
}

/**
 * List mode: the count strip, then the Focus PRs as Workbench rows (same
 * click, keys and action slot as the Pull requests list) with the reason in
 * the meta line. A filter change FLIPs the rows.
 */
function FocusListPane({ prs, ctx, counts, now }: FocusListPaneProps) {
  const filter = useUiStore((s) => s.focusFilter);
  const [requested, setRequested] = useState<FocusFilter | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const token = useRef(0);
  useEffect(
    () => () => {
      token.current++;
    },
    [],
  );

  const rows = filter === 'all' ? prs : prs.filter((pr) => bucketFor(pr, ctx) === filter);

  // "Bring back" on a snoozed row: unsnooze and FLIP (the row leaves a
  // Waiting filter). Read through a ref so the cached buttons stay stable.
  const bringBack = (key: string) => {
    void flip(
      listRef.current,
      () => flushSync(() => useUiStore.getState().unsnoozeFocusPr(key)),
      FOCUS_ROW_SELECTOR,
      { leaving: filter === 'wait' ? [key] : [] },
    );
  };
  const bringBackRef = useRef(bringBack);
  bringBackRef.current = bringBack;

  // The meta line and the extra action per row, reused while they read the
  // same, so the memoised rows only re-render when their own text changes.
  const cache = useRef(new Map<string, RowExtras>());
  const extrasFor = (pr: PullRequestWithChecks): RowExtras => {
    const key = prRowKey(pr.pullRequest);
    const why = whyFor(pr, ctx);
    const snoozed = isSnoozed(pr, ctx) && bucketFor(pr, ctx) === 'wait';
    const repo = pr.pullRequest.repoName;
    const hit = cache.current.get(key);
    if (hit && hit.why === why && hit.repo === repo && hit.snoozed === snoozed) return hit;
    const next: RowExtras = {
      why,
      repo,
      snoozed,
      meta: (
        <>
          <em>{repo}</em> · <span data-focus-reason="">{why}</span>
        </>
      ),
      action: snoozed ? (
        <Button
          variant="secondary"
          size="sm"
          aria-label={`Bring #${pr.pullRequest.number} back to Needs you`}
          data-row-action="unsnooze"
          onClick={(e) => {
            e.stopPropagation();
            bringBackRef.current(key);
          }}
        >
          Bring back
        </Button>
      ) : undefined,
    };
    cache.current.set(key, next);
    return next;
  };

  const handleChange = useCallback(
    (next: FocusFilter) => {
      const mine = ++token.current;
      const leaving = rows
        .filter((pr) => next !== 'all' && bucketFor(pr, ctx) !== next)
        .map((pr) => prRowKey(pr.pullRequest));
      setRequested(next);
      void flip(
        listRef.current,
        () => {
          if (mine !== token.current) return;
          flushSync(() => {
            useUiStore.getState().setFocusFilter(next);
            setRequested(null);
          });
        },
        FOCUS_ROW_SELECTOR,
        { leaving },
      );
    },
    [rows, ctx],
  );

  return (
    <>
      <FocusCountStrip value={requested ?? filter} counts={counts} onChange={handleChange} />
      <div ref={listRef} className="bd-wb-list bd-focus-list" data-density="comfortable">
        {rows.length === 0 ? (
          <FocusEmpty filtered={filter !== 'all'} />
        ) : (
          rows.map((pr) => {
            const extras = extrasFor(pr);
            return (
              <WorkbenchPrRow
                key={prRowKey(pr.pullRequest)}
                prWithChecks={pr}
                density="comfortable"
                now={now}
                keepSection
                meta={extras.meta}
                extraAction={extras.action}
              />
            );
          })
        )}
      </div>
    </>
  );
}

/**
 * WorkbenchFocus — the Focus section of the Workbench layout (`ui.layoutV3`;
 * plans/ui-overhaul-workbench.md, phase 5).
 *
 * - Head row: "Focus", the "Merged today" tally, and the List / Board toggle
 *   (`ui.focusLayout`).
 * - One sentence on what Focus shows ("Showing N of M"), "Why not the
 *   others?", and Start Quick Review.
 * - List: the count strip and the ranked rows with a reason each. Board:
 *   four computed columns (`FocusBoard`). Switching crossfades the two over
 *   `--motion-base`; under reduced motion the swap is instant.
 */
export function WorkbenchFocus() {
  const layout = useSettingsStore((s) => s.settings.ui?.focusLayout ?? 'list');
  const { pullRequests, closed, prs, ctx, counts, now } = useFocusModel();
  const needsMyReview = usePrStore((s) => s.needsMyReview)();
  const startSession = useQuickReviewStore((s) => s.startSession);
  const dismissBadge = useOnboardingStore((s) => s.dismissBadge);
  const [heldKeys, setHeldKeys] = useState<ReadonlySet<string>>(NO_KEYS);

  useEffect(() => {
    dismissBadge('focus-mode');
  }, [dismissBadge]);

  // Crossfade List ↔ Board, like SectionView does between sections.
  const [leaving, setLeaving] = useState<FocusLayout | null>(null);
  const previous = useRef(layout);
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = layout;
    if (before === layout) return;
    if (!motionOK()) {
      setLeaving(null);
      return;
    }
    setLeaving(before);
    const timer = window.setTimeout(() => setLeaving(null), motionMs('--motion-base', 260));
    return () => window.clearTimeout(timer);
  }, [layout]);
  const outgoing = leaving !== null && leaving !== layout ? leaving : null;

  const excluded = useMemo(
    () => excludedReasons(pullRequests, prs, ctx.username, ctx.teams ?? []),
    [pullRequests, prs, ctx],
  );
  // A card still fading out after its merge is not counted yet: the tally
  // bumps when the card leaves the board.
  const held = layout === 'board' ? heldKeys : NO_KEYS;
  const mergedToday = mergedTodayKeys(closed, now, ctx.username).filter((k) => !held.has(k)).length;
  const queue = needsMyReview.length > 0 ? needsMyReview : prs;

  const pane = (which: FocusLayout, active: boolean) =>
    which === 'board' ? (
      <FocusBoard prs={prs} ctx={ctx} onHeldChange={active ? setHeldKeys : undefined} />
    ) : (
      <FocusListPane prs={prs} ctx={ctx} counts={counts} now={now} />
    );

  return (
    <div className="bd-wb-prs bd-focus-wb" data-focus-layout={layout}>
      <header className="bd-wb-head bd-focus-head">
        <h1 className="bd-wb-head__title">Focus</h1>
        <span className="bd-focus-done" data-merged-today={mergedToday}>
          Merged today
          <BumpCount value={mergedToday} className="bd-focus-done__count" />
        </span>
        <FocusLayoutToggle value={layout} onChange={setFocusLayout} />
      </header>
      <div className="bd-focus-summary">
        <FocusSummaryLine shown={prs.length} total={pullRequests.length} excluded={excluded} />
        {queue.length > 0 && (
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              dismissBadge('review-mode');
              startSession(queue);
            }}
          >
            Start Quick Review
          </Button>
        )}
      </div>
      <div className="bd-focus-body">
        {outgoing !== null && (
          <div
            key={outgoing}
            className={clsx(
              'bd-focus-pane',
              `bd-focus-pane--${outgoing}`,
              'bd-focus-pane--leaving',
            )}
            aria-hidden="true"
            inert
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget) setLeaving(null);
            }}
          >
            {pane(outgoing, false)}
          </div>
        )}
        <div
          key={layout}
          className={clsx(
            'bd-focus-pane',
            `bd-focus-pane--${layout}`,
            outgoing !== null && 'bd-focus-pane--entering',
          )}
        >
          {pane(layout, true)}
        </div>
      </div>
    </div>
  );
}
