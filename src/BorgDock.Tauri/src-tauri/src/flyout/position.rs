#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FlyoutAnchor {
    BottomRight, // Windows
    TopRight,    // macOS, Linux (default)
}

pub fn default_anchor_for_os() -> FlyoutAnchor {
    if cfg!(target_os = "windows") {
        FlyoutAnchor::BottomRight
    } else {
        FlyoutAnchor::TopRight
    }
}

/// Compute the top-left physical position of the flyout window given the
/// monitor work area, flyout size, and anchor corner. `work_*` values
/// are in physical pixels. Returns `(x, y)` in physical pixels.
///
/// `chrome_offset` is the tray/indicator area height we leave clear
/// (taskbar on Windows, menu bar on macOS, indicator area on Linux).
pub fn compute_flyout_position(
    work_x: i32,
    work_y: i32,
    work_w: i32,
    work_h: i32,
    flyout_w: i32,
    flyout_h: i32,
    anchor: FlyoutAnchor,
    chrome_offset: i32,
) -> (i32, i32) {
    let x = work_x + work_w - flyout_w;
    let y = match anchor {
        FlyoutAnchor::BottomRight => work_y + work_h - chrome_offset - flyout_h,
        FlyoutAnchor::TopRight => work_y + chrome_offset,
    };
    (x, y)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bottom_right_places_flyout_above_taskbar() {
        let (x, y) = compute_flyout_position(
            0, 0, 1920, 1080, 412, 512, FlyoutAnchor::BottomRight, 48,
        );
        assert_eq!(x, 1920 - 412);
        assert_eq!(y, 1080 - 48 - 512);
    }

    #[test]
    fn top_right_places_flyout_below_menu_bar() {
        let (x, y) = compute_flyout_position(
            0, 0, 1920, 1080, 412, 512, FlyoutAnchor::TopRight, 28,
        );
        assert_eq!(x, 1920 - 412);
        assert_eq!(y, 28);
    }

    #[test]
    fn bottom_right_respects_nonzero_work_origin() {
        let (x, y) = compute_flyout_position(
            -1920, 0, 1920, 1080, 412, 512, FlyoutAnchor::BottomRight, 48,
        );
        assert_eq!(x, -412);
        assert_eq!(y, 1080 - 48 - 512);
    }

    #[test]
    fn default_anchor_is_os_specific() {
        let a = default_anchor_for_os();
        if cfg!(target_os = "windows") {
            assert_eq!(a, FlyoutAnchor::BottomRight);
        } else {
            assert_eq!(a, FlyoutAnchor::TopRight);
        }
    }
}
