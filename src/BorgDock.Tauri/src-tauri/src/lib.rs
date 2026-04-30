pub mod ado;
pub mod agent_overview;
pub mod auth;
pub mod cache;
pub mod claude_api;
pub mod file_palette;
pub mod flyout;
pub mod git;
pub mod keychain;
pub mod platform;
pub mod settings;
pub mod sql;
pub mod updater;

use cache::PrCache;
use git::process::ProcessState;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Manager;

fn log_dir() -> std::path::PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("BorgDock")
        .join("logs")
}

/// Write panic info to a dedicated file synchronously, then chain to the
/// default hook. Release builds use `panic = "abort"`, so `log::error!` alone
/// can lose the message before the buffered writer flushes — a direct
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

        // Best-effort: also route through the log plugin (may or may not flush).
        log::error!("{}", message.trim_end());

        // Stderr for `cargo tauri dev`.
        eprintln!("{message}");

        default_hook(info);
    }));
}

pub fn run() {
    install_panic_hook();

    let log_plugin = tauri_plugin_log::Builder::new()
        .targets([
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Folder {
                path: log_dir(),
                file_name: Some("borgdock".into()),
            }),
            // Also stream to stdout so `cargo tauri dev` shows live logs,
            // and to the webview console so frontend DevTools sees them.
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
        ])
        .max_file_size(5_000_000)
        .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
        .level(log::LevelFilter::Debug)
        // Silence noisy third-party crates that drown out our own logs.
        .level_for("hyper", log::LevelFilter::Info)
        .level_for("reqwest", log::LevelFilter::Info)
        .level_for("tao", log::LevelFilter::Info)
        .level_for("wry", log::LevelFilter::Info)
        .build();

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(log_plugin)
        .plugin(tauri_plugin_os::init())
        .manage(ProcessState {
            processes: Mutex::new(HashMap::new()),
        })
        .manage(PrCache {
            conn: Mutex::new(None),
        })
        .manage(platform::flyout_cache::FlyoutCache {
            data: Mutex::new(None),
        })
        .manage(file_palette::cache::FileIndexCache {
            conn: std::sync::Arc::new(std::sync::Mutex::new(None)),
            in_flight: std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashSet::new())),
        })
        .manage(crate::agent_overview::store::SessionStore::default())
        .manage(crate::agent_overview::cwd_resolver::CwdCache::default())
        .setup(|app| {
            platform::tray::setup_tray(app)?;
            platform::tray::start_initializing_animation(app.handle().clone());

            if let Err(e) = platform::window::build_flyout_window(&app.handle().clone()) {
                log::error!("build_flyout_window failed: {e}");
            }

            let file_cache_state = app.state::<file_palette::cache::FileIndexCache>();
            file_palette::cache::init(&file_cache_state);

            // Agent Overview — start OTLP receiver + bootstrap if user has
            // opted in (Settings.agent_overview.enabled). Otherwise it stays
            // dormant until the user enables it via the Settings UI.
            {
                let store = app.state::<crate::agent_overview::store::SessionStore>().inner().clone();
                let cwd_cache = app.state::<crate::agent_overview::cwd_resolver::CwdCache>().inner().clone();
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    use crate::agent_overview::{bootstrap, cwd_resolver, otlp_server, store as st};
                    use tauri::Emitter;
                    use tokio::sync::mpsc::unbounded_channel;

                    let settings = crate::settings::load_settings_internal().ok();
                    let cfg = settings.as_ref().map(|s| s.agent_overview.clone()).unwrap_or_default();
                    if !cfg.enabled {
                        log::info!("agent_overview: disabled, skipping startup");
                        return;
                    }

                    // Bootstrap from filesystem
                    let (delta_tx, mut delta_rx) = unbounded_channel();
                    if let Some(root) = cwd_resolver::default_projects_root() {
                        let n = bootstrap::bootstrap_known_sessions(
                            &root, &store, &delta_tx,
                            std::time::Duration::from_secs(cfg.history_retention_seconds.into()),
                        );
                        log::info!("agent_overview: bootstrapped {n} sessions");
                    }

                    // Forward deltas to the frontend
                    let app_for_emit = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        while let Some(delta) = delta_rx.recv().await {
                            let _ = app_for_emit.emit_to(
                                "agent-overview",
                                "agent-sessions-changed",
                                &delta,
                            );
                        }
                    });

                    // OTLP receiver
                    let (events_tx, mut events_rx) = unbounded_channel();
                    let (listener, port) = match otlp_server::try_bind(4318).await {
                        Ok(v) => v,
                        Err(e) => {
                            log::error!("agent_overview: failed to bind OTLP port: {e}");
                            return;
                        }
                    };
                    log::info!("agent_overview: OTLP listening on 127.0.0.1:{port}");
                    let router = otlp_server::build_router(otlp_server::ServerState { events_tx });
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = axum::serve(listener, router).await {
                            log::error!("agent_overview: server exited: {e}");
                        }
                    });

                    // Event consumer + 1Hz ticker
                    let store_for_loop = store.clone();
                    let cwd_for_loop = cwd_cache.clone();
                    let delta_for_loop = delta_tx.clone();
                    let thresholds = st::StoreThresholds {
                        idle_after: std::time::Duration::from_secs(cfg.idle_threshold_seconds.into()),
                        ended_after: std::time::Duration::from_secs(cfg.ended_threshold_seconds.into()),
                        finished_to_awaiting_after: std::time::Duration::from_secs(30),
                        history_retention: std::time::Duration::from_secs(cfg.history_retention_seconds.into()),
                    };
                    tauri::async_runtime::spawn(async move {
                        let projects_root = cwd_resolver::default_projects_root();
                        let mut tick = tokio::time::interval(std::time::Duration::from_secs(1));
                        loop {
                            tokio::select! {
                                Some(evt) = events_rx.recv() => {
                                    let cwd_info = projects_root.as_ref()
                                        .and_then(|r| cwd_resolver::resolve_cwd(&evt.session_id, &cwd_for_loop, r));
                                    store_for_loop.ingest_event(evt, cwd_info, &delta_for_loop, std::time::Instant::now());
                                }
                                _ = tick.tick() => {
                                    store_for_loop.run_tick(thresholds, &delta_for_loop, std::time::Instant::now());
                                }
                            }
                        }
                    });
                });
            }

            // Register the fixed palette + SQL hotkeys (Ctrl+F7/F8/F9/F10)
            // once, at setup. These are code-defined and must not be re-
            // bound on every settings change — see register_fixed_hotkeys
            // for the rationale.
            if let Err(e) = platform::hotkey::register_fixed_hotkeys(app.handle()) {
                log::error!("register_fixed_hotkeys failed: {e}");
            }

            // Park the main window off-screen at 1×1. This keeps the React
            // tree alive (WebView2 throttles JS in hidden windows on Windows,
            // which would slow the polling loop) without showing the sidebar
            // to the user on startup. The tray icon / hotkey / flyout are
            // the entry points that call show_main_window to reveal it.
            if let Err(e) = platform::window::park_main_offscreen(&app.handle().clone()) {
                log::error!("park_main_offscreen failed: {e}");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Settings
            settings::load_settings,
            settings::save_settings,
            // Auth
            auth::gh_cli_token,
            auth::validate_pat,
            auth::check_github_auth,
            auth::ado::az_cli_available,
            auth::ado::ado_resolve_auth_header,
            // Platform
            platform::window::position_sidebar,
            platform::window::toggle_sidebar,
            platform::window::hide_sidebar,
            platform::window::hide_flyout,
            platform::work_area::reserve_work_area,
            platform::work_area::restore_work_area,
            platform::hotkey::register_user_hotkeys,
            platform::hotkey::unregister_hotkey,
            platform::hotkey::palette_ready,
            platform::tray::update_tray_tooltip,
            platform::tray::update_tray_icon,
            platform::flyout_cache::cache_flyout_data,
            platform::flyout_cache::get_flyout_data,
            platform::theme::get_system_theme,
            platform::logs::get_log_folder,
            platform::logs::open_log_folder,
            // Git
            git::worktree::list_worktrees,
            git::worktree::list_worktrees_bare,
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
            git::commands::resolve_repo_path,
            git::commands::run_gh_command,
            git::diff::git_file_diff,
            git::diff::git_changed_files,
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
            git::process::launch_claude_code,
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
            // SQL
            sql::execute_sql_query,
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
            updater::download_and_install_update,
            // Claude API
            claude_api::generate_pr_summary,
            // Azure DevOps HTTP proxy (CORS bypass)
            ado::ado_fetch,
            // File palette
            file_palette::read_file::read_text_file,
            file_palette::files::list_root_files,
            file_palette::content_search::search_content,
            file_palette::windows::open_file_viewer_window,
            // Agent Overview
            agent_overview::commands::list_agent_sessions,
            agent_overview::commands::set_agent_overview_enabled,
            agent_overview::commands::disable_agent_overview_telemetry,
            agent_overview::window::open_agent_overview_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
