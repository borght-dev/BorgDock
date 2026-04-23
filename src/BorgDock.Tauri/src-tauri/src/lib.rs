pub mod ado;
pub mod auth;
pub mod cache;
pub mod claude_api;
pub mod file_palette;
pub mod git;
pub mod keychain;
pub mod notification;
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
        .setup(|app| {
            platform::tray::setup_tray(app)?;

            let file_cache_state = app.state::<file_palette::cache::FileIndexCache>();
            file_palette::cache::init(&file_cache_state);

            // Register the fixed palette + SQL hotkeys (Ctrl+F7/F8/F9/F10)
            // once, at setup. These are code-defined and must not be re-
            // bound on every settings change — see register_fixed_hotkeys
            // for the rationale.
            if let Err(e) = platform::hotkey::register_fixed_hotkeys(app.handle()) {
                log::error!("register_fixed_hotkeys failed: {e}");
            }

            // Show the main window from Rust to avoid relying on JS IPC
            // permissions / timing. The window starts hidden (visible: false
            // in tauri.conf.json) to prevent a blank flash on startup.
            // set_focus() is required so Windows registers focus tracking —
            // without it onFocusChanged never fires and clicking outside
            // won't trigger auto-hide.
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
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
            // Window
            platform::window::open_pr_detail_window,
            platform::window::open_whats_new_window,
            platform::window::set_badge_visible,
            platform::window::hide_badge,
            platform::window::resize_badge,
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
            // SQL
            sql::execute_sql_query,
            sql::test_sql_connection,
            // Keychain
            keychain::get_credential,
            keychain::set_credential,
            keychain::delete_credential,
            // Notification
            notification::send_notification,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
