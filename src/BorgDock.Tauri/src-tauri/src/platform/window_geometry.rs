use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};
use tokio::sync::Notify;

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

/// Minimum size (in *logical* CSS pixels) a saved geometry must clear before
/// it's applied verbatim. Older geometry below this floor — typically saved
/// before a layout change widened the window's content — gets stretched up
/// to the floor on restore so the window opens at a usable size.
///
/// Keep "main" in sync with `tauri.conf.json`'s `minWidth`/`minHeight` for
/// the main window. Other kinds fall back to no clamp here and rely on the
/// `min_inner_size` configured by their builders.
fn min_logical_size_for_kind(kind: &str) -> Option<(f64, f64)> {
    match kind {
        "main" => Some((1500.0, 900.0)),
        _ => None,
    }
}

/// In-memory cache + on-disk JSON store for window geometry. Lives behind
/// `Arc<...>` and is registered as Tauri-managed state in `setup()`.
/// Mutations (`put`) are non-blocking — they signal a debounced flusher
/// task that writes the file ~250 ms after the last change. `flush_now()`
/// is synchronous and used on `CloseRequested` so the close path doesn't
/// lose the final geometry.
pub struct WindowGeometryStore {
    map: Mutex<GeometryMap>,
    notify: Notify,
    path: PathBuf,
}

impl WindowGeometryStore {
    /// Read the on-disk file once and seed the cache. Missing/corrupt file
    /// → empty cache (intentional: never block launch on geometry IO).
    pub fn load(app_data_dir: &Path) -> Self {
        let path = app_data_dir.join("window-geometry.json");
        Self {
            map: Mutex::new(read_or_empty(&path)),
            notify: Notify::new(),
            path,
        }
    }

    pub fn get(&self, kind: &str) -> Option<Geometry> {
        self.map.lock().ok()?.get(kind).copied()
    }

    pub fn put(&self, kind: String, geom: Geometry) {
        if let Ok(mut map) = self.map.lock() {
            map.insert(kind, geom);
        }
        self.notify.notify_one();
    }

    pub fn flush_now(&self) -> std::io::Result<()> {
        let snapshot = self
            .map
            .lock()
            .map_err(|_| std::io::Error::other("geometry map mutex poisoned"))?
            .clone();
        write_atomic(&self.path, &snapshot)
    }

    /// Spawn the background flusher. Pulls work via `Notify`; debounces by
    /// sleeping 250 ms after each wake before writing. Continuous drag
    /// (hundreds of `Moved` events) collapses into a single write at the
    /// end. Idempotent flushes are cheap so we don't track dirty state.
    pub fn spawn_flusher(self: Arc<Self>) {
        tauri::async_runtime::spawn(async move {
            loop {
                self.notify.notified().await;
                tokio::time::sleep(Duration::from_millis(250)).await;
                if let Err(e) = self.flush_now() {
                    log::error!("window-geometry: debounced flush failed: {e}");
                }
            }
        });
    }
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

/// Apply any saved geometry to `win`, then attach a listener that captures
/// future moves/resizes/closes back into the store. Called from each
/// window-creating builder right after `.build()` succeeds.
///
/// Restoration only fires when the saved `(x, y)` lies within at least one
/// currently-connected monitor — protects against waking up with a window
/// stranded on a now-disconnected display.
///
/// MUST be called from the main thread (set_position / set_size /
/// is_maximized / available_monitors all have GUI-thread affinity on
/// Windows). Every existing window-builder site we wire into already runs
/// inside `app.run_on_main_thread`.
pub fn persist_window_geometry(app: &AppHandle, win: &WebviewWindow, label: &str) {
    let kind = kind_of(label).to_string();
    let store = match app.try_state::<Arc<WindowGeometryStore>>() {
        Some(s) => s.inner().clone(),
        None => {
            log::error!("persist_window_geometry[{label}]: store not registered in Tauri state");
            return;
        }
    };

    if let Some(g) = store.get(&kind) {
        let monitors: Vec<MonitorBounds> = app
            .available_monitors()
            .map(|ms| {
                ms.into_iter()
                    .map(|m| {
                        let p = m.position();
                        let s = m.size();
                        (p.x, p.y, s.width, s.height)
                    })
                    .collect()
            })
            .unwrap_or_default();

        if is_position_on_screen((g.x, g.y), &monitors) {
            let (mut width, mut height) = (g.width, g.height);
            if let Some((min_lw, min_lh)) = min_logical_size_for_kind(&kind) {
                let scale = win.scale_factor().unwrap_or(1.0);
                let min_w_phys = (min_lw * scale).round() as u32;
                let min_h_phys = (min_lh * scale).round() as u32;
                if width < min_w_phys || height < min_h_phys {
                    log::info!(
                        "persist_window_geometry[{label}]: clamping saved size {}x{} up to min {}x{} (scale={})",
                        width, height, min_w_phys, min_h_phys, scale
                    );
                    width = width.max(min_w_phys);
                    height = height.max(min_h_phys);
                }
            }
            let _ = win.set_size(tauri::Size::Physical(PhysicalSize::new(width, height)));
            let _ = win.set_position(tauri::Position::Physical(PhysicalPosition::new(g.x, g.y)));
            if g.maximized {
                let _ = win.maximize();
            }
            log::info!("persist_window_geometry[{label}]: restored kind={kind}");
        } else {
            log::info!(
                "persist_window_geometry[{label}]: saved geometry off-screen, falling back to default placement"
            );
        }
    }

    let win_for_handler = win.clone();
    let store_for_handler = store.clone();
    let kind_for_handler = kind.clone();

    win.on_window_event(move |event| match event {
        tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
            if let Some(g) = capture(&win_for_handler) {
                store_for_handler.put(kind_for_handler.clone(), g);
            }
        }
        tauri::WindowEvent::CloseRequested { .. } => {
            if let Some(g) = capture(&win_for_handler) {
                store_for_handler.put(kind_for_handler.clone(), g);
                if let Err(e) = store_for_handler.flush_now() {
                    log::error!("persist_window_geometry[close]: flush failed: {e}");
                }
            }
        }
        _ => {}
    });
}

fn capture(win: &WebviewWindow) -> Option<Geometry> {
    let pos = win.outer_position().ok()?;
    let size = win.outer_size().ok()?;
    let maximized = win.is_maximized().unwrap_or(false);
    Some(Geometry {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        maximized,
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
    fn min_logical_size_only_set_for_main() {
        assert_eq!(min_logical_size_for_kind("main"), Some((1500.0, 900.0)));
        assert!(min_logical_size_for_kind("sql").is_none());
        assert!(min_logical_size_for_kind("pr-detail").is_none());
        assert!(min_logical_size_for_kind("file-palette").is_none());
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
