use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToastAction {
    pub label: String,
    /// One of: "open-pr" | "fix-pr" | "monitor-pr" | "open-url" | "merge-pr" | "start-review"
    pub action: String,
    /// Optional URL payload for "open-url" / "start-review" actions.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToastPayload {
    /// Stable id so React can dedupe / animate. Use pr-key + event-type.
    pub id: String,
    /// "info" | "success" | "warning" | "error"
    pub severity: String,
    pub title: String,
    pub body: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pr_owner: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pr_repo: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pr_number: Option<u32>,
    #[serde(default)]
    pub actions: Vec<ToastAction>,
}

/// Show the flyout in toast mode and emit the payload to the flyout webview.
/// Idempotent: if the flyout is already shown (glance or toast), we emit the
/// payload and let the React app decide how to render it (stack, banner).
#[tauri::command]
pub async fn show_flyout_toast(
    app: tauri::AppHandle,
    payload: ToastPayload,
) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let app_for_run = app.clone();

    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            let win = app_for_run
                .get_webview_window("flyout")
                .ok_or_else(|| "flyout window not built".to_string())?;
            if !win.is_visible().unwrap_or(false) {
                crate::platform::window::position_flyout_near_tray(&win, 340.0, 170.0)?;
                win.show().map_err(|e| e.to_string())?;
                let _ = win.set_always_on_top(true);
            }
            app_for_run
                .emit_to("flyout", "flyout-toast", &payload)
                .map_err(|e| e.to_string())?;
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;

    rx.await.map_err(|e| e.to_string())?
}
