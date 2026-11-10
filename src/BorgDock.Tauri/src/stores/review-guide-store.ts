import { create } from 'zustand';
import { loadTabData, saveTabData } from '@/services/cache';
import { getPRCommits } from '@/services/github/pulls';
import { getClientForRepo } from '@/services/github/singleton';
import type { ReviewSnapshot } from '@/services/quick-review';
import {
  buildGuidePrompt,
  guideSkipReason,
  parseGuide,
  type ReviewGuide,
} from '@/services/review-guide';
import { runSummaryAgent } from '@/services/summary-agent';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequest } from '@/types';
import { parseError } from '@/utils/parse-error';

/** A guide reads the whole diff; agents that look around the checkout need a few minutes. */
const GUIDE_TIMEOUT_SECONDS = 300;

export type ReviewGuideEntry =
  /** None cached, and automatic guides are off (Settings → Summaries): waits for a click. */
  | { status: 'idle'; provider: string }
  /** A simple PR: no guide unless asked for. `reason` says what makes it simple. */
  | { status: 'skipped'; reason: string }
  | { status: 'loading'; provider: string }
  | { status: 'ready'; guide: ReviewGuide }
  | { status: 'error'; error: string };

interface ReviewGuideState {
  /** Keyed by `guideKey`: one guide per head commit. */
  entries: Record<string, ReviewGuideEntry>;
}

export const useReviewGuideStore = create<ReviewGuideState>(() => ({ entries: {} }));

export function guideKey(pr: PullRequest): string {
  return `${pr.repoOwner}/${pr.repoName}#${pr.number}@${pr.headSha ?? ''}`.toLowerCase();
}

/** Heads whose cached guide is being read, so a second call does not read it again. */
const checking = new Set<string>();

function setEntry(key: string, entry: ReviewGuideEntry) {
  useReviewGuideStore.setState((s) => ({ entries: { ...s.entries, [key]: entry } }));
}

function isGuide(value: unknown, headSha: string): value is ReviewGuide {
  const guide = value as ReviewGuide | null;
  return !!guide && guide.headSha === headSha && Array.isArray(guide.chapters);
}

async function commitLines(pr: PullRequest): Promise<string[]> {
  const client = getClientForRepo(pr.repoOwner, pr.repoName);
  if (!client) return [];
  try {
    const commits = await getPRCommits(client, pr.repoOwner, pr.repoName, pr.number);
    return commits.map((c) => c.message.split('\n')[0] ?? '').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * The guide the PR cache holds for this head commit, put in the store.
 * False when there is none, or when the store already has an entry.
 */
export async function recallReviewGuide(pr: PullRequest): Promise<boolean> {
  const headSha = pr.headSha ?? '';
  const key = guideKey(pr);
  if (!headSha || checking.has(key) || useReviewGuideStore.getState().entries[key]) return false;
  checking.add(key);
  const cached = await loadTabData<ReviewGuide>(
    pr.repoOwner,
    pr.repoName,
    pr.number,
    'reviewGuide',
  ).catch(() => null);
  checking.delete(key);
  if (cached?.prUpdatedAt !== headSha || !isGuide(cached.data, headSha)) return false;
  setEntry(key, { status: 'ready', guide: cached.data });
  return true;
}

/** Marks a PR as read without a guide, unless the store already says something about it. */
export function skipReviewGuide(pr: PullRequest, reason: string) {
  const key = guideKey(pr);
  if (!useReviewGuideStore.getState().entries[key]) setEntry(key, { status: 'skipped', reason });
}

/**
 * The review guide for the snapshot's head commit: from memory, then from
 * the PR cache, then written by the summary agent (Settings → Summaries).
 * Nobody asked for that last step, so it happens only when automatic guides
 * are on (`background`: the writer has its own setting) and the PR is not a
 * simple one (`guideSkipReason`). `force` writes it now: a click on Write,
 * Retry or Write again. One run per head commit at a time; a failed run
 * stays failed until `force`, so a broken CLI is not started on every render.
 */
export async function ensureReviewGuide(
  snapshot: ReviewSnapshot,
  { force = false, background = false }: { force?: boolean; background?: boolean } = {},
): Promise<void> {
  const pr = snapshot.pr;
  const headSha = pr.headSha ?? '';
  if (!headSha || snapshot.files.length === 0) return;
  const key = guideKey(pr);
  const current = useReviewGuideStore.getState().entries[key];
  if (current?.status === 'loading' || checking.has(key) || (current && !force)) return;

  const settings = useSettingsStore.getState().settings;
  const provider = settings.summaries?.provider ?? 'claude';
  if (!current) {
    if (await recallReviewGuide(pr)) return;
    if (!force && !background && settings.summaries?.autoReviewGuide === false) {
      setEntry(key, { status: 'idle', provider });
      return;
    }
    const simple = force ? null : guideSkipReason(pr, snapshot.files);
    if (simple) {
      setEntry(key, { status: 'skipped', reason: simple });
      return;
    }
  }
  setEntry(key, { status: 'loading', provider });
  try {
    const repoPath = settings.repos.find(
      (repo) =>
        repo.owner.toLowerCase() === pr.repoOwner.toLowerCase() &&
        repo.name.toLowerCase() === pr.repoName.toLowerCase(),
    )?.worktreeBasePath;
    const prompt = buildGuidePrompt({
      pr,
      files: snapshot.files,
      commits: await commitLines(pr),
      instructions: settings.summaries?.guideInstructions,
      skip: settings.summaries?.guideSkip,
    });
    const result = await runSummaryAgent(settings, {
      prompt,
      cwd: repoPath,
      timeoutSeconds: GUIDE_TIMEOUT_SECONDS,
    });
    const guide = parseGuide(
      result.text,
      snapshot.files.map((f) => f.filename),
      {
        headSha,
        provider: result.provider,
        model: result.model,
        durationMs: result.durationMs,
        createdAt: new Date().toISOString(),
      },
    );
    setEntry(key, { status: 'ready', guide });
    void saveTabData(pr.repoOwner, pr.repoName, pr.number, 'reviewGuide', guide, headSha);
  } catch (err) {
    setEntry(key, { status: 'error', error: parseError(err).message });
  }
}
