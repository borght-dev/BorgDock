import type { Page } from '@playwright/test';

/**
 * IPC chokepoint for Playwright e2e tests.
 *
 * Stubs window.__TAURI_INTERNALS__ + window.__TAURI__ at page-init time
 * so the frontend's invoke()/listen() resolve against an in-page recorded
 * log instead of crossing IPC. Tests assert against the log via
 * `getInvokeLog(page)`.
 *
 * Default handlers cover every command in MOCK_SURFACE.md so happy-path
 * boot succeeds with no per-test setup. Tests pass an `overrides` map to
 * customize per-scenario.
 *
 * Unmocked commands throw 'mock-tauri: unhandled command "X"' — making
 * production-side IPC additions surface loudly in CI rather than
 * silently passing because the missing call returned undefined.
 */

export type MockHandler =
  | unknown
  | ((args: Record<string, unknown>) => unknown | Promise<unknown>);

export type MockHandlers = Record<string, MockHandler>;

export interface SerializedHandler {
  type: 'value' | 'fn';
  data: unknown;
}

export function serializeHandlers(
  handlers: MockHandlers,
): Record<string, SerializedHandler> {
  const out: Record<string, SerializedHandler> = {};
  for (const [cmd, h] of Object.entries(handlers)) {
    if (typeof h === 'function') {
      out[cmd] = { type: 'fn', data: h.toString() };
    } else {
      out[cmd] = { type: 'value', data: h };
    }
  }
  return out;
}

/**
 * Default handlers for every command listed in MOCK_SURFACE.md. Boot
 * succeeds without any per-test setup; specs override what they need.
 */
export const DEFAULT_HANDLERS: MockHandlers = {
  load_settings: {
    githubToken: '',
    adoPat: '',
    adoOrg: '',
    theme: 'system',
    flyoutHotkey: 'Alt+Space',
    showRecentlyClosed: false,
  },
  save_settings: null,
  check_github_auth: { authenticated: false, login: '' },
  gh_cli_token: '',
  cache_load_prs: [],
  cache_load_etags: {},
  ado_fetch: null,
  ado_resolve_auth_header: '',
  az_cli_available: false,
  discover_repos: [],
  scan_repos_under: [],
  list_worktrees: [],
  list_worktrees_bare: [],
  list_worktree_changes: [],
  create_worktree: null,
  checkout_pr: null,
  diff_worktree_vs_base: '',
  diff_worktree_vs_head: '',
  git_changed_files: [],
  git_file_diff: '',
  list_root_files: [],
  read_text_file: '',
  search_content: [],
  cache_load_sql_schema: null,
  fetch_sql_schema: null,
  execute_sql_query: { columns: [], rows: [] },
  test_sql_connection: true,
  sql_snippets_list: [],
  agent_overview_status: [],
  list_agent_sessions: [],
  focus_session_pane: null,
  get_flyout_data: { prs: [], workItems: [] },
  get_credential: null,
  register_user_hotkeys: null,
  unregister_hotkey: null,
  check_for_update: { available: false },
  run_self_test: { ok: true },
  get_cache_size: 0,
  generate_pr_summary: '',
  open_file_viewer_window: null,
  open_in_editor: null,
  open_in_terminal: null,
  reveal_in_file_manager: null,
  show_setup_wizard: null,
  window_ready: null,
};

/**
 * Install the mock at page boot. Handlers are merged with DEFAULT_HANDLERS
 * (overrides win). Must be called before page.goto().
 */
export async function installMockTauri(
  page: Page,
  overrides: MockHandlers = {},
): Promise<void> {
  const merged = { ...DEFAULT_HANDLERS, ...overrides };
  const serialized = serializeHandlers(merged);

  await page.addInitScript((payload: Record<string, SerializedHandler>) => {
    type Handler = (args: Record<string, unknown>) => unknown | Promise<unknown>;
    const invokeLog: { cmd: string; args: unknown }[] = [];
    const handlers = new Map<string, Handler>();
    const listeners = new Map<string, ((evt: unknown) => void)[]>();

    for (const [cmd, h] of Object.entries(payload)) {
      if (h.type === 'fn') {
        // h.data is the source of an arrow/function expression.
        const fn = new Function('args', `return (${h.data})(args);`) as Handler;
        handlers.set(cmd, fn);
      } else {
        const v = h.data;
        handlers.set(cmd, () => v);
      }
    }

    const tauriInternals = {
      invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
        invokeLog.push({ cmd, args });
        const handler = handlers.get(cmd);
        if (!handler) throw new Error(`mock-tauri: unhandled command "${cmd}"`);
        return await handler(args);
      },
      transformCallback: (cb: unknown) => cb,
      metadata: { currentWebview: { label: 'main' } },
    };

    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = tauriInternals;

    const tauriEvents = {
      listen: async (event: string, cb: (evt: unknown) => void) => {
        const arr = listeners.get(event) ?? [];
        arr.push(cb);
        listeners.set(event, arr);
        return () => {
          const a = listeners.get(event);
          if (!a) return;
          const idx = a.indexOf(cb);
          if (idx >= 0) a.splice(idx, 1);
        };
      },
      emit: async () => {},
    };

    const tauri = (window as unknown as { __TAURI__?: Record<string, unknown> }).__TAURI__ ?? {};
    tauri.event = tauriEvents;
    (window as unknown as { __TAURI__: unknown }).__TAURI__ = tauri;

    (window as unknown as { __mockTauri: unknown }).__mockTauri = {
      invokeLog,
      addHandler(cmd: string, h: Handler) {
        handlers.set(cmd, h);
      },
      emit(event: string, payload: unknown) {
        const arr = listeners.get(event) ?? [];
        for (const cb of arr) cb({ event, payload, id: Math.random() });
      },
    };
  }, serialized);
}

/**
 * Read the recorded invoke log. Tests assert against this for IPC payloads.
 */
export async function getInvokeLog(
  page: Page,
): Promise<{ cmd: string; args: unknown }[]> {
  return page.evaluate(
    () =>
      (window as unknown as { __mockTauri?: { invokeLog: unknown } }).__mockTauri
        ?.invokeLog as { cmd: string; args: unknown }[] ?? [],
  );
}

/**
 * Emit a Tauri event into the page (for mocked listen() consumers).
 */
export async function emitTauriEvent(
  page: Page,
  event: string,
  payload: unknown,
): Promise<void> {
  await page.evaluate(
    ({ e, p }) =>
      (window as unknown as {
        __mockTauri?: { emit: (e: string, p: unknown) => void };
      }).__mockTauri?.emit(e, p),
    { e: event, p: payload },
  );
}
