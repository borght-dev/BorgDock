/**
 * Namespaced logger that writes to the tauri-plugin-log backend.
 *
 * All frontend log lines end up in the same file as Rust logs:
 *   Windows: %APPDATA%\PRDock\logs\prdock.log
 *   macOS:   ~/Library/Application Support/PRDock/logs/prdock.log
 *   Linux:   ~/.config/PRDock/logs/prdock.log
 *
 * Usage:
 *   const log = createLogger('init');
 *   log.debug('starting auth step');
 *   log.info('fetched PRs', { count: 12 });
 *   log.warn('rate limit low', { remaining: 50 });
 *   log.error('fetch failed', err);
 *
 *   // Time an async operation:
 *   const prs = await log.time('getOpenPRs', () => getOpenPRs(client, owner, repo));
 */

import {
  debug as pluginDebug,
  error as pluginError,
  info as pluginInfo,
  warn as pluginWarn,
} from '@tauri-apps/plugin-log';

type LogFn = (message: string) => Promise<void>;

// Safe wrappers — if the plugin call fails (e.g., tests without Tauri), swallow
// the error so logging never breaks the app.
const safe = (fn: LogFn) => async (message: string) => {
  try {
    await fn(message);
  } catch {
    /* ignore */
  }
};

const backend = {
  debug: safe(pluginDebug),
  info: safe(pluginInfo),
  warn: safe(pluginWarn),
  error: safe(pluginError),
};

// Capture the ORIGINAL console methods at module load — before
// attachConsoleBridge can patch them. Otherwise emit() would recurse through
// the patched console.info and double-send every log line to plugin-log.
const originalConsole = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

function formatFields(fields: Record<string, unknown> | undefined): string {
  if (!fields || Object.keys(fields).length === 0) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    let formatted: string;
    if (v === undefined) formatted = 'undefined';
    else if (v === null) formatted = 'null';
    else if (typeof v === 'string') formatted = v;
    else if (typeof v === 'number' || typeof v === 'boolean') formatted = String(v);
    else if (v instanceof Error) formatted = `${v.name}: ${v.message}`;
    else {
      try {
        formatted = JSON.stringify(v);
      } catch {
        formatted = '[unserializable]';
      }
    }
    parts.push(`${k}=${formatted}`);
  }
  return ` { ${parts.join(', ')} }`;
}

function formatMessage(
  namespace: string,
  message: string,
  fields?: Record<string, unknown>,
): string {
  return `[${namespace}] ${message}${formatFields(fields)}`;
}

function extractErrorFields(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      error: err.message,
      name: err.name,
      ...(err.stack ? { stack: err.stack.split('\n').slice(0, 4).join(' | ') } : {}),
    };
  }
  return { error: String(err) };
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, errOrFields?: unknown, extra?: Record<string, unknown>): void;
  /** Time an async operation, logging start, duration, and any error. */
  time<T>(label: string, fn: () => Promise<T>, fields?: Record<string, unknown>): Promise<T>;
  /** Create a sub-logger that prefixes messages with `namespace:sub`. */
  child(sub: string): Logger;
}

export function createLogger(namespace: string): Logger {
  const emit = (level: 'debug' | 'info' | 'warn' | 'error', line: string) => {
    backend[level](line);
    originalConsole[level](line);
  };

  const debug = (message: string, fields?: Record<string, unknown>) => {
    emit('debug', formatMessage(namespace, message, fields));
  };
  const info = (message: string, fields?: Record<string, unknown>) => {
    emit('info', formatMessage(namespace, message, fields));
  };
  const warn = (message: string, fields?: Record<string, unknown>) => {
    emit('warn', formatMessage(namespace, message, fields));
  };
  const error = (
    message: string,
    errOrFields?: unknown,
    extra?: Record<string, unknown>,
  ) => {
    let fields: Record<string, unknown> | undefined;
    if (errOrFields !== undefined) {
      if (
        errOrFields &&
        typeof errOrFields === 'object' &&
        !(errOrFields instanceof Error)
      ) {
        fields = { ...(errOrFields as Record<string, unknown>), ...extra };
      } else {
        fields = { ...extractErrorFields(errOrFields), ...extra };
      }
    }
    emit('error', formatMessage(namespace, message, fields));
  };
  const time = async <T>(
    label: string,
    fn: () => Promise<T>,
    fields?: Record<string, unknown>,
  ): Promise<T> => {
    const start = performance.now();
    debug(`${label} start`, fields);
    try {
      const result = await fn();
      const durationMs = Math.round(performance.now() - start);
      debug(`${label} done`, { ...fields, durationMs });
      return result;
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      error(`${label} failed`, err, { ...fields, durationMs });
      throw err;
    }
  };
  const child = (sub: string): Logger => createLogger(`${namespace}:${sub}`);

  return { debug, info, warn, error, time, child };
}

/**
 * Bridge the browser console so existing `console.log` / `console.warn` /
 * `console.error` calls (not made via createLogger) also flow to the
 * tauri-plugin-log backend. Call this once at app startup in main.tsx.
 *
 * Idempotent — safe to call multiple times. Safe for createLogger callers
 * because `emit()` uses the module-level `originalConsole` reference which is
 * captured before this function patches `window.console.*`, so logger output
 * never round-trips through the bridge.
 */
let consoleBridged = false;
export function attachConsoleBridge(): void {
  if (consoleBridged) return;
  consoleBridged = true;

  const originalLog = console.log.bind(console);

  const stringify = (args: unknown[]): string =>
    args
      .map((a) => {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return `${a.name}: ${a.message}`;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(' ');

  console.log = (...args) => {
    originalLog(...args);
    backend.info(`[console] ${stringify(args)}`);
  };
  console.info = (...args) => {
    originalConsole.info(...args);
    backend.info(`[console] ${stringify(args)}`);
  };
  console.debug = (...args) => {
    originalConsole.debug(...args);
    backend.debug(`[console] ${stringify(args)}`);
  };
  console.warn = (...args) => {
    originalConsole.warn(...args);
    backend.warn(`[console] ${stringify(args)}`);
  };
  console.error = (...args) => {
    originalConsole.error(...args);
    backend.error(`[console] ${stringify(args)}`);
  };
}
