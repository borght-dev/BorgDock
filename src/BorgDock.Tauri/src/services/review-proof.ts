import type { ConversationEntry } from '@/hooks/usePrConversation';
import type { PullRequest } from '@/types';

export interface ProofImage {
  src: string;
  alt: string;
  browserUrl?: string;
}
/** A screen recording: a video GitHub plays on the PR page. */
export interface ProofRecording {
  src: string;
  label: string;
}
export interface ReviewProof {
  entry: ConversationEntry;
  images: ProofImage[];
  recordings: ProofRecording[];
  excerpt: string;
  commit?: string;
  freshness: 'current' | 'outdated' | 'unknown';
}

/**
 * A tool's footer a bot adds to every PR or comment, between its own markers
 * (`<!-- codesmith:footer -->` … `<!-- /codesmith:footer -->`). Never proof.
 */
const BOT_FOOTER = /<!--\s*([\w.-]+):footer\s*-->[\s\S]*?<!--\s*\/\1:footer\s*-->/gi;

export function withoutBotFooters(body: string): string {
  return body.replace(BOT_FOOTER, '');
}

/** Badges and buttons are linked images drawn at most this high, never screenshots. */
const BADGE_HEIGHT = 40;

function isBadge(image: Element): boolean {
  const height = Number(image.getAttribute('height'));
  return !!image.closest('a') && height > 0 && height <= BADGE_HEIGHT;
}

