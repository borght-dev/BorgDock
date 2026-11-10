import { dependencyBotOf } from '@/services/dependency-updates';
import { isGeneratedPath, type ReviewFileGroup, reviewFileCategory } from '@/services/quick-review';
import { classifyNoise } from '@/services/review-noise';
import type { DiffFile, PullRequest } from '@/types';
import { matchesAnyGlob } from '@/utils/glob';

/**
 * A reading order for a PR, written by the summary agent (Settings →
 * Summaries): what the PR does, then chapters that follow the change from
 * its foundation to the code that uses it, each with the files it covers and
 * why each file changed.
 */
export interface ReviewGuide {
  /** The head commit the guide describes. */
  headSha: string;
  /** What the PR does and why, in two or three sentences. */
  summary: string;
  chapters: ReviewChapter[];
  /** At most three things worth checking hardest. */
  focus: string[];
  provider: string;
  model: string;
  durationMs: number;
  createdAt: string;
}

export interface ReviewChapter {
  title: string;
  /** Why this part of the change exists, in one sentence. */
  intent: string;
  /** What to verify while reading it; empty when there is nothing special. */
  check: string;
  files: Array<{ path: string; why: string }>;
}

/** Chapter of the files the agent left out. */
export const OTHER_CHAPTER = 'Other changes';

/**
 * A PR with at most this many changed lines reads faster than its guide is
 * written. Of the first 33 guides, the four at or under 24 lines had nothing
 * to order; the next one up had 129.
 */
const SIMPLE_LINES = 60;

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Why this PR is read without a guide, or null when one is worth writing.
 * Without `files` it judges by the PR's own totals, which count generated
 * files too: null then means "read the files and ask again".
 */
export function guideSkipReason(pr: PullRequest, files?: readonly DiffFile[]): string | null {
  if (dependencyBotOf(pr.authorLogin)) return 'A dependency update';
  if (!files) {
    const lines = pr.additions + pr.deletions;
    return pr.changedFiles > 0 && lines <= SIMPLE_LINES
      ? `A small change: ${plural(lines, 'line')} in ${plural(pr.changedFiles, 'file')}`
      : null;
  }
  const noise = classifyNoise(files);
  const read = files.filter(
    (file) => !isGeneratedPath(file.filename) && !noise.get(file.filename)?.mechanical,
  );
  if (read.length === 0) return 'Only generated files and mechanical changes';
  const lines = read.reduce((sum, file) => sum + file.additions + file.deletions, 0);
  return lines <= SIMPLE_LINES
    ? `A small change: ${plural(lines, 'line')} in ${plural(read.length, 'file')}`
    : null;
}

/**
 * Prompt budget in characters. A patch longer than `FILE_BUDGET` is cut, and
 * once `PATCH_BUDGET` is spent the rest get `TAIL_BUDGET` each: the agent
 * still sees how every file starts.
 */
const PATCH_BUDGET = 160_000;
const FILE_BUDGET = 16_000;
const TAIL_BUDGET = 1_200;
const BODY_BUDGET = 6_000;
/** Source is worth the most budget, docs the least. */
const BUDGET_RANK = { source: 0, tests: 1, generated: 2, docs: 3 } as const;

/** How much of each patch goes in the prompt, spent on source first. Skipped files get none. */
function patchShares(
  files: readonly DiffFile[],
  skipped: ReadonlySet<string>,
): Map<string, number> {
  let budget = PATCH_BUDGET;
  const shares = new Map<string, number>();
  const ranked = [...files].sort(
    (a, b) =>
      BUDGET_RANK[reviewFileCategory(a.filename)] - BUDGET_RANK[reviewFileCategory(b.filename)],
  );
  for (const file of ranked) {
    if (!file.patch || isGeneratedPath(file.filename) || skipped.has(file.filename)) continue;
    const share = Math.min(file.patch.length, FILE_BUDGET, Math.max(budget, TAIL_BUDGET));
    shares.set(file.filename, share);
    budget -= share;
  }
  return shares;
}

export interface GuideInput {
  pr: PullRequest;
  files: readonly DiffFile[];
  /** First lines of the PR's commit messages, oldest first. */
  commits: readonly string[];
  /** The reviewer's own instructions (Settings → Summaries). */
  instructions?: string;
  /**
   * Path patterns of files the guide names but never reads (`*.html`): no
   * patch in the prompt, and the agent is told not to open them.
   */
  skip?: readonly string[];
  /** Where the repository is checked out on this machine; the agent may read it, and starts elsewhere. */
  checkout?: string;
}

