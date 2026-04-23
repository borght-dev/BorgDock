#[cfg(target_os = "windows")]
pub mod click_outside;
pub mod flyout_cache;
pub mod hotkey;
pub mod logs;
pub mod theme;
pub mod tray;
pub mod window;
pub mod work_area;

pub use hotkey::{register_user_hotkeys, unregister_hotkey};
pub use logs::{get_log_folder, open_log_folder};
pub use theme::get_system_theme;
pub use tray::setup_tray;
pub use window::{position_sidebar, toggle_sidebar};
pub use work_area::{reserve_work_area, restore_work_area};
