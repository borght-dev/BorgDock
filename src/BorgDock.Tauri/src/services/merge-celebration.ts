import { sendOsNotification } from '@/services/notification';
import { useSettingsStore } from '@/stores/settings-store';

export interface CelebratablePr {
  number: number;
  title: string;
  repoOwner: string;
  repoName: string;
  htmlUrl: string;
}

const DEDUP_WINDOW_MS = 30_000;

// Map: "owner/repo#number" -> expiry epoch ms.
// Lazy-evicts on read; no setTimeout-driven cleanup needed.
const recentlyCelebrated = new Map<string, number>();

function key(pr: { repoOwner: string; repoName: string; number: number }): string {
  return `${pr.repoOwner}/${pr.repoName}#${pr.number}`;
}

export function wasRecentlyCelebrated(pr: {
  repoOwner: string;
  repoName: string;
  number: number;
}): boolean {
  const k = key(pr);
  const expiry = recentlyCelebrated.get(k);
  if (expiry === undefined) return false;
  if (Date.now() >= expiry) {
    recentlyCelebrated.delete(k);
    return false;
  }
  return true;
}

export function markCelebrated(pr: {
  repoOwner: string;
  repoName: string;
  number: number;
}): void {
  recentlyCelebrated.set(key(pr), Date.now() + DEDUP_WINDOW_MS);
}

let audioEl: HTMLAudioElement | null = null;

function playTada(): void {
  try {
    if (!audioEl) {
      audioEl = new Audio('/sounds/tada.mp3');
      audioEl.volume = 0.6;
    }
    audioEl.currentTime = 0;
    void audioEl.play().catch(() => {
      // Autoplay rejected or audio decode failed — ignore.
    });
  } catch {
    // Audio constructor unavailable / blocked — ignore.
  }
}

/** Plays the tada sound iff the user's `playMergeSound` setting is on.
 *  Safe to call from any merge-related code path; the gating lives here so
 *  there's exactly one place that owns the audio + setting check. */
export function playMergeSoundIfEnabled(): void {
  if (useSettingsStore.getState().settings.notifications.playMergeSound) {
    playTada();
  }
}

export function celebrateMerge(pr: CelebratablePr): void {
  markCelebrated(pr);

  // sendOsNotification fires the tada sound itself for severity 'merged'
  // (gated by the playMergeSound setting), so we don't call
  // playMergeSoundIfEnabled here — calling both would double-play.
  void sendOsNotification({
    title: `🎉 PR #${pr.number} merged!`,
    body: `${pr.title} — ${pr.repoOwner}/${pr.repoName}`,
    severity: 'merged',
    prOwner: pr.repoOwner,
    prRepo: pr.repoName,
    prNumber: pr.number,
    actions: [{ label: 'View on GitHub', action: 'open-url', url: pr.htmlUrl }],
  }).catch(() => {});
}
