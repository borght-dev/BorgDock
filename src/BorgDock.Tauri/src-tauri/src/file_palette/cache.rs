use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

pub struct FileIndexCache {
    pub conn: Arc<Mutex<Option<Connection>>>,
    pub in_flight: Arc<Mutex<HashSet<PathBuf>>>,
}

/// Canonicalize a root path for use as the cache key. Forward slashes only,
/// no trailing slash, and lower-case on Windows so path-case differences
/// between callers collapse to one row.
pub fn normalize_root(raw: &str) -> String {
    let mut s = raw.replace('\\', "/");
    while s.ends_with('/') && s.len() > 1 {
        s.pop();
    }
    if cfg!(target_os = "windows") {
        s = s.to_ascii_lowercase();
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_forward_slashes_backslashes() {
        assert_eq!(normalize_root("C:\\repo\\src"), "c:/repo/src");
        assert_eq!(normalize_root("/home/user/repo"), "/home/user/repo");
    }

    #[test]
    fn normalize_strips_trailing_slash() {
        assert_eq!(normalize_root("/repo/"), "/repo");
        assert_eq!(normalize_root("C:\\repo\\"), "c:/repo");
    }

    #[test]
    fn normalize_single_slash_kept() {
        assert_eq!(normalize_root("/"), "/");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn normalize_windows_is_lowercased() {
        assert_eq!(normalize_root("E:\\PRDock\\SRC"), "e:/prdock/src");
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn normalize_unix_preserves_case() {
        assert_eq!(normalize_root("/Home/User/Repo"), "/Home/User/Repo");
    }
}
