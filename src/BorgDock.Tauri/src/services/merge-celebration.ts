import { useNotificationStore } from '@/stores/notification-store';
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

export function celebrateMerge(pr: CelebratablePr): void {
  markCelebrated(pr);

  useNotificationStore.getState().show({
    title: `🎉 PR #${pr.number} merged!`,
    message: `${pr.title} — ${pr.repoOwner}/${pr.repoName}`,
    severity: 'merged',
    launchUrl: pr.htmlUrl,
    prNumber: pr.number,
    repoFullName: `${pr.repoOwner}/${pr.repoName}`,
    actions: [{ label: 'View on GitHub', url: pr.htmlUrl }],
  });

  if (useSettingsStore.getState().settings.notifications.playMergeSound) {
    playTada();
  }
}
