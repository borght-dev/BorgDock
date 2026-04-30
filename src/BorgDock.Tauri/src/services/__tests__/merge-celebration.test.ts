import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockShow = vi.fn();
const mockSettings = {
  notifications: {
    playMergeSound: true,
    onlyMyPRs: false,
    toastOnCheckStatusChange: true,
    toastOnNewPR: false,
    toastOnReviewUpdate: true,
    toastOnMergeable: true,
    reviewNudgeEnabled: true,
    reviewNudgeIntervalMinutes: 60,
    reviewNudgeEscalation: true,
    deduplicationWindowSeconds: 60,
  },
};

vi.mock('@/stores/notification-store', () => ({
  useNotificationStore: { getState: () => ({ show: mockShow }) },
}));

vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: { getState: () => ({ settings: mockSettings }) },
}));

const mockPlay = vi.fn().mockResolvedValue(undefined);
class MockAudio {
  src: string;
  volume = 1;
  currentTime = 0;
  constructor(src: string) {
    this.src = src;
  }
  play() {
    return mockPlay();
  }
}
beforeEach(() => {
  mockShow.mockClear();
  mockPlay.mockClear();
  mockSettings.notifications.playMergeSound = true;
  vi.stubGlobal('Audio', MockAudio);
  // Reset the module-level dedup state and audio cache between tests
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const samplePr = {
  number: 42,
  title: 'Add feature X',
  repoOwner: 'owner',
  repoName: 'repo',
  htmlUrl: 'https://github.com/owner/repo/pull/42',
};

describe('celebrateMerge', () => {
  it('fires a merged-severity notification with the correct shape', async () => {
    const { celebrateMerge } = await import('../merge-celebration');
    celebrateMerge(samplePr);
    expect(mockShow).toHaveBeenCalledTimes(1);
    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '🎉 PR #42 merged!',
        message: 'Add feature X — owner/repo',
        severity: 'merged',
        launchUrl: 'https://github.com/owner/repo/pull/42',
        prNumber: 42,
        repoFullName: 'owner/repo',
        actions: [{ label: 'View on GitHub', url: 'https://github.com/owner/repo/pull/42' }],
      }),
    );
  });

  it('plays the tada sound when playMergeSound is true', async () => {
    const { celebrateMerge } = await import('../merge-celebration');
    celebrateMerge(samplePr);
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });

  it('does not play sound when playMergeSound is false', async () => {
    mockSettings.notifications.playMergeSound = false;
    const { celebrateMerge } = await import('../merge-celebration');
    celebrateMerge(samplePr);
    expect(mockShow).toHaveBeenCalledTimes(1);
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it('swallows audio errors so a sound failure does not block the toast', async () => {
    mockPlay.mockRejectedValueOnce(new Error('autoplay blocked'));
    const { celebrateMerge } = await import('../merge-celebration');
    expect(() => celebrateMerge(samplePr)).not.toThrow();
    expect(mockShow).toHaveBeenCalledTimes(1);
  });

  it('swallows Audio constructor errors so a throwing constructor does not block the toast', async () => {
    vi.stubGlobal('Audio', function ThrowingAudio(): never {
      throw new Error('no audio context');
    });
    const { celebrateMerge } = await import('../merge-celebration');
    expect(() => celebrateMerge(samplePr)).not.toThrow();
    expect(mockShow).toHaveBeenCalledTimes(1);
  });
});

describe('wasRecentlyCelebrated dedup', () => {
  it('returns true within the dedup window after celebrating', async () => {
    const { celebrateMerge, wasRecentlyCelebrated } = await import('../merge-celebration');
    celebrateMerge(samplePr);
    expect(
      wasRecentlyCelebrated({ repoOwner: 'owner', repoName: 'repo', number: 42 }),
    ).toBe(true);
  });

  it('returns false for a different PR', async () => {
    const { celebrateMerge, wasRecentlyCelebrated } = await import('../merge-celebration');
    celebrateMerge(samplePr);
    expect(
      wasRecentlyCelebrated({ repoOwner: 'owner', repoName: 'repo', number: 99 }),
    ).toBe(false);
  });

  it('expires after the dedup window', async () => {
    vi.useFakeTimers();
    const { celebrateMerge, wasRecentlyCelebrated } = await import('../merge-celebration');
    celebrateMerge(samplePr);
    vi.advanceTimersByTime(31_000);
    expect(
      wasRecentlyCelebrated({ repoOwner: 'owner', repoName: 'repo', number: 42 }),
    ).toBe(false);
    vi.useRealTimers();
  });
});
