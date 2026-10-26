import type { HighlightRequest, HighlightResponse } from './syntax-worker-protocol';

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_PENDING = 16;
const WORK_TIMEOUT_MS = 15_000;
type Result = HighlightResponse | null;
interface Pending {
  request: HighlightRequest;
  finish: (result: Result) => void;
}

let worker: Worker | null = null;
let nextId = 0;
let activeId: number | null = null;
let timeout: ReturnType<typeof setTimeout> | undefined;
const pending = new Map<number, Pending>();

function resetWorker(): void {
  clearTimeout(timeout);
  worker?.terminate();
  worker = null;
  activeId = null;
}

function failWorker(): void {
  resetWorker();
  for (const job of [...pending.values()]) job.finish(null);
}

function dispatchNext(): void {
  if (activeId !== null || pending.size === 0) return;
  try {
    if (!worker) {
      worker = new Worker(new URL('./syntax-worker.ts', import.meta.url), {
        type: 'module',
        name: 'borgdock-syntax',
      });
      worker.onmessage = (event: MessageEvent<HighlightResponse>) => {
        if (event.data.id !== activeId) return;
        clearTimeout(timeout);
        activeId = null;
        pending.get(event.data.id)?.finish(event.data);
        dispatchNext();
      };
      const current = worker;
      current.onerror = () => {
        if (worker === current) failWorker();
      };
      current.onmessageerror = () => {
        if (worker === current) failWorker();
      };
    }
    const job =
      [...pending.values()].find((job) => job.request.operation !== 'symbols') ??
      pending.values().next().value;
    if (!job) return;
    activeId = job.request.id;
    timeout = setTimeout(failWorker, WORK_TIMEOUT_MS);
    worker.postMessage(job.request);
  } catch {
    failWorker();
  }
}

export function requestSyntax(
  filename: string,
  lines: string[],
  signal?: AbortSignal,
  operation: 'highlight' | 'symbols' = 'highlight',
): Promise<Result> {
  if (typeof Worker === 'undefined' || signal?.aborted || pending.size >= MAX_PENDING) {
    return Promise.resolve(null);
  }
  let size = lines.length;
  for (const line of lines) {
    size += line.length * 2;
    if (size > MAX_SOURCE_BYTES) return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const id = ++nextId;
    const abort = () => {
      pending.get(id)?.finish(null);
      if (activeId === id) resetWorker();
      dispatchNext();
    };
    pending.set(id, {
      request: { id, filename, lines, operation },
      finish: (result) => {
        pending.delete(id);
        signal?.removeEventListener('abort', abort);
        resolve(result);
      },
    });
    signal?.addEventListener('abort', abort, { once: true });
    dispatchNext();
  });
}

if (import.meta.hot) import.meta.hot.dispose(failWorker);
