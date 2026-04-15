import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PollingManager } from '../polling';

describe('PollingManager', () => {
  let pollFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    pollFn = vi.fn().mockResolvedValue('result');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('initializes with isPolling false', () => {
      const manager = new PollingManager(pollFn, 5000);
      expect(manager.isPolling).toBe(false);
    });

    it('initializes with lastPollTime null', () => {
      const manager = new PollingManager(pollFn, 5000);
      expect(manager.lastPollTime).toBeNull();
    });

    it('initializes with error null', () => {
      const manager = new PollingManager(pollFn, 5000);
      expect(manager.error).toBeNull();
    });
  });

  describe('start', () => {
    it('executes pollFn immediately (0ms delay on first call)', async () => {
      const manager = new PollingManager(pollFn, 5000);
      manager.start();

      // First poll fires at 0ms delay
      await vi.advanceTimersByTimeAsync(0);
      expect(pollFn).toHaveBeenCalledTimes(1);
    });

    it('does not start a second timer if already started', async () => {
      const manager = new PollingManager(pollFn, 5000);
      manager.start();
      manager.start(); // second call should be a no-op

      await vi.advanceTimersByTimeAsync(0);
      expect(pollFn).toHaveBeenCalledTimes(1);
    });

    it('polls again after interval', async () => {
      const manager = new PollingManager(pollFn, 5000);
      manager.start();

      // First poll at 0ms
      await vi.advanceTimersByTimeAsync(0);
      expect(pollFn).toHaveBeenCalledTimes(1);

      // Second poll after 5000ms
      await vi.advanceTimersByTimeAsync(5000);
      expect(pollFn).toHaveBeenCalledTimes(2);
    });

    it('continues polling at regular intervals', async () => {
      const manager = new PollingManager(pollFn, 1000);
      manager.start();

      await vi.advanceTimersByTimeAsync(0); // 1st poll
      await vi.advanceTimersByTimeAsync(1000); // 2nd poll
      await vi.advanceTimersByTimeAsync(1000); // 3rd poll

      expect(pollFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('stop', () => {
    it('stops polling', async () => {
      const manager = new PollingManager(pollFn, 1000);
      manager.start();

      await vi.advanceTimersByTimeAsync(0); // 1st poll
      expect(pollFn).toHaveBeenCalledTimes(1);

      manager.stop();

      await vi.advanceTimersByTimeAsync(5000);
      expect(pollFn).toHaveBeenCalledTimes(1); // no more polls
    });

    it('sets isPolling to false', async () => {
      const manager = new PollingManager(pollFn, 1000);
      manager.start();

      await vi.advanceTimersByTimeAsync(0);
      manager.stop();

      expect(manager.isPolling).toBe(false);
    });

    it('is safe to call when not started', () => {
      const manager = new PollingManager(pollFn, 1000);
      expect(() => manager.stop()).not.toThrow();
    });

    it('is safe to call multiple times', async () => {
      const manager = new PollingManager(pollFn, 1000);
      manager.start();
      await vi.advanceTimersByTimeAsync(0);

      manager.stop();
      manager.stop();
      expect(manager.isPolling).toBe(false);
    });
  });

  describe('pollNow', () => {
    it('executes poll immediately', async () => {
      const manager = new PollingManager(pollFn, 60000);

      await manager.pollNow();

      expect(pollFn).toHaveBeenCalledTimes(1);
    });

    it('updates lastPollTime after successful poll', async () => {
      const manager = new PollingManager(pollFn, 60000);

      expect(manager.lastPollTime).toBeNull();
      await manager.pollNow();
      expect(manager.lastPollTime).toBeInstanceOf(Date);
    });

    it('does not execute if already polling', async () => {
      let resolvePoll: () => void;
      const slowPollFn = vi.fn(
        () =>
          new Promise<string>((resolve) => {
            resolvePoll = () => resolve('done');
          }),
      );

      const manager = new PollingManager(slowPollFn, 60000);

      // Start first poll (will be pending)
      const firstPoll = manager.pollNow();

      // Try second poll while first is in progress
      await manager.pollNow();

      // Only one call
      expect(slowPollFn).toHaveBeenCalledTimes(1);

      // Clean up
      resolvePoll!();
      await firstPoll;
    });
  });

  describe('onResult callback', () => {
    it('calls onResult with poll result', async () => {
      pollFn.mockResolvedValue({ data: 'test' });
      const manager = new PollingManager(pollFn, 5000);
      const onResult = vi.fn();
      manager.onResult = onResult;

      await manager.pollNow();

      expect(onResult).toHaveBeenCalledWith({ data: 'test' });
    });

    it('does not throw if onResult is not set', async () => {
      const manager = new PollingManager(pollFn, 5000);

      await expect(manager.pollNow()).resolves.toBeUndefined();
    });

    it('calls onResult on each successful poll', async () => {
      pollFn.mockResolvedValueOnce('first').mockResolvedValueOnce('second');

      const manager = new PollingManager(pollFn, 1000);
      const onResult = vi.fn();
      manager.onResult = onResult;

      manager.start();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1000);

      expect(onResult).toHaveBeenCalledTimes(2);
      expect(onResult).toHaveBeenNthCalledWith(1, 'first');
      expect(onResult).toHaveBeenNthCalledWith(2, 'second');

      manager.stop();
    });

    it('can be set to null', async () => {
      const manager = new PollingManager(pollFn, 5000);
      const onResult = vi.fn();
      manager.onResult = onResult;
      manager.onResult = null;

      await manager.pollNow();

      expect(onResult).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('captures Error objects', async () => {
      pollFn.mockRejectedValue(new Error('Network failure'));
      const manager = new PollingManager(pollFn, 5000);

      await manager.pollNow();

      expect(manager.error).toBeInstanceOf(Error);
      expect(manager.error!.message).toBe('Network failure');
    });

    it('wraps non-Error throws into Error objects', async () => {
      pollFn.mockRejectedValue('string error');
      const manager = new PollingManager(pollFn, 5000);

      await manager.pollNow();

      expect(manager.error).toBeInstanceOf(Error);
      expect(manager.error!.message).toBe('string error');
    });

    it('calls onError callback', async () => {
      pollFn.mockRejectedValue(new Error('Timeout'));
      const manager = new PollingManager(pollFn, 5000);
      const onError = vi.fn();
      manager.onError = onError;

      await manager.pollNow();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Timeout' }));
    });

    it('does not throw if onError is not set', async () => {
      pollFn.mockRejectedValue(new Error('fail'));
      const manager = new PollingManager(pollFn, 5000);

      await expect(manager.pollNow()).resolves.toBeUndefined();
    });

    it('clears error on next successful poll', async () => {
      pollFn.mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce('ok');
      const manager = new PollingManager(pollFn, 5000);

      await manager.pollNow();
      expect(manager.error).not.toBeNull();

      await manager.pollNow();
      expect(manager.error).toBeNull();
    });

    it('sets isPolling to false after error', async () => {
      pollFn.mockRejectedValue(new Error('fail'));
      const manager = new PollingManager(pollFn, 5000);

      await manager.pollNow();

      expect(manager.isPolling).toBe(false);
    });

    it('continues polling after an error in scheduled mode', async () => {
      pollFn.mockRejectedValueOnce(new Error('transient')).mockResolvedValueOnce('recovered');

      const manager = new PollingManager(pollFn, 1000);
      const onResult = vi.fn();
      manager.onResult = onResult;

      manager.start();

      // First poll fails
      await vi.advanceTimersByTimeAsync(0);
      expect(manager.error).not.toBeNull();

      // Second poll succeeds
      await vi.advanceTimersByTimeAsync(1000);
      expect(onResult).toHaveBeenCalledWith('recovered');

      manager.stop();
    });

    it('can set onError to null', async () => {
      pollFn.mockRejectedValue(new Error('fail'));
      const manager = new PollingManager(pollFn, 5000);
      const onError = vi.fn();
      manager.onError = onError;
      manager.onError = null;

      await manager.pollNow();

      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('rateLimitChecker', () => {
    it('doubles interval when rate limit is low', async () => {
      const manager = new PollingManager(pollFn, 5000);
      manager.rateLimitChecker = () => true;

      manager.start();

      // First poll at 0ms
      await vi.advanceTimersByTimeAsync(0);
      expect(pollFn).toHaveBeenCalledTimes(1);

      // Normal interval would be 5000ms, but doubled to 10000ms
      await vi.advanceTimersByTimeAsync(5000);
      expect(pollFn).toHaveBeenCalledTimes(1); // not yet

      await vi.advanceTimersByTimeAsync(5000);
      expect(pollFn).toHaveBeenCalledTimes(2); // now at 10000ms

      manager.stop();
    });

    it('uses base interval when rate limit is not low', async () => {
      const manager = new PollingManager(pollFn, 5000);
      manager.rateLimitChecker = () => false;

      manager.start();

      await vi.advanceTimersByTimeAsync(0); // 1st poll
      await vi.advanceTimersByTimeAsync(5000); // 2nd poll

      expect(pollFn).toHaveBeenCalledTimes(2);

      manager.stop();
    });

    it('adapts dynamically when rate limit status changes', async () => {
      let isLow = false;

      // On the 2nd poll, flip isLow to true so that the scheduleNext after
      // the 2nd poll reads it and uses doubled interval for the 3rd poll.
      const adaptivePollFn = vi.fn().mockImplementation(() => {
        if (adaptivePollFn.mock.calls.length === 2) {
          isLow = true;
        }
        return Promise.resolve('ok');
      });

      const manager = new PollingManager(adaptivePollFn, 1000);
      manager.rateLimitChecker = () => isLow;

      manager.start();

      // 1st poll at 0ms (isLow=false, next interval=1000ms)
      await vi.advanceTimersByTimeAsync(0);
      expect(adaptivePollFn).toHaveBeenCalledTimes(1);

      // 2nd poll at +1000ms — during this poll, isLow becomes true
      // After poll, scheduleNext reads isLow=true -> next interval=2000ms
      await vi.advanceTimersByTimeAsync(1000);
      expect(adaptivePollFn).toHaveBeenCalledTimes(2);

      // At +1000ms: should NOT have polled yet (doubled interval)
      await vi.advanceTimersByTimeAsync(1000);
      expect(adaptivePollFn).toHaveBeenCalledTimes(2);

      // At +2000ms total: 3rd poll fires
      await vi.advanceTimersByTimeAsync(1000);
      expect(adaptivePollFn).toHaveBeenCalledTimes(3);

      manager.stop();
    });
  });

  describe('lastPollTime', () => {
    it('is set after successful poll', async () => {
      const manager = new PollingManager(pollFn, 5000);

      const before = new Date();
      await manager.pollNow();
      const after = new Date();

      expect(manager.lastPollTime!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(manager.lastPollTime!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('is not updated after failed poll', async () => {
      pollFn.mockResolvedValueOnce('ok').mockRejectedValueOnce(new Error('fail'));
      const manager = new PollingManager(pollFn, 5000);

      await manager.pollNow();
      const firstPollTime = manager.lastPollTime;

      await manager.pollNow();
      expect(manager.lastPollTime).toBe(firstPollTime);
    });
  });
});
