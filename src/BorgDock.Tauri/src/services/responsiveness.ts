/**
 * The renderer half of the hang evidence in borgdock.log; the native half is
 * `src-tauri/src/platform/responsiveness.rs`.
 *
 * Logs long animation frames with the scripts that ran in them and slow
 * interactions with what was clicked or pressed. Every 2 s a visible window
 * sends Rust its last input, so a window that freezes can still be explained.
 *
 * IPC calls can't be timed here: Tauri defines `__TAURI_INTERNALS__.invoke`
 * read-only, and assigning to it throws.
 */
import { commands } from '@/generated/commands';
import { createLogger, type Logger } from './logger';

const HEARTBEAT_MS = 2_000;
const LONG_FRAME_MS = 400;
const SLOW_INTERACTION_MS = 400;
const STATS_MS = 10 * 60_000;
const REPORTS_PER_MINUTE = 10;
const CLICKABLE = 'button, a, input, select, textarea, [role], [aria-label], [data-testid]';

interface ScriptTiming {
  invoker?: string;
  invokerType?: string;
  sourceURL?: string;
  sourceFunctionName?: string;
  sourceCharPosition?: number;
  duration: number;
}

interface LongAnimationFrame extends PerformanceEntry {
  blockingDuration: number;
  styleAndLayoutStart: number;
  scripts: ScriptTiming[];
}

interface TauriInternals {
  metadata?: { currentWindow?: { label?: string } };
}

function windowLabel(): string {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals })
    .__TAURI_INTERNALS__;
  return internals?.metadata?.currentWindow?.label ?? 'window';
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function describeTarget(target: EventTarget | null): string {
  if (!(target instanceof Element)) return 'the window';
  const element = target.closest(CLICKABLE) ?? target;
  const editable = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
  const name =
    element.getAttribute('aria-label') ??
    element.getAttribute('title') ??
    element.getAttribute('data-testid') ??
    (editable ? null : element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 40));
  const tag = element.tagName.toLowerCase();
  return name ? `${tag} '${name}'` : tag;
}

/** Characters typed into a field stay out of the log; shortcuts and keys do not. */
export function describeKey(event: KeyboardEvent): string {
  const target = event.target;
  const inField =
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
  const shortcut = event.ctrlKey || event.altKey || event.metaKey;
  if (inField && !shortcut && event.key.length === 1) return 'typing in a text field';
  const modifiers = [
    event.ctrlKey && 'Ctrl',
    event.altKey && 'Alt',
    event.shiftKey && event.key.length > 1 && 'Shift',
    event.metaKey && 'Meta',
  ].filter(Boolean);
  return `key ${[...modifiers, event.key].join('+')}`;
}

/** At most `REPORTS_PER_MINUTE` lines of one kind; the rest are counted. */
function rateLimited(log: Logger, kind: string): (emit: () => void) => void {
  let windowStart = 0;
  let sent = 0;
  let suppressed = 0;
  return (emit) => {
    const now = performance.now();
    if (now - windowStart > 60_000) {
      if (suppressed > 0) log.warn(`${kind}: ${suppressed} more not logged`);
      windowStart = now;
      sent = 0;
      suppressed = 0;
    }
    if (sent < REPORTS_PER_MINUTE) {
      sent++;
      emit();
    } else {
      suppressed++;
    }
  };
}

function describeScript(script: ScriptTiming): string {
  const file = script.sourceURL?.split('/').pop()?.split('?')[0];
  const where = file ? ` ${file}:${script.sourceCharPosition ?? 0}` : '';
  const invoker = script.invoker || script.invokerType || 'script';
  return `${invoker} -> ${script.sourceFunctionName || 'anonymous'}${where} ${Math.round(script.duration)}ms`;
}

function heapMb(): number | null {
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? Math.round(memory.usedJSHeapSize / (1024 * 1024)) : null;
}

let started = false;

/** Diagnostics must never stop a window from booting, so a failure is only logged. */
export function startResponsivenessMonitor(): void {
  if (started || typeof PerformanceObserver === 'undefined') return;
  started = true;
  const log = createLogger(`responsiveness:${windowLabel()}`);
  try {
    monitor(log);
  } catch (error) {
    log.error('monitor failed to start', error);
  }
}

