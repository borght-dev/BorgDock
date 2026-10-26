import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HighlightRequest, HighlightResponse } from '../syntax-worker-protocol';

class WorkerDouble {
  static instances: WorkerDouble[] = [];
  onmessage: ((event: MessageEvent<HighlightResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn<(request: HighlightRequest) => void>();
  terminate = vi.fn();
  constructor() {
    WorkerDouble.instances.push(this);
  }
  reply(highlights: HighlightResponse['highlights']) {
    this.onmessage?.({
      data: { id: this.postMessage.mock.lastCall![0].id, highlights },
    } as MessageEvent<HighlightResponse>);
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  WorkerDouble.instances = [];
  vi.stubGlobal('Worker', WorkerDouble);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('syntax worker', () => {
  it('runs one job at a time and returns structured highlight maps', async () => {
    const { highlightLines } = await import('../syntax-highlighter');
    const first = highlightLines('a.ts', ['const a = 1']);
    const second = highlightLines('b.ts', ['const b = 2']);
    const worker = WorkerDouble.instances[0]!;
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    const spans = new Map([[0, [{ start: 0, end: 5, category: 'keyword' as const }]]]);
    worker.reply(spans);
    expect(await first).toEqual(spans);
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    worker.reply(null);
    expect(await second).toBeNull();
  });

  it('cancels obsolete parsing and keeps queued consumers working', async () => {
    const { highlightLines } = await import('../syntax-highlighter');
    const controller = new AbortController();
    const obsolete = highlightLines('old.ts', ['old'], controller.signal);
    const current = highlightLines('new.ts', ['new']);
    const oldWorker = WorkerDouble.instances[0]!;
    controller.abort();
    expect(await obsolete).toBeNull();
    expect(oldWorker.terminate).toHaveBeenCalledOnce();
    const worker = WorkerDouble.instances[1]!;
    oldWorker.reply(new Map());
    worker.reply(new Map([[0, []]]));
    expect(await current).toEqual(new Map([[0, []]]));
  });

  it('recovers after a worker crash or deadline without blocking callers', async () => {
    const { highlightLines } = await import('../syntax-highlighter');
    const failed = highlightLines('a.ts', ['a']);
    WorkerDouble.instances[0]!.onerror?.();
    expect(await failed).toBeNull();
    const timedOut = highlightLines('b.ts', ['b']);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await timedOut).toBeNull();
    expect(WorkerDouble.instances[1]!.terminate).toHaveBeenCalledOnce();
  });

  it('bounds queued work and rejects an oversized source before posting', async () => {
    const { highlightLines } = await import('../syntax-highlighter');
    expect(await highlightLines('huge.ts', ['x'.repeat(2 * 1024 * 1024)])).toBeNull();
    expect(WorkerDouble.instances).toHaveLength(0);
    const jobs = Array.from({ length: 16 }, () => highlightLines('a.ts', ['a']));
    expect(await highlightLines('extra.ts', ['extra'])).toBeNull();
    WorkerDouble.instances[0]!.onerror?.();
    expect(await Promise.all(jobs)).toEqual(Array(16).fill(null));
  });
});
