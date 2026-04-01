pub mod auth;
pub mod cache;
pub mod git;
pub mod notification;
pub mod platform;
pub mod settings;
pub mod sql;
pub mod updater;

use cache::PrCache;
use git::process::ProcessState;
use std::collections::HashMap;
use std::sync::Mutex;

pub fn run() {
    let log_plugin = tauri_plugin_log::Builder::new()
        .target(tauri_plugin_log::Target::new(
            tauri_plugin_log::TargetKind::Folder {
                path: dirs::config_dir()
                    .unwrap_or_else(|| std::path::PathBuf::from("."))
                    .join("PRDock")
                    .join("logs"),
                file_name: Some("prdock".into()),
            },
        ))
        .max_file_size(5_000_000)
        .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
        .level(log::LevelFilter::Info)
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
        .setup(|app| {
            platform::tray::setup_tray(app)?;
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
            platform::window::show_badge,
            platform::window::hide_badge,
            platform::window::resize_badge,
            platform::work_area::reserve_work_area,
            platform::work_area::restore_work_area,
            platform::hotkey::register_hotkey,
            platform::hotkey::unregister_hotkey,
            platform::theme::get_system_theme,
            // Git
            git::worktree::list_worktrees,
            git::worktree::create_worktree,
            git::worktree::remove_worktree,
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
            // SQL
            sql::execute_sql_query,
            sql::test_sql_connection,
            // Notification
            notification::send_notification,
            // Updater
            updater::check_for_update,
            updater::download_and_install_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