/**
 * The prompt for the guide: the PR, its commits and its patches, and the JSON
 * shape to answer with. Each file gets a number (its place in `files`, from 1)
 * and the answer names files by that number: writing the answer is most of
 * the wait, and paths were a third of it.
 */
export function buildGuidePrompt({
  pr,
  files,
  commits,
  instructions = '',
  skip = [],
  checkout,
}: GuideInput): string {
  const skipped = new Set(
    files.filter((file) => matchesAnyGlob(file.filename, skip)).map((f) => f.filename),
  );
  const shares = patchShares(files, skipped);
  const parts = files.map((file, index) => {
    const head = `### [${index + 1}] ${file.filename} (${file.status}, +${file.additions} -${file.deletions})`;
    if (skipped.has(file.filename)) return `${head}\nSkipped by the reviewer: do not open it.`;
    if (isGeneratedPath(file.filename)) return `${head}\nGenerated or lockfile: patch left out.`;
    if (!file.patch) return `${head}\nNo patch (binary, renamed only, or too large).`;
    const share = shares.get(file.filename) ?? 0;
    const rest = file.patch.slice(share);
    const cut = rest ? `\n(cut here: ${rest.split('\n').length} more lines)` : '';
    return `${head}\n\`\`\`diff\n${file.patch.slice(0, share)}\n\`\`\`${cut}`;
  });
  const body = pr.body.trim()
    ? pr.body.length > BODY_BUDGET
      ? `${pr.body.slice(0, BODY_BUDGET)}\n…(cut)`
      : pr.body
    : 'No description.';
  return [
    'You write a review guide for a pull request. A reviewer reads the files in the order you choose, so the change makes sense from its foundation to the code that uses it.',
    checkout
      ? `Do not modify any files. The repository is checked out at ${checkout}: you may read files there for context, but it can be on another branch, and the diff below is the truth about this PR.`
      : 'Do not modify any files. There is no checkout to read: the diff below is all there is.',
    '',
    'Answer with JSON only, no prose and no code fence, in exactly this shape:',
    '{"summary": string, "chapters": [{"title": string, "intent": string, "check": string, "files": [[number, string]]}], "focus": [string]}',
    '',
    'Rules:',
    '- summary: two or three plain sentences: what the PR changes for its users and why.',
    '- chapters: 2 to 7 of them, in reading order. Start where the change begins (data, types, the core logic), end with its consumers. A file that only exists for another one sits right after it.',
    '- title: a few words naming what the chapter does ("Hook exposes hidden fields"). No numbering.',
    '- intent: one sentence, why this part exists.',
    '- check: one sentence on what a reviewer should verify in this chapter, or "" when nothing stands out.',
    '- files: every changed file below appears in exactly one chapter, as [number, why]. The number is the one in square brackets before its path; never write the path. Put tests in the chapter of the code they test, after that code. Generated files and lockfiles go in the chapter they belong to, last.',
    '- why: a short phrase, what changed in that file and why.',
    '- focus: up to three risks a reviewer must not miss, most important first; [] when the PR is routine.',
    '- Write plainly, no marketing words, no emoji.',
    ...(skipped.size
      ? [
          '- Files marked "Skipped by the reviewer" have no patch on purpose. Never open or read them; place them by their name and path alone.',
        ]
      : []),
    ...(instructions.trim()
      ? [
          '',
          "## The reviewer's instructions",
          'Follow these unless they conflict with the JSON shape or the rule that every file appears once.',
          instructions.trim(),
        ]
      : []),
    '',
    `# ${pr.title} (#${pr.number})`,
    `Branch: ${pr.headRef} → ${pr.baseRef}`,
    `Labels: ${pr.labels.join(', ') || 'none'}`,
    '',
    '## Description',
    body,
    '',
    '## Commits, oldest first',
    commits.length ? commits.map((c) => `- ${c}`).join('\n') : 'Unknown.',
    '',
    `## Changed files (${files.length})`,
    ...parts,
  ].join('\n');
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** The JSON object in an answer, also when the agent wrapped it in a fence or a sentence. */
function jsonOf(answer: string): unknown {
  const start = answer.indexOf('{');
  const end = answer.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The agent did not answer with a guide.');
  try {
    return JSON.parse(answer.slice(start, end + 1));
  } catch {
    throw new Error('The agent answered with a guide that is not valid JSON.');
  }
}

/**
 * The file an answer names: by its number in the prompt, or by path for an
 * agent that wrote one anyway: exact, then ignoring case, then the one
 * changed file that ends with it (agents drop leading folders).
 */
function resolver(paths: readonly string[]) {
  const exact = new Set(paths);
  const lower = new Map(paths.map((p) => [p.toLowerCase(), p]));
  return (named: unknown): string | null => {
    if (typeof named === 'number') return paths[named - 1] ?? null;
    const path = text(named).replace(/^\.?\//, '');
    if (!path) return null;
    if (exact.has(path)) return path;
    const folded = lower.get(path.toLowerCase());
    if (folded) return folded;
    if (/^\d+$/.test(path)) return paths[Number(path) - 1] ?? null;
    const tail = paths.filter((p) => p.toLowerCase().endsWith(`/${path.toLowerCase()}`));
    return tail.length === 1 ? tail[0]! : null;
  };
}

/** A chapter's file entry: `[number, why]`, or the older `{path, why}` and bare path. */
function fileEntry(item: unknown): { named: unknown; why: string } {
  if (Array.isArray(item)) return { named: item[0], why: text(item[1]) };
  if (item && typeof item === 'object') {
    const entry = item as Record<string, unknown>;
    return { named: entry.path, why: text(entry.why) };
  }
  return { named: item, why: '' };
}

/**
 * Reads the agent's answer into a guide over `paths`, in the order the
 * prompt numbered them: every changed file in exactly one chapter (the first
 * that names it), files it left out in a last "Other changes" chapter, files
 * it made up dropped. Throws when nothing usable is left.
 */
export function parseGuide(
  answer: string,
  paths: readonly string[],
  meta: Pick<ReviewGuide, 'headSha' | 'provider' | 'model' | 'durationMs' | 'createdAt'>,
): ReviewGuide {
  const raw = jsonOf(answer) as {
    summary?: unknown;
    chapters?: unknown;
    focus?: unknown;
  };
  const resolve = resolver(paths);
  const placed = new Set<string>();
  const chapters: ReviewChapter[] = [];
  for (const entry of Array.isArray(raw.chapters) ? raw.chapters : []) {
    const chapter = entry as Record<string, unknown>;
    const files: ReviewChapter['files'] = [];
    for (const item of Array.isArray(chapter.files) ? chapter.files : []) {
      const { named, why } = fileEntry(item);
      const path = resolve(named);
      if (!path || placed.has(path)) continue;
      placed.add(path);
      files.push({ path, why });
    }
    const title = text(chapter.title);
    if (!files.length || !title) continue;
    chapters.push({ title, intent: text(chapter.intent), check: text(chapter.check), files });
  }
  if (!chapters.length) throw new Error('The guide placed none of the changed files.');
  const left = paths.filter((p) => !placed.has(p));
  if (left.length)
    chapters.push({
      title: OTHER_CHAPTER,
      intent: 'Files the guide did not place.',
      check: '',
      files: left.map((path) => ({ path, why: '' })),
    });
  const focus = (Array.isArray(raw.focus) ? raw.focus : []).map(text).filter(Boolean).slice(0, 3);
  return { ...meta, summary: text(raw.summary), chapters, focus };
}

/** The guide as the walk's tree: one group per chapter, files in the guide's order. */
export function guideGroups(guide: ReviewGuide, files: readonly DiffFile[]): ReviewFileGroup[] {
  const byPath = new Map(files.map((f) => [f.filename, f]));
  return guide.chapters
    .map((chapter, i) => ({
      name: chapter.title,
      number: i + 1,
      note: chapter.intent,
      files: chapter.files.map((f) => byPath.get(f.path)).filter((f): f is DiffFile => !!f),
    }))
    .filter((group) => group.files.length > 0);
}

/** The chapter a file is in, with its number, and why the file changed. */
export function guideEntryFor(guide: ReviewGuide, path: string) {
  for (const [i, chapter] of guide.chapters.entries()) {
    const file = chapter.files.find((f) => f.path === path);
    if (file) return { chapter, number: i + 1, why: file.why };
  }
  return null;
}
