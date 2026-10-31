pub mod activity;
pub mod ado;
pub mod agents;
mod app_data;
pub mod auth;
pub mod cache;
pub mod ci_failures;
pub mod content_search;
pub mod flyout;
pub mod git;
mod http;
pub mod keychain;
pub mod maintenance;
pub mod notes;
pub mod phone_link;
mod runtime;
mod sqlite_store;
use tauri::{generate_handler, Emitter, Manager};
pub mod platform;
pub mod settings;
pub mod sql;
pub mod t3;
pub mod updater;
pub mod workstreams;

use cache::PrCache;
use git::process::ProcessState;
use std::sync::Mutex;

fn log_dir() -> std::path::PathBuf {
    crate::app_data::directory().join("logs")
}

/// Write panic info to a dedicated file synchronously, then chain to the
/// default hook. A buffered logger can lose the message if the process
/// aborts (or the panic happens inside the logger itself) — a direct
/// write+flush is the only way to guarantee the panic is recorded.
fn install_panic_hook() {
    // Make the default hook print a backtrace even when RUST_BACKTRACE is unset.
    if std::env::var_os("RUST_BACKTRACE").is_none() {
        std::env::set_var("RUST_BACKTRACE", "1");
    }

    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| info.payload().downcast_ref::<String>().map(|s| s.as_str()))
            .unwrap_or("<non-string panic payload>");
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "<unknown location>".to_string());
        let thread = std::thread::current()
            .name()
            .unwrap_or("<unnamed>")
            .to_string();
        let backtrace = std::backtrace::Backtrace::force_capture();
        let ts = chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3f");
        let message = format!(
            "[{ts}] PANIC thread={thread} at {location}\n  payload: {payload}\n  backtrace:\n{backtrace}\n"
        );

        // Direct + flushed write — survives `panic = abort`.
        let dir = log_dir();
        let _ = std::fs::create_dir_all(&dir);
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join("borgdock-panic.log"))
        {
            use std::io::Write;
            let _ = f.write_all(message.as_bytes());
            let _ = f.flush();
        }

        // Deliberately NOT routed through `log::error!`: the log plugin's
        // Webview target re-enters the webview from inside a panic, which
        // can itself panic (or deadlock on the main thread) and turn a
        // recoverable unwind into an abort. The file write above is the
        // durable record; stderr below covers `cargo tauri dev`.

        // Stderr for `cargo tauri dev`.
        eprintln!("{message}");

        default_hook(info);
    }));
}