export function proofImages(markdown: string): ProofImage[] {
  const body = withoutBotFooters(markdown);
  const images: ProofImage[] = [];
  const doc = new DOMParser().parseFromString(body, 'text/html');
  for (const image of doc.querySelectorAll('img')) {
    const src = image.getAttribute('src') ?? '';
    if (/^https?:\/\//i.test(src) && !isBadge(image))
      images.push({ src, alt: image.getAttribute('alt') || 'Screenshot' });
  }
  for (const match of body.matchAll(
    /!\[([^\]]*)\]\(\s*<?(https?:\/\/[^\s)>]+)>?(?:\s+["'][^)]*)?\s*\)/gi,
  )) {
    images.push({ src: match[2]!, alt: match[1] || 'Screenshot' });
  }
  return images.filter(
    (image, index) => images.findIndex((other) => other.src === image.src) === index,
  );
}

const VIDEO_FILE = /\.(?:mp4|mov|webm|m4v)(?:[?#]\S*)?$/i;
/** An upload to a PR or comment; GitHub gives these no file extension. */
const GITHUB_UPLOAD =
  /^https:\/\/github\.com\/(?:user-attachments\/assets\/[\w-]+|[\w.-]+\/[\w.-]+\/assets\/\d+\/[\w-]+)$/i;

/**
 * The recordings in a description or comment: `<video>` elements, links to a
 * video file, and uploads on a line of their own. GitHub writes an uploaded
 * image as `![…](…)` and an uploaded video as its bare address.
 */
export function proofRecordings(markdown: string): ProofRecording[] {
  const body = withoutBotFooters(markdown);
  const found: string[] = [];
  const doc = new DOMParser().parseFromString(body, 'text/html');
  for (const video of doc.querySelectorAll('video[src], video source[src]')) {
    const src = video.getAttribute('src') ?? '';
    if (/^https?:\/\//i.test(src)) found.push(src);
  }
  for (const link of doc.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href') ?? '';
    if (/^https?:\/\//i.test(href) && VIDEO_FILE.test(href)) found.push(href);
  }
  for (const match of body.matchAll(/\[[^\]]*\]\(\s*<?(https?:\/\/[^\s)>]+)>?[^)]*\)/g)) {
    if (VIDEO_FILE.test(match[1]!)) found.push(match[1]!);
  }
  for (const match of body.matchAll(/^[ \t]*(https?:\/\/\S+)[ \t]*$/gm)) {
    if (VIDEO_FILE.test(match[1]!) || GITHUB_UPLOAD.test(match[1]!)) found.push(match[1]!);
  }
  const sources = found.filter((src, index) => found.indexOf(src) === index);
  return sources.map((src, index) => ({
    src,
    label: sources.length > 1 ? `Recording ${index + 1}` : 'Recording',
  }));
}

/** The first image or recording of the newest proof that has one, as its text orders them. */
export type FirstProofMedia =
  | { kind: 'image'; images: ProofImage[] }
  | { kind: 'recording'; recording: ProofRecording };

export function firstProofMedia(proofs: readonly ReviewProof[]): FirstProofMedia | null {
  const proof = proofs.find((p) => p.images.length > 0 || p.recordings.length > 0);
  if (!proof) return null;
  const image = proof.images[0];
  const recording = proof.recordings[0];
  if (!recording) return { kind: 'image', images: proof.images };
  if (!image) return { kind: 'recording', recording };
  const body = proof.entry.body ?? '';
  const at = (src: string) => {
    const index = body.indexOf(src);
    return index < 0 ? Number.POSITIVE_INFINITY : index;
  };
  return at(recording.src) < at(image.src)
    ? { kind: 'recording', recording }
    : { kind: 'image', images: proof.images };
}

export function reviewProofs(
  entries: readonly ConversationEntry[],
  headSha?: string,
): ReviewProof[] {
  return entries
    .flatMap((entry): ReviewProof[] => {
      const body = withoutBotFooters(entry.body ?? '');
      const source = withoutBotFooters(entry.sourceBody ?? body);
      const images = proofImages(body);
      const recordings = proofRecordings(body);
      const media = images.length + recordings.length;
      const text = `${source}\n${body}`;
      if (
        !/\b(proof|verification|verified|evidence)\b|\bvera\s+(cli|proof|verify)\b/i.test(text) &&
        !(media && (entry.id === 'description' || /\b(screenshots?|recordings?)\b/i.test(text)))
      )
        return [];
      const commits = [
        ...source.matchAll(
          /\b(?:commit|head(?:[_ -]?sha)?|sha)\b["'\s:*`=-]*([a-f0-9]{7,40})\b|\/commit\/([a-f0-9]{7,40})\b/gi,
        ),
      ].map((match) => (match[1] ?? match[2])!.toLowerCase());
      const unique = [...new Set(commits)];
      const commit = unique.length === 1 ? unique[0] : undefined;
      const matches =
        commit && headSha && /^[a-f0-9]{7,40}$/i.test(headSha)
          ? headSha.toLowerCase().startsWith(commit) || commit.startsWith(headSha.toLowerCase())
          : undefined;
      // The excerpt is what the proof says: images and headings ("## Proof") are left out.
      const doc = new DOMParser().parseFromString(
        body.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/^\s{0,3}#{1,6}\s.*$/gm, ''),
        'text/html',
      );
      for (const node of doc.querySelectorAll('script,style,h1,h2,h3,h4,h5,h6')) node.remove();
      for (const node of doc.querySelectorAll('p,div,li,br')) node.append(doc.createTextNode(' '));
      const excerpt = (doc.body.textContent ?? '')
        .replace(/[#*`]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300);
      return [
        {
          entry,
          images,
          recordings,
          excerpt,
          commit,
          freshness: matches === undefined ? 'unknown' : matches ? 'current' : 'outdated',
        },
      ];
    })
    .sort((a, b) => Date.parse(b.entry.createdAt) - Date.parse(a.entry.createdAt));
}

export interface ChecklistItem {
  text: string;
  done: boolean;
}

/** The task list items (`- [x] …`) of a PR description, in order. */
export function descriptionChecklist(body: string): ChecklistItem[] {
  return [...body.matchAll(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/gm)].map((match) => ({
    done: match[1] !== ' ',
    text: match[2]!.replace(/[*_`]/g, '').trim(),
  }));
}

const PROOF_HEADING =
  /\b(proof|verification|verified|evidence|screenshots?|before|after|test plan)\b/i;

/**
 * Description proof text and images, excluding the generated Claude footer.
 */
export function descriptionProof(
  pr: Pick<PullRequest, 'authorLogin' | 'body' | 'createdAt'>,
): ConversationEntry | null {
  const body = withoutBotFooters(pr.body).split(
    /^[ \t]*(?:\u{1f916}[ \t]*)?generated[ \t]+with[ \t]+\[?claude\b/imu,
  )[0]!;
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const heading = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line);
    return !!heading && PROOF_HEADING.test(heading[2]!);
  });
  const images = proofImages(body);
  const recordings = proofRecordings(body);
  if (start < 0 && !images.length && !recordings.length) return null;
  const level = start < 0 ? 0 : /^\s{0,3}(#{1,6})/.exec(lines[start]!)![1]!.length;
  const end = lines.findIndex((line, index) => {
    const heading = /^\s{0,3}(#{1,6})\s/.exec(line);
    return index > start && !!heading && heading[1]!.length <= level;
  });
  const section = start < 0 ? '' : lines.slice(start, end < 0 ? undefined : end).join('\n');
  const included = new Set(proofImages(section).map((image) => image.src));
  const extraImages = images
    .filter((image) => !included.has(image.src))
    .map(
      (image) =>
        `<img src="${image.src.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" alt="${image.alt.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`,
    )
    .join('\n');
  const includedRecordings = new Set(proofRecordings(section).map((recording) => recording.src));
  // A recording outside the proof section still counts; on its own line it reads as one.
  const extraRecordings = recordings
    .filter((recording) => !includedRecordings.has(recording.src))
    .map((recording) =>
      VIDEO_FILE.test(recording.src) || GITHUB_UPLOAD.test(recording.src)
        ? recording.src
        : `<video src="${recording.src.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></video>`,
    )
    .join('\n');
  const proofBody = [section, extraImages, extraRecordings].filter(Boolean).join('\n');
  return {
    kind: 'comment',
    id: 'description',
    author: pr.authorLogin,
    authorIsBot: false,
    body: proofBody,
    sourceBody: proofBody,
    createdAt: pr.createdAt,
  };
}
