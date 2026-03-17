use tauri::{Emitter, Manager, WebviewWindow};

#[tauri::command]
pub fn position_sidebar(
    app: tauri::AppHandle,
    edge: String,
    width: u32,
) -> Result<(), String> {
    let win = get_main_window(&app)?;

    let monitor = win
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("No monitor found")?;

    let screen_size = monitor.size();
    let screen_pos = monitor.position();
    let scale = win.scale_factor().unwrap_or(1.0);

    let physical_width = (width as f64 * scale) as u32;
    let height = screen_size.height;

    let x = match edge.as_str() {
        "left" => screen_pos.x,
        _ => screen_pos.x + (screen_size.width as i32 - physical_width as i32),
    };

    win.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(x, screen_pos.y)))
        .map_err(|e| e.to_string())?;
    win.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(physical_width, height)))
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn toggle_sidebar(app: tauri::AppHandle) -> Result<bool, String> {
    let win = get_main_window(&app)?;

    let visible = win.is_visible().map_err(|e| e.to_string())?;

    if visible {
        win.hide().map_err(|e| e.to_string())?;
    } else {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
    }

    Ok(!visible)
}

#[tauri::command]
pub fn show_badge(app: tauri::AppHandle, count: u32) -> Result<(), String> {
    // Emit a badge-update event to the frontend for rendering
    app.emit("badge-update", serde_json::json!({ "count": count, "visible": true }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn hide_badge(app: tauri::AppHandle) -> Result<(), String> {
    app.emit("badge-update", serde_json::json!({ "count": 0, "visible": false }))
        .map_err(|e| e.to_string())
}

fn get_main_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())
}