macro_rules! app_commands {
    ($collector:ident) => {
        $collector![
            // Settings
            settings::load_settings,
            settings::save_settings,
            settings::window::open_settings_window,
            // Auth
            auth::gh_cli_token,
            auth::gh_cli_accounts,
            auth::validate_pat,
            auth::check_github_auth,
            auth::ado::az_cli_available,
            auth::ado::ado_resolve_auth_header,
            // Platform
            platform::window::show_or_focus_main,
            platform::window::hide_flyout,
            platform::window::window_ready,
            platform::hotkey::register_user_hotkeys,
            platform::hotkey::unregister_hotkey,
            platform::hotkey::palette_ready,
            platform::hotkey::open_tool_window,
            platform::tray::update_tray_tooltip,
            platform::tray::update_tray_icon,
            platform::flyout_cache::cache_flyout_data,
            platform::flyout_cache::get_flyout_data,
            platform::theme::get_system_theme,
            platform::logs::get_log_folder,
            platform::logs::open_log_folder,
            platform::responsiveness::renderer_heartbeat,
            // Git
            git::worktree::list_worktrees,
            git::worktree::list_worktrees_bare,
            git::worktree_cache::worktree_cache_get_all,
            git::disk_space::host_disk_space,
            git::worktree_cache::worktree_cache_refresh,
            git::worktree::create_worktree,
            git::worktree::remove_worktree,
            git::worktree::checkout_pr,
            git::worktree::open_in_terminal,
            git::worktree::open_in_editor,
            git::worktree::reveal_in_file_manager,
            git::worktree::launch_claude_in_terminal,
            git::commands::git_fetch,
            git::commands::git_checkout,
            git::commands::git_current_branch,
            git::commands::discover_repos,
            git::commands::scan_repos_under,
            git::commands::resolve_repo_path,
            git::commands::run_gh_command,
            git::worktree_changes::list_worktree_changes,
            git::worktree_changes::diff_worktree_vs_head,
            git::worktree_changes::diff_worktree_vs_base,
            // Window
            platform::window::show_setup_wizard,
            platform::window::open_pr_detail_window,
            platform::window::open_whats_new_window,
            platform::window::resize_flyout,
            flyout::toast::show_flyout_toast,
            // Process
            git::process::launch_agent_session,
            git::process::get_active_sessions,
            git::process::kill_session,
            // Cache
            cache::cache_init,
            cache::cache_load_prs,
            cache::cache_save_prs,
            cache::cache_cleanup,
            cache::cache_save_tab_data,
            cache::cache_load_tab_data,
            cache::cache_save_etags,
            cache::cache_load_etags,
            cache::cache_load_sql_schema,
            cache::cache_save_sql_schema,
            // Maintenance
            maintenance::clear_cache,
            maintenance::get_cache_size,
            maintenance::reset_all_settings,
            maintenance::estimate_worktree_prune_size,
            maintenance::run_self_test,
            // SQL
            runtime::runtime_visibility,
            sql::execute_sql_query,
            sql::cancel_sql_query,
            sql::test_sql_connection,
            sql::fetch_sql_schema,
            sql::snippets::sql_snippets_list,
            sql::snippets::sql_snippets_save,
            sql::snippets::sql_snippets_delete,
            // Keychain
            keychain::get_credential,
            keychain::set_credential,
            keychain::delete_credential,
            // Updater
            updater::check_for_update,
            updater::download_update,
            updater::restart_to_apply_update,
            // Headless and interactive agent providers
            agents::run_headless_prompt,
            agents::agent_provider_availability,
            t3::commands::t3_probe,
            t3::commands::t3_pair,
            t3::commands::t3_pair_local,
            t3::commands::t3_unpair,
            t3::commands::t3_snapshot,
            t3::commands::t3_thread_detail,
            t3::commands::t3_first_user_messages,
            t3::commands::t3_conversation_references,
            t3::commands::t3_show_thread,
            t3::commands::t3_environment,
            t3::commands::t3_thread_last_message,
            t3::commands::t3_catalogue,
            t3::commands::t3_launch_thread,
            t3::commands::t3_respond,
            t3::commands::t3_send_message,
            t3::commands::t3_settle,
            t3::commands::t3_open_pr_thread,
            t3::commands::t3_list_branches,
            t3::commands::t3_list_sessions,
            // Related CI failures
            ci_failures::commands::ci_read_job_log,
            ci_failures::commands::ci_sanitize_texts,
            ci_failures::store::commands::ci_record,
            ci_failures::store::commands::ci_known_occurrences,
            ci_failures::store::commands::ci_load_scope,
            ci_failures::store::commands::ci_load_pr,
            ci_failures::store::commands::ci_load_group,
            ci_failures::store::commands::ci_merge_groups,
            ci_failures::store::commands::ci_split_fingerprint,
            ci_failures::store::commands::ci_dismiss_candidate,
            ci_failures::store::commands::ci_set_candidate_verdict,
            ci_failures::store::commands::ci_set_group,
            ci_failures::store::commands::ci_claim,
            ci_failures::store::commands::ci_update_claim,
            ci_failures::store::commands::ci_claim_event,
            ci_failures::store::commands::ci_usage,
            ci_failures::store::commands::ci_count_usage,
            ci_failures::store::commands::ci_branch_watch,
            ci_failures::store::commands::ci_set_branch_watch,
            ci_failures::store::commands::ci_retention,
            ci_failures::store::commands::ci_clear,
            ci_failures::store::commands::ci_store_info,
            // Azure DevOps HTTP proxy (CORS bypass)
            ado::ado_fetch,
            // Full-text search
            content_search::search_content,
            // Activity journal
            activity::commands::activity_open_source,
            activity::commands::activity_sources,
            activity::commands::activity_retire_source,
            activity::commands::activity_commit,
            activity::commands::activity_list,
            activity::commands::activity_counts,
            activity::commands::activity_mark,
            activity::commands::activity_restore,
            activity::commands::activity_outbox_take,
            activity::commands::activity_outbox_ack,
            activity::commands::activity_clear,
            activity::commands::activity_export,
            activity::commands::activity_prune,
            activity::commands::activity_store_info,
            activity::push::activity_push_target,
            activity::push::activity_push_save,
            activity::push::activity_push_test,
            activity::commands::activity_read_since,
            // BorgDock for iPhone
            phone_link::phone_link_start,
            phone_link::phone_link_poll,
            phone_link::phone_link_state,
            phone_link::phone_link_unlink,
            phone_link::phone_link_send_reads,
            phone_link::phone_link_reads_since,
            platform::taskbar::set_taskbar_badge,
            // Workstreams
            // Notes vault
            notes::commands::notes_folder_path,
            notes::commands::notes_list,
            notes::commands::notes_read_many,
            notes::commands::notes_write,
            notes::commands::notes_rename,
            notes::commands::notes_trash,
            workstreams::commands::workstreams_folder_path,
            workstreams::commands::workstreams_list,
            workstreams::commands::workstreams_read,
            workstreams::commands::workstreams_write,
            workstreams::commands::workstreams_trash,
            workstreams::commands::workstreams_trashed,
            workstreams::commands::workstreams_restore,
            workstreams::commands::workstreams_restore_backup,
            workstreams::commands::workstreams_device_name,
            workstreams::commands::workstreams_copy_into,
            workstreams::commands::workstreams_export_file,
            workstreams::commands::workstreams_import_file,
        ]
    };
}