function monitor(log: Logger): void {
  const startedAt = performance.now();
  const stats = { longFrames: 0, blockedMs: 0, slowInteractions: 0 };
  let lastInput: { what: string; at: number } | null = null;

  const lastInputAgo = (now: number) =>
    lastInput ? `${lastInput.what} ${seconds(now - lastInput.at)} ago` : null;
  const remember = (what: string) => {
    lastInput = { what, at: performance.now() };
  };
  window.addEventListener(
    'pointerdown',
    (event) => remember(`click ${describeTarget(event.target)}`),
    {
      capture: true,
      passive: true,
    },
  );
  window.addEventListener('keydown', (event) => remember(describeKey(event)), {
    capture: true,
    passive: true,
  });

  const supported = PerformanceObserver.supportedEntryTypes ?? [];
  const observe = (type: string, onEntry: (entry: PerformanceEntry) => void, init?: object) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(onEntry)).observe({
        type,
        buffered: true,
        ...init,
      });
    } catch (error) {
      log.warn(`cannot observe ${type}`, { error: String(error) });
    }
  };

  const reportFrame = rateLimited(log, 'long frames');
  if (supported.includes('long-animation-frame')) {
    observe('long-animation-frame', (entry) => {
      const frame = entry as LongAnimationFrame;
      if (frame.duration < LONG_FRAME_MS) return;
      stats.longFrames++;
      stats.blockedMs += frame.blockingDuration;
      const end = frame.startTime + frame.duration;
      reportFrame(() =>
        log.warn('long frame', {
          durationMs: Math.round(frame.duration),
          blockingMs: Math.round(frame.blockingDuration),
          layoutMs: frame.styleAndLayoutStart ? Math.round(end - frame.styleAndLayoutStart) : 0,
          scripts: [...frame.scripts]
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 3)
            .map(describeScript),
          lastInput: lastInputAgo(end),
        }),
      );
    });
  } else if (supported.includes('longtask')) {
    observe('longtask', (entry) => {
      if (entry.duration < LONG_FRAME_MS) return;
      stats.longFrames++;
      stats.blockedMs += entry.duration - 50;
      reportFrame(() =>
        log.warn('long task', {
          durationMs: Math.round(entry.duration),
          lastInput: lastInputAgo(entry.startTime + entry.duration),
        }),
      );
    });
  }

  const reportInteraction = rateLimited(log, 'slow interactions');
  let lastInteractionId = 0;
  if (supported.includes('event')) {
    observe(
      'event',
      (entry) => {
        const event = entry as PerformanceEventTiming & { interactionId?: number };
        if (!event.interactionId || event.interactionId === lastInteractionId) return;
        if (event.duration < SLOW_INTERACTION_MS) return;
        lastInteractionId = event.interactionId;
        stats.slowInteractions++;
        reportInteraction(() =>
          log.warn('slow interaction', {
            event: event.name,
            target: describeTarget(event.target),
            durationMs: Math.round(event.duration),
            inputDelayMs: Math.round(event.processingStart - event.startTime),
            handlersMs: Math.round(event.processingEnd - event.processingStart),
            paintMs: Math.round(event.startTime + event.duration - event.processingEnd),
          }),
        );
      },
      { durationThreshold: SLOW_INTERACTION_MS },
    );
  }

  const beat = () => {
    void commands
      .rendererHeartbeat({
        visible: document.visibilityState === 'visible',
        lastInteraction: lastInputAgo(performance.now()),
        heapMb: heapMb(),
      })
      .catch(() => {});
  };
  setInterval(() => {
    if (document.visibilityState === 'visible') beat();
  }, HEARTBEAT_MS);
  document.addEventListener('visibilitychange', beat);
  beat();

  setInterval(() => {
    log.info('renderer stats', {
      uptimeMin: Math.round((performance.now() - startedAt) / 60_000),
      heapMb: heapMb(),
      domNodes: document.getElementsByTagName('*').length,
      ...stats,
      blockedMs: Math.round(stats.blockedMs),
    });
  }, STATS_MS);

  log.info('monitor started', {
    frames: supported.includes('long-animation-frame')
      ? 'long-animation-frame'
      : supported.includes('longtask')
        ? 'longtask'
        : 'none',
    interactions: supported.includes('event'),
  });
}
