pub mod hotkey;
pub mod theme;
pub mod tray;
pub mod window;
pub mod work_area;

pub use hotkey::{register_hotkey, unregister_hotkey};
pub use theme::get_system_theme;
pub use tray::setup_tray;
pub use window::{hide_badge, position_sidebar, show_badge, toggle_sidebar};
pub use work_area::{reserve_work_area, restore_work_area};
