# Mock Tauri IPC Surface

Generated 2026-05-08 from `grep invoke<` across `src/`. Used by `helpers/mock-tauri.ts` default handlers.

## Commands

| Command | Default response | Notes |
|---|---|---|
| `load_settings` | `{ githubToken: '', adoPat: '', theme: 'system', ... }` | Per-scenario override |
| `save_settings` | `null` | No-op success |
| `check_github_auth` | `{ authenticated: true, login: 'test-user' }` | Per-scenario override |
| `gh_cli_token` | `'ghp_test_token'` | |
| `cache_load_prs` | `[]` | Per-scenario override |
| `cache_load_etags` | `{}` | |
| `ado_fetch` | `null` | Per-scenario override; throws if unmocked |
| `ado_resolve_auth_header` | `'Basic base64'` | |
| `az_cli_available` | `true` | |
| `discover_repos` | `[]` | |
| `scan_repos_under` | `[]` | |
| `list_worktrees` | `[]` | |
| `list_worktrees_bare` | `[]` | |
| `list_worktree_changes` | `[]` | |
| `create_worktree` | `null` | |
| `checkout_pr` | `null` | |
| `diff_worktree_vs_base` | `''` | |
| `diff_worktree_vs_head` | `''` | |
| `git_changed_files` | `[]` | |
| `git_file_diff` | `''` | |
| `list_root_files` | `[]` | |
| `read_text_file` | `''` | |
| `search_content` | `[]` | |
| `cache_load_sql_schema` | `null` | |
| `fetch_sql_schema` | `null` | |
| `execute_sql_query` | `{ columns: [], rows: [] }` | |
| `test_sql_connection` | `true` | |
| `sql_snippets_list` | `[]` | |
| `agent_overview_status` | `[]` | |
| `list_agent_sessions` | `[]` | |
| `focus_session_pane` | `null` | |
| `get_flyout_data` | `{ prs: [], workItems: [] }` | Per-scenario override |
| `get_credential` | `null` | |
| `register_user_hotkeys` | `null` | |
| `unregister_hotkey` | `null` | |
| `check_for_update` | `{ available: false }` | |
| `run_self_test` | `{ ok: true }` | |
| `get_cache_size` | `0` | |
| `generate_pr_summary` | `''` | |
| `open_file_viewer_window` | `null` | Test asserts call, doesn't open window |
| `open_in_editor` | `null` | |
| `open_in_terminal` | `null` | |
| `reveal_in_file_manager` | `null` | |
| `show_setup_wizard` | `null` | |
| `window_ready` | `null` | App boot signal — must succeed silently |
| `cache_init` | `null` | Called by useCacheInit on mount |
| `cache_save_tab_data` | `null` | |
| `cache_save_etags` | `null` | |
| `cache_save_prs` | `null` | |
| `cache_flyout_data` | `null` | |
| `cache_save_sql_schema` | `null` | |
| `clear_cache` | `{ bytesFreed: 0 }` | Settings maintenance |
| `set_credential` | `null` | OS keychain write — no-op in tests |
| `reset_all_settings` | `null` | |
| `download_and_install_update` | `null` | |
| `open_log_folder` | `null` | |
| `open_pr_detail_window` | `null` | Asserted by pr-list spec |
| `open_settings_window` | `null` | |
| `open_whats_new_window` | `null` | |
| `open_workitem_detail_window` | `null` | |
| `show_or_focus_main` | `null` | |
| `show_flyout_toast` | `null` | |
| `hide_flyout` | `null` | |
| `resize_flyout` | `null` | |
| `update_tray_icon` | `null` | |
| `update_tray_tooltip` | `null` | |
| `set_agent_overview_enabled` | `null` | |
| `dismiss_agent_session` | `null` | |
| `mark_agent_session_seen` | `null` | |
| `snooze_agent_session` | `null` | |
| `remove_worktree` | `null` | |
| `git_checkout` | `null` | |
| `git_fetch` | `null` | |
| `run_gh_command` | `''` | |
| `launch_claude_code` | `null` | |
| `sql_snippets_save` | `null` | |
| `sql_snippets_delete` | `null` | |

## Built-in Tauri plugin commands

The mock auto-handles `plugin:*` commands (event/log/store/app/window/webview/dialog) with reasonable defaults so windows don't blow up during boot. See `pluginDefault` in `helpers/mock-tauri.ts`. The `__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener` shim is also installed so `unlisten()` calls succeed.

## Conventions

- **Default responses** make happy-path navigation work without explicit mocking.
- **Per-scenario overrides** (column 2 marked) are set by `seed.ts` named scenarios.
- **Unhandled commands throw.** The mock helper installs default handlers for everything in this list. Any command not in this list throws `mock-tauri: unhandled command "X"` — failing the test loudly when production adds a new IPC call.

## Updating

When `src/` adds a new `invoke('foo_bar', ...)`:
1. Add `foo_bar` to this table with a default response.
2. Add the same default to `helpers/mock-tauri.ts:DEFAULT_HANDLERS`.
3. If a scenario or spec needs a non-default response, override locally.