pub fn run() {
    install_panic_hook();

    // Debug builds: Debug level, plus the webview console so DevTools sees
    // Rust logs. Release builds: Info level and NO webview target — every
    // webview log line is an IPC round-trip into the renderer, which at
    // Debug level meant dozens of hops per poll cycle and per git call.
    let log_targets = vec![
        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Folder {
            path: log_dir(),
            file_name: Some("borgdock".into()),
        }),
        // Stream to stdout so `cargo tauri dev` shows live logs.
        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
        #[cfg(debug_assertions)]
        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
    ];
    #[cfg(debug_assertions)]
    let log_level = log::LevelFilter::Debug;
    #[cfg(not(debug_assertions))]
    let log_level = log::LevelFilter::Info;

    let log_plugin = tauri_plugin_log::Builder::new()
        .targets(log_targets)
        .max_file_size(5_000_000)
        .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(5))
        .level(log_level)
        // Silence noisy third-party crates that drown out our own logs.
        .level_for("hyper", log::LevelFilter::Info)
        .level_for("reqwest", log::LevelFilter::Info)
        .level_for("tao", log::LevelFilter::Info)
        .level_for("wry", log::LevelFilter::Info)
        .build();

    let builder = tauri::Builder::default()
        .on_page_load(|webview, _| platform::browser_shortcuts::disable(webview))
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. }
                    if window.label() == "main"
                        || platform::hotkey::is_reusable_tool_window(window.label()) =>
                {
                    api.prevent_close();
                    let _ = window.hide();
                }
                // Once a window is truly gone, forget its first-reveal flag so
                // a future window reusing the same label (e.g. a reopened
                // pr-detail / settings) reveals again instead of staying
                // hidden. See platform::window::revealed().
                tauri::WindowEvent::Destroyed => {
                    crate::platform::window::mark_window_destroyed(window.label());
                    window
                        .state::<platform::responsiveness::Responsiveness>()
                        .forget(window.label());
                }
                _ => {}
            }
            if matches!(
                event,
                tauri::WindowEvent::Focused(_)
                    | tauri::WindowEvent::CloseRequested { .. }
                    | tauri::WindowEvent::Destroyed
            ) {
                let app = window.app_handle();
                let _ = app.emit(
                    "runtime-visibility",
                    runtime::RuntimeVisibility(runtime::runtime_visibility(app.clone())),
                );
            }
        })
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        // Second launch (autostart + manual, or a relaunch while the old
        // process is still alive): the plugin exits the new instance and
        // calls this in the surviving one. Bring the main window forward so
        // the user sees *something* happen instead of a silent no-op.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            log::info!("single-instance: second launch detected, focusing main window");
            let app_handle = app.clone();
            let _ = app.run_on_main_thread(move || {
                platform::window::show_or_focus_main_sync(&app_handle);
            });
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(log_plugin)
        .plugin(platform::responsiveness::plugin())
        .plugin(tauri_plugin_os::init())
        .manage(ProcessState::default())
        .manage(platform::responsiveness::Responsiveness::default())
        .manage(updater::PendingUpdate::<updater::DownloadedUpdate>::default())
        .manage(PrCache::default())
        .manage(ci_failures::store::CiStore::default())
        .manage(activity::ActivityDb::default())
        .manage(sql::SqlQueries::default())
        .manage(t3::commands::T3Sessions::default())
        .manage(platform::flyout_cache::FlyoutCache {
            data: Mutex::new(None),
        })
        .manage(git::worktree_cache::WorktreeCache::default());

    builder
        .setup(move |app| {
            let dispatcher = app.handle().clone();
            app.manage(platform::deferred_actions::DeferredActions::new(
                move |action| {
                    dispatcher
                        .run_on_main_thread(action)
                        .map_err(|e| e.to_string())
                },
                |key, error| log::error!("window action[{key}]: {error}"),
                platform::window::MAIN_THREAD_TIMEOUT,
            )?);
            platform::responsiveness::start(app.handle().clone());
            platform::tray::setup_tray(app)?;
            activity::push::start(app.handle().clone());
            phone_link::start();
            platform::tray::start_initializing_animation(app.handle().clone());

            // Window geometry store: load once, register, spawn flusher,
            // then wire main on the GUI thread so it picks up restored
            // geometry. Main is declared in tauri.conf.json (built before
            // setup runs), so we look it up by label.
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("app_data_dir unavailable: {e}"))?;
            std::fs::create_dir_all(&app_data_dir)
                .map_err(|e| format!("create app data dir: {e}"))?;

            let geometry_store = std::sync::Arc::new(
                crate::platform::window_geometry::WindowGeometryStore::load(&app_data_dir),
            );
            geometry_store.clone().spawn_flusher();
            app.manage(geometry_store.clone());

            if let Some(main_win) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                app_handle
                    .clone()
                    .run_on_main_thread(move || {
                        crate::platform::window_geometry::persist_window_geometry(
                            &app_handle,
                            &main_win,
                            "main",
                        );
                    })
                    .map_err(|e| format!("dispatch persist_window_geometry for main: {e}"))?;
            } else {
                log::error!(
                    "setup: main window not found at startup; geometry persistence skipped"
                );
            }

            // The removed File Palette kept its file index here.
            tauri::async_runtime::spawn_blocking(|| {
                let _ = std::fs::remove_file(crate::app_data::directory().join("fileindex.db"));
            });

            // Register the fixed palette + SQL hotkeys (Ctrl+F7/F8/F9/F10)
            // once, at setup. These are code-defined and must not be re-
            // bound on every settings change — see register_fixed_hotkeys
            // for the rationale.
            if let Err(e) = platform::hotkey::register_fixed_hotkeys(app.handle()) {
                log::error!("register_fixed_hotkeys failed: {e}");
            }

            // Warm the worktree cache (per-repo `git worktree list`, concurrent)
            // so the palette and PR cards render from a snapshot instead of
            // spawning git on open. Also runs a slow 5-min revalidation loop.
            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    git::worktree_cache::start_background_refresh(app_handle).await;
                });
            }

            // The main window is built invisible (visible: false in
            // tauri.conf.json) and revealed by the React app calling
            // `window_ready` after first paint. No off-screen parking needed
            // now that the window is a regular floating frame.

            Ok(())
        })
        .invoke_handler(app_commands!(generate_handler))
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(
                event,
                tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
            ) {
                if let Some(store) = app.try_state::<
                    std::sync::Arc<crate::platform::window_geometry::WindowGeometryStore>,
                >() {
                    if let Err(error) = store.flush_now() {
                        log::error!("exit: geometry flush failed: {error}");
                    }
                }
                #[cfg(target_os = "windows")]
                crate::platform::click_outside::uninstall_hook();
            }
            if matches!(event, tauri::RunEvent::ExitRequested { code: Some(0), .. }) {
                updater::install_pending_update(app);
            }
        });
}

