pub mod auth;
pub mod cache;
pub mod git;
pub mod platform;
pub mod settings;

use cache::PrCache;
use git::process::ProcessState;
use std::collections::HashMap;
use std::sync::Mutex;

pub fn run() {
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
        .plugin(tauri_plugin_log::Builder::new().build())
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
            // Process
            git::process::launch_claude_code,
            git::process::get_active_sessions,
            git::process::kill_session,
            // Cache
            cache::cache_init,
            cache::cache_load_prs,
            cache::cache_save_prs,
            cache::cache_cleanup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
