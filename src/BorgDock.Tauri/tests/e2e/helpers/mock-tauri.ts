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
  // Mirror of the AppSettings shape (src/types/settings.ts) — minimal but
  // structurally complete so the settings store hydrates without TypeError.
  // Specs that need richer settings should override via seed.ts.
  load_settings: {
    setupComplete: false,
    gitHub: { authMethod: 'ghCli', pollIntervalSeconds: 60, username: '' },
    repos: [],
    ui: {
      theme: 'system',
      globalHotkey: 'Ctrl+Win+Shift+G',
      flyoutHotkey: 'Ctrl+Win+Shift+F',
      editorCommand: 'code',
      runAtStartup: false,
      quickReviewHotkey: '',
      startMinimizedToTray: false,
      restoreLastSelection: true,
    },
    notifications: {
      toastOnCheckStatusChange: true,
      toastOnNewPR: false,
      toastOnReviewUpdate: true,
      toastOnMergeable: true,
      onlyMyPRs: false,
      playMergeSound: true,
      reviewNudgeEnabled: true,
      reviewNudgeIntervalMinutes: 60,
      reviewNudgeEscalation: true,
      deduplicationWindowSeconds: 60,
      channels: { tray: true, system: true, sound: true, emailDigest: false },
    },
    claudeCode: { defaultPostFixAction: 'commitAndNotify' },
    claudeApi: {
      model: 'claude-sonnet-4-6',
      maxTokens: 1024,
      prSummaryEnabled: true,
      diffExplanationsEnabled: true,
      reviewNudgePhrasingEnabled: false,
      commitMessageSuggestionsEnabled: false,
    },
    claudeReview: { botUsername: 'claude[bot]' },
    updates: { autoCheckEnabled: true, autoDownload: true },
    azureDevOps: {
      organization: '',
      project: '',
      authMethod: 'azCli',
      authAutoDetected: false,
      pollIntervalSeconds: 120,
      favoriteQueryIds: [],
      trackedWorkItemIds: [],
      workingOnWorkItemIds: [],
      workItemWorktreePaths: {},
      recentWorkItemIds: [],
      linkMatchBy: 'branch',
      showWorkItemStateOnPrCard: true,
      updatePrStatusWhenWiDone: false,
    },
    sql: {
      connections: [],
      readOnlyByDefault: true,
      confirmDestructiveWithoutWhere: true,
    },
    repoPriority: {},
  },
  save_settings: null,
  check_github_auth: { authenticated: false, login: '' },
  gh_cli_token: 'gho_test_token',
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
  // Additional commands surfaced during smoke (cache, agent, window mgmt,
  // worktree mutations, gh/git plumbing). Defaults are conservative no-ops
  // or empty arrays — specs override when they need real values.
  cache_init: null,
  cache_save_tab_data: null,
  cache_load_tab_data: null,
  cache_save_etags: null,
  cache_save_prs: null,
  cache_flyout_data: null,
  cache_save_sql_schema: null,
  clear_cache: { bytesFreed: 0 },
  set_credential: null,
  reset_all_settings: null,
  download_and_install_update: null,
  open_log_folder: null,
  open_pr_detail_window: null,
  open_settings_window: null,
  open_whats_new_window: null,
  open_workitem_detail_window: null,
  show_or_focus_main: null,
  show_flyout_toast: null,
  hide_flyout: null,
  resize_flyout: null,
  update_tray_icon: null,
  update_tray_tooltip: null,
  set_agent_overview_enabled: null,
  dismiss_agent_session: null,
  mark_agent_session_seen: null,
  snooze_agent_session: null,
  remove_worktree: null,
  git_checkout: null,
  git_fetch: null,
  run_gh_command: '',
  launch_claude_code: null,
  sql_snippets_save: null,
  sql_snippets_delete: null,
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

    // Built-in Tauri plugin commands (log, store, app, event) are noisy
    // infrastructure that every window calls during boot. Default them to
    // no-op success so specs only care about app-level commands.
    const pluginDefault = (cmd: string): unknown => {
      // store: plugin:store|load returns a numeric resource id; subsequent
      // get returns [value, exists]. Match the real shape so the JS wrapper
      // doesn't blow up during destructure.
      if (cmd === 'plugin:store|load') return 1;
      if (cmd === 'plugin:store|get_store') return null;
      if (cmd === 'plugin:store|get') return [undefined, false];
      if (cmd === 'plugin:store|has') return false;
      if (cmd === 'plugin:store|keys') return [];
      if (cmd === 'plugin:store|values') return [];
      if (cmd === 'plugin:store|entries') return [];
      if (cmd === 'plugin:store|length') return 0;
      if (cmd === 'plugin:app|version') return '0.0.0-test';
      if (cmd === 'plugin:app|name') return 'BorgDock';
      if (cmd === 'plugin:app|tauri_version') return '2.0.0';
      // event listen returns a numeric eventId that unlisten then passes to
      // window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener (stubbed below).
      if (cmd === 'plugin:event|listen') return 1;
      if (cmd === 'plugin:event|emit') return null;
      if (cmd === 'plugin:event|emit_to') return null;
      if (cmd === 'plugin:event|unlisten') return null;
      // log, window, webview, dialog, set, save, clear, etc.: no-op.
      return null;
    };

    // The event API's _unlisten() calls
    // window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(event, id).
    // Without this stub, every component that returns from listen().then(unlisten)
    // throws "Cannot read properties of undefined (reading 'unregisterListener')".
    (window as unknown as {
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => void };
    }).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: () => {},
    };

    const tauriInternals = {
      invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
        invokeLog.push({ cmd, args });
        const handler = handlers.get(cmd);
        if (handler) return await handler(args);
        if (cmd.startsWith('plugin:')) return pluginDefault(cmd);
        throw new Error(`mock-tauri: unhandled command "${cmd}"`);
      },
      transformCallback: (cb: unknown) => cb,
      // Both currentWindow and currentWebview are read by @tauri-apps/api
      // (window.js, webview.js, webviewWindow.js) via the metadata field.
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main' },
      },
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