#[cfg(test)]
fn command_bindings() -> tauri_specta::Builder<tauri::Wry> {
    use tauri_specta::collect_commands;
    tauri_specta::Builder::new()
        .dangerously_cast_bigints_to_number()
        .events(tauri_specta::collect_events![
            runtime::RuntimeVisibility,
            t3::commands::T3SessionsUpdated,
            ci_failures::store::commands::CiFailuresChanged,
            activity::commands::ActivityChanged
        ])
        .commands(app_commands!(collect_commands))
}

#[cfg(test)]
mod binding_tests {
    #[test]
    fn export_commands() {
        let temporary = tempfile::tempdir().expect("temporary bindings directory");
        let output = temporary.path().join("commands.ts");
        super::command_bindings()
            .export(specta_typescript::Typescript::default(), &output)
            .expect("export Tauri command contracts");
        let generated = std::fs::read_to_string(output)
            .unwrap()
            .lines()
            .map(str::trim_end)
            .collect::<Vec<_>>()
            .join("\n");
        let generated = format!("{}\n", generated.trim_end());
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../src/generated/commands.ts");
        if std::env::var("BORGDOCK_UPDATE_BINDINGS").as_deref() == Ok("1") {
            std::fs::write(path, generated).expect("write command contracts");
        } else {
            let committed = std::fs::read_to_string(path)
                .expect("run bun run bindings")
                .replace("\r\n", "\n");
            assert!(
                committed == generated,
                "Tauri contracts changed; run bun run bindings"
            );
        }
    }
}
