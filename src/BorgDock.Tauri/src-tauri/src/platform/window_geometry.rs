use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

pub type GeometryMap = HashMap<String, Geometry>;

/// Read the geometry file. Returns an empty map if the file is missing,
/// unreadable, or contains invalid JSON. We never want a corrupted file
/// to keep the user from launching — worst case is windows fall back to
/// default placement.
pub fn read_or_empty(path: &Path) -> GeometryMap {
    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(_) => return GeometryMap::new(),
    };
    serde_json::from_slice(&bytes).unwrap_or_default()
}

/// Write atomically: serialize to a sibling `.tmp`, then `rename` over the
/// target. Crash mid-write leaves the previous valid file intact. Same
/// approach `settings::save_settings_internal` uses.
pub fn write_atomic(path: &Path, map: &GeometryMap) -> std::io::Result<()> {
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_vec_pretty(map).map_err(std::io::Error::other)?;
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Geometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

/// Map a window label to its persistence "kind". Multiple windows of the
/// same kind (e.g. several `pr-detail-*` tabs) share one geometry slot —
/// last to move/close wins. Static labels pass through unchanged.
pub fn kind_of(label: &str) -> &str {
    if label.starts_with("pr-detail-") {
        return "pr-detail";
    }
    if label.starts_with("file-viewer-") {
        return "file-viewer";
    }
    if label.starts_with("workitem-detail-") {
        return "workitem-detail";
    }
    label
}

/// A monitor's bounds in physical pixels: `(origin_x, origin_y, width, height)`.
pub type MonitorBounds = (i32, i32, u32, u32);

/// True if `(x, y)` lies inside any of the supplied monitors. Right and
/// bottom edges are exclusive (a window placed exactly at `mx + mw` is on
/// the next monitor over, not this one).
pub fn is_position_on_screen(pos: (i32, i32), monitors: &[MonitorBounds]) -> bool {
    let (x, y) = pos;
    monitors.iter().any(|&(mx, my, mw, mh)| {
        x >= mx && x < mx + mw as i32 && y >= my && y < my + mh as i32
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kind_of_static_labels_pass_through() {
        assert_eq!(kind_of("main"), "main");
        assert_eq!(kind_of("sql"), "sql");
        assert_eq!(kind_of("file-palette"), "file-palette");
        assert_eq!(kind_of("agent-overview"), "agent-overview");
    }

    #[test]
    fn kind_of_dynamic_labels_collapse() {
        assert_eq!(kind_of("pr-detail-Gomocha-FSP-fsp-horizon-1571"), "pr-detail");
        assert_eq!(kind_of("file-viewer-abc123def456"), "file-viewer");
        assert_eq!(kind_of("workitem-detail-7777"), "workitem-detail");
    }

    #[test]
    fn position_inside_a_monitor_is_valid() {
        let monitors = vec![(0, 0, 1920, 1080)];
        assert!(is_position_on_screen((100, 100), &monitors));
    }

    #[test]
    fn position_off_all_monitors_is_invalid() {
        let monitors = vec![(0, 0, 1920, 1080)];
        assert!(!is_position_on_screen((3000, 100), &monitors));
        assert!(!is_position_on_screen((-100, 100), &monitors));
        assert!(!is_position_on_screen((100, -100), &monitors));
        assert!(!is_position_on_screen((1920, 100), &monitors)); // boundary: right edge exclusive
    }

    #[test]
    fn position_on_secondary_monitor_is_valid() {
        // Primary at (0, 0), secondary to its right at (1920, 0)
        let monitors = vec![(0, 0, 1920, 1080), (1920, 0, 1920, 1080)];
        assert!(is_position_on_screen((2500, 500), &monitors));
    }

    #[test]
    fn write_atomic_then_read_or_empty_roundtrips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("window-geometry.json");

        let mut map = GeometryMap::new();
        map.insert(
            "main".to_string(),
            Geometry { x: 100, y: 200, width: 800, height: 600, maximized: false },
        );
        map.insert(
            "sql".to_string(),
            Geometry { x: -50, y: 300, width: 1200, height: 800, maximized: true },
        );

        write_atomic(&path, &map).unwrap();
        assert_eq!(read_or_empty(&path), map);
    }

    #[test]
    fn read_or_empty_on_missing_file_returns_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nonexistent.json");
        assert_eq!(read_or_empty(&path), GeometryMap::new());
    }

    #[test]
    fn read_or_empty_on_garbage_returns_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("garbage.json");
        std::fs::write(&path, b"not valid json").unwrap();
        assert_eq!(read_or_empty(&path), GeometryMap::new());
    }
}
