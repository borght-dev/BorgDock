use serde::{Deserialize, Serialize};

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
}
