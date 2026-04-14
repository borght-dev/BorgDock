pub mod ado;
pub mod auth;
pub mod cache;
pub mod claude_api;
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

pub fn run() {
    let log_plugin = tauri_plugin_log::Builder::new()
        .targets([
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Folder {
                path: dirs::config_dir()
                    .unwrap_or_else(|| std::path::PathBuf::from("."))
                    .join("PRDock")
                    .join("logs"),
                file_name: Some("prdock".into()),
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
        .setup(|app| {
            platform::tray::setup_tray(app)?;

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
            // Platform
            platform::window::position_sidebar,
            platform::window::toggle_sidebar,
            platform::window::hide_sidebar,
            platform::window::hide_flyout,
            platform::work_area::reserve_work_area,
            platform::work_area::restore_work_area,
            platform::hotkey::register_hotkey,
            platform::hotkey::unregister_hotkey,
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
            git::worktree::open_in_terminal,
            git::worktree::open_in_editor,
            git::commands::git_fetch,
            git::commands::git_checkout,
            git::commands::git_current_branch,
            git::commands::discover_repos,
            git::commands::resolve_repo_path,
            git::commands::run_gh_command,
            // Window
            platform::window::open_pr_detail_window,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
