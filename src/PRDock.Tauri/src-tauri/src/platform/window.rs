use tauri::{Manager, WebviewWindow};

#[tauri::command]
pub fn position_sidebar(
    app: tauri::AppHandle,
    edge: String,
    width: u32,
) -> Result<(), String> {
    let win = get_main_window(&app)?;
    apply_sidebar_position(&win, &edge, width)
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

        // Re-apply position after showing to force a proper repaint.
        // On Windows, transparent webview windows can render as a blank
        // rectangle if the compositor doesn't get a size/position update.
        if let Ok(size) = win.outer_size() {
            let _ = win.set_size(tauri::Size::Physical(size));
        }
    }

    Ok(!visible)
}

#[tauri::command]
pub fn show_badge(app: tauri::AppHandle, _count: u32) -> Result<(), String> {
    if let Some(badge_win) = app.get_webview_window("badge") {
        // Position badge at top-center of primary monitor
        if let Ok(Some(monitor)) = badge_win.current_monitor() {
            let screen_size = monitor.size();
            let screen_pos = monitor.position();
            let scale = badge_win.scale_factor().unwrap_or(1.0);
            let badge_width = (260.0 * scale) as u32;
            let badge_height = (50.0 * scale) as u32;
            let x = screen_pos.x + (screen_size.width as i32 - badge_width as i32) / 2;
            let y = screen_pos.y + 8;
            let _ = badge_win.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition::new(x, y),
            ));
            let _ = badge_win.set_size(tauri::Size::Physical(
                tauri::PhysicalSize::new(badge_width, badge_height),
            ));
        }
        badge_win.show().map_err(|e| e.to_string())?;
        badge_win.set_always_on_top(true).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn resize_badge(app: tauri::AppHandle, width: u32, height: u32) -> Result<(), String> {
    if let Some(badge_win) = app.get_webview_window("badge") {
        let scale = badge_win.scale_factor().unwrap_or(1.0);
        let pw = (width as f64 * scale) as u32;
        let ph = (height as f64 * scale) as u32;

        // Re-center horizontally after resize
        if let Ok(Some(monitor)) = badge_win.current_monitor() {
            let screen_size = monitor.size();
            let screen_pos = monitor.position();
            let x = screen_pos.x + (screen_size.width as i32 - pw as i32) / 2;
            let y = screen_pos.y + 8;
            let _ = badge_win.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition::new(x, y),
            ));
        }

        badge_win
            .set_size(tauri::Size::Physical(tauri::PhysicalSize::new(pw, ph)))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn hide_badge(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(badge_win) = app.get_webview_window("badge") {
        badge_win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn get_main_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())
}

fn apply_sidebar_position(
    win: &WebviewWindow,
    edge: &str,
    width: u32,
) -> Result<(), String> {
    let monitor = win
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("No monitor found")?;

    let screen_size = monitor.size();
    let screen_pos = monitor.position();
    let scale = win.scale_factor().unwrap_or(1.0);

    let physical_width = (width as f64 * scale) as u32;
    let height = screen_size.height;

    let x = match edge {
        "left" => screen_pos.x,
        _ => screen_pos.x + (screen_size.width as i32 - physical_width as i32),
    };

    win.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(x, screen_pos.y)))
        .map_err(|e| e.to_string())?;
    win.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(physical_width, height)))
        .map_err(|e| e.to_string())?;

    Ok(())
}
