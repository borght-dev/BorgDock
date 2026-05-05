import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn().mockResolvedValue(undefined),
}));
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

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
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
  mockInvoke.mockClear();
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

// celebrateMerge fires the OS notification synchronously (the invoke is awaited
// inside a fire-and-forget promise) — assertions need a microtask to flush
// before the call shows up in `mockInvoke.mock.calls`.
async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('celebrateMerge', () => {
  it('fires a merged-severity OS notification with the correct shape', async () => {
    const { celebrateMerge } = await import('../merge-celebration');
    celebrateMerge(samplePr);
    await flushMicrotasks();
    const showCalls = mockInvoke.mock.calls.filter((c) => c[0] === 'show_flyout_toast');
    expect(showCalls).toHaveLength(1);
    expect(showCalls[0]![1]).toMatchObject({
      payload: expect.objectContaining({
        title: '🎉 PR #42 merged!',
        body: 'Add feature X — owner/repo',
        severity: 'merged',
        prOwner: 'owner',
        prRepo: 'repo',
        prNumber: 42,
        actions: [
          { label: 'View on GitHub', action: 'open-url', url: 'https://github.com/owner/repo/pull/42' },
        ],
      }),
    });
  });

  it('plays the tada sound when playMergeSound is true', async () => {
    const { celebrateMerge } = await import('../merge-celebration');
    celebrateMerge(samplePr);
    await flushMicrotasks();
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });

  it('does not play sound when playMergeSound is false', async () => {
    mockSettings.notifications.playMergeSound = false;
    const { celebrateMerge } = await import('../merge-celebration');
    celebrateMerge(samplePr);
    await flushMicrotasks();
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it('swallows audio errors so a sound failure does not block the toast', async () => {
    mockPlay.mockRejectedValueOnce(new Error('autoplay blocked'));
    const { celebrateMerge } = await import('../merge-celebration');
    expect(() => celebrateMerge(samplePr)).not.toThrow();
    await flushMicrotasks();
    const showCalls = mockInvoke.mock.calls.filter((c) => c[0] === 'show_flyout_toast');
    expect(showCalls).toHaveLength(1);
  });

  it('swallows Audio constructor errors so a throwing constructor does not block the toast', async () => {
    vi.stubGlobal('Audio', function ThrowingAudio(): never {
      throw new Error('no audio context');
    });
    const { celebrateMerge } = await import('../merge-celebration');
    expect(() => celebrateMerge(samplePr)).not.toThrow();
    await flushMicrotasks();
    const showCalls = mockInvoke.mock.calls.filter((c) => c[0] === 'show_flyout_toast');
    expect(showCalls).toHaveLength(1);
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
