use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};
use tokio::sync::oneshot;

/// Bring a webview window to the foreground. On Windows, Win32's
/// anti-focus-stealing policy drops `set_focus()` when the calling process
/// isn't already foreground, so the new viewer silently ends up behind the
/// palette. A brief `always_on_top` flash forces the z-order up without
/// leaving the window pinned.
fn bring_to_front(win: &WebviewWindow) {
    let _ = win.unminimize();
    let _ = win.show();
    #[cfg(windows)]
    {
        let _ = win.set_always_on_top(true);
        let _ = win.set_always_on_top(false);
    }
    let _ = win.set_focus();
}

/// Viewer window label format: `file-viewer-<16 hex chars of blake3>`.
/// Stable per absolute path (normalized), so reopening the same file focuses
/// the existing window instead of creating a duplicate.
pub fn viewer_label_for(path: &str) -> String {
    let normalized = normalize_path(path);
    let hash = blake3::hash(normalized.as_bytes());
    format!("file-viewer-{}", hex16(&hash))
}

fn normalize_path(path: &str) -> String {
    path.replace('\\', "/")
        .trim_end_matches('/')
        .to_ascii_lowercase()
}

fn hex16(hash: &blake3::Hash) -> String {
    hash.to_hex().as_str()[..16].to_string()
}

#[tauri::command]
pub async fn open_file_viewer_window(
    app: tauri::AppHandle,
    path: String,
    baseline: Option<String>,
) -> Result<(), String> {
    let label = viewer_label_for(&path);
    let encoded = urlencoding::encode(&path).into_owned();
    let baseline_qs = baseline
        .as_deref()
        .filter(|b| !b.is_empty())
        .map(|b| format!("&baseline={}", urlencoding::encode(b)))
        .unwrap_or_default();

    let (tx, rx) = oneshot::channel::<Result<(), String>>();
    let app_for_run = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            if let Some(win) = app_for_run.get_webview_window(&label) {
                bring_to_front(&win);
                return Ok(());
            }
            let url = format!("file-viewer.html?path={encoded}{baseline_qs}");
            let win = WebviewWindowBuilder::new(
                &app_for_run,
                &label,
                tauri::WebviewUrl::App(url.into()),
            )
            .title("BorgDock File Viewer")
            .inner_size(1400.0, 860.0)
            .decorations(false)
            .always_on_top(false)
            .resizable(true)
            .skip_taskbar(false)
            .center()
            .focused(true)
            .build()
            .map_err(|e| format!("failed to build viewer window: {e}"))?;
            bring_to_front(&win);
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn label_is_stable_for_same_path() {
        let a = viewer_label_for("E:\\BorgDock\\src\\app.ts");
        let b = viewer_label_for("E:/BorgDock/src/app.ts");
        assert_eq!(a, b, "slash direction should not matter");
    }

    #[test]
    fn label_is_case_insensitive() {
        let a = viewer_label_for("E:/BorgDock/src/app.ts");
        let b = viewer_label_for("e:/borgdock/src/app.ts");
        assert_eq!(a, b);
    }

    #[test]
    fn different_paths_give_different_labels() {
        let a = viewer_label_for("E:/one.ts");
        let b = viewer_label_for("E:/two.ts");
        assert_ne!(a, b);
    }

    #[test]
    fn label_has_expected_prefix_and_length() {
        let label = viewer_label_for("/x");
        assert!(label.starts_with("file-viewer-"));
        assert_eq!(label.len(), "file-viewer-".len() + 16);
    }
}
