import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { prRowKey } from '@/components/pr/pr-card-data';
import type { HeldPr } from '@/services/author-run';
import {
  normalizeReviewDocument,
  orderQuickReviewPrs,
  type ReviewDocument,
} from '@/services/quick-review';
import type { PullRequestWithChecks } from '@/types';
import { reviewDraftStorage } from '@/utils/review-draft-storage';

export type ReviewDecision = 'approved' | 'commented' | 'skipped';
export type QuickReviewState = 'idle' | 'reviewing' | 'submitting' | 'error' | 'complete';

export interface ReviewActivity {
  pr: PullRequestWithChecks;
  decision: ReviewDecision;
}

/** A session over one author's PRs, oldest first (`services/author-run.ts`). */
export interface AuthorRun {
  author: string;
  /** The author's PRs the run leaves out, and why. */
  held: HeldPr[];
  /** The rest of the run is still being worked out (E2E reports are read). */
  filling: boolean;
}

interface QuickReviewStoreState {
  state: QuickReviewState;
  queue: PullRequestWithChecks[];
  currentIndex: number;
  run: AuthorRun | null;
  /** Decision per PR, keyed `owner/repo#number` (`prRowKey`): numbers repeat across repos. */
  decisions: Map<string, ReviewDecision>;
  activity: Record<string, ReviewActivity>;
  forgetActivity: (pr: PullRequestWithChecks) => void;
  error: string | null;
  documents: Record<string, ReviewDocument>;
  updateDocument: (key: string, update: (doc: ReviewDocument) => ReviewDocument) => void;
  discardDocument: (key: string) => void;

  currentPr: () => PullRequestWithChecks | undefined;
  remaining: () => number;

  startSession: (prs: PullRequestWithChecks[]) => void;
  startSinglePr: (pr: PullRequestWithChecks) => void;
  /** Opens `first` at once as an author run; `fillRun` adds the rest when it is known. */
  startRun: (author: string, first: PullRequestWithChecks) => void;
  /** Appends `rest` to the run of `author`, if it is still open. */
  fillRun: (author: string, rest: PullRequestWithChecks[], held: HeldPr[]) => void;
  advance: (decision: ReviewDecision) => void;
  goBack: () => void;
  /**
   * Back to `pr` with its decision undone: an approval taken back with Undo,
   * or one GitHub refused (`error`). Starts a session for it when none is open.
   */
  reopen: (pr: PullRequestWithChecks, error?: string) => void;
  setSubmitting: () => void;
  setError: (error: string) => void;
  clearError: () => void;
  endSession: () => void;
}

export const useQuickReviewStore = create<QuickReviewStoreState>()(
  persist(
    (set, get) => ({
      state: 'idle',
      queue: [],
      currentIndex: 0,
      run: null,
      decisions: new Map(),
      activity: {},
      forgetActivity: (pr) =>
        set((s) => {
          const activity = { ...s.activity };
          delete activity[prRowKey(pr.pullRequest)];
          return { activity };
        }),
      error: null,
      documents: {},
      updateDocument: (key, update) =>
        set((s) => ({
          documents: { ...s.documents, [key]: update(normalizeReviewDocument(s.documents[key])) },
        })),
      discardDocument: (key) =>
        set((s) => {
          const documents = { ...s.documents };
          delete documents[key];
          return { documents };
        }),

      currentPr: () => {
        const { queue, currentIndex } = get();
        return queue[currentIndex];
      },

      remaining: () => {
        const { queue, currentIndex } = get();
        return Math.max(0, queue.length - currentIndex - 1);
      },

      startSession: (prs) => {
        if (prs.length === 0) return;
        set({
          state: 'reviewing',
          queue: orderQuickReviewPrs(prs),
          currentIndex: 0,
          run: null,
          decisions: new Map(),
          error: null,
        });
      },

      startSinglePr: (pr) => {
        set({
          state: 'reviewing',
          queue: [pr],
          currentIndex: 0,
          run: null,
          decisions: new Map(),
          error: null,
        });
      },

      startRun: (author, first) => {
        set({
          state: 'reviewing',
          queue: [first],
          currentIndex: 0,
          run: { author, held: [], filling: true },
          decisions: new Map(),
          error: null,
        });
      },

      fillRun: (author, rest, held) => {
        const { run, queue, state } = get();
        if (!run || run.author !== author || state === 'idle') return;
        const queued = new Set(queue.map((pr) => prRowKey(pr.pullRequest)));
        const added = rest.filter((pr) => !queued.has(prRowKey(pr.pullRequest)));
        set({
          queue: [...queue, ...added],
          run: { author, held, filling: false },
          // The first PR was decided before the rest was known: go on with it.
          ...(state === 'complete' && added.length > 0
            ? { state: 'reviewing' as const, currentIndex: queue.length }
            : {}),
        });
      },

      advance: (decision) => {
        const { queue, currentIndex, decisions } = get();
        const pr = queue[currentIndex];
        if (pr) {
          const next = new Map(decisions);
          next.set(prRowKey(pr.pullRequest), decision);
          const activity = { ...get().activity, [prRowKey(pr.pullRequest)]: { pr, decision } };

          if (currentIndex >= queue.length - 1) {
            set({ state: 'complete', decisions: next, activity, error: null });
          } else {
            set({
              state: 'reviewing',
              currentIndex: currentIndex + 1,
              decisions: next,
              activity,
              error: null,
            });
          }
        }
      },

      goBack: () => {
        const { currentIndex } = get();
        if (currentIndex > 0) {
          set({ currentIndex: currentIndex - 1, state: 'reviewing', error: null });
        }
      },

      reopen: (pr, error) => {
        get().forgetActivity(pr);
        const { queue, decisions } = get();
        const key = prRowKey(pr.pullRequest);
        const index = queue.findIndex((queued) => prRowKey(queued.pullRequest) === key);
        const next = new Map(decisions);
        next.delete(key);
        set({
          state: error ? 'error' : 'reviewing',
          error: error ?? null,
          ...(index >= 0
            ? { currentIndex: index, decisions: next }
            : { queue: [pr], currentIndex: 0, run: null, decisions: new Map() }),
        });
      },

      setSubmitting: () => set({ state: 'submitting', error: null }),

      setError: (error) => set({ state: 'error', error }),

      clearError: () => set({ state: 'reviewing', error: null }),

      endSession: () =>
        set({
          state: 'idle',
          queue: [],
          currentIndex: 0,
          run: null,
          decisions: new Map(),
          error: null,
        }),
    }),
    {
      name: 'borgdock:quick-review-drafts:v1',
      storage: createJSONStorage(() => reviewDraftStorage),
      partialize: (s) => ({ documents: s.documents }),
    },
  ),
);
