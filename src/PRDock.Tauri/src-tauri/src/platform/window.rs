use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[tauri::command]
pub fn position_sidebar(app: tauri::AppHandle, edge: String, width: u32) -> Result<(), String> {
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
            let _ = badge_win.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
                badge_width,
                badge_height,
            )));
        }
        badge_win.show().map_err(|e| e.to_string())?;
        badge_win
            .set_always_on_top(true)
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Resize the badge window, keeping it centered horizontally.
/// `anchor`: `"top"` keeps the top edge fixed, `"bottom"` keeps the bottom edge fixed,
///           `"auto"` grows upward only if the window would go off-screen.
/// Returns `"up"` if the window grew/anchored upward, `"down"` otherwise.
#[tauri::command]
pub fn resize_badge(
    app: tauri::AppHandle,
    width: u32,
    height: u32,
    anchor: Option<String>,
) -> Result<String, String> {
    let mut direction = "down".to_string();
    let anchor = anchor.unwrap_or_else(|| "auto".to_string());

    if let Some(badge_win) = app.get_webview_window("badge") {
        let scale = badge_win.scale_factor().unwrap_or(1.0);
        let pw = (width as f64 * scale) as u32;
        let ph = (height as f64 * scale) as u32;

        if let (Ok(cur_pos), Ok(cur_size)) = (badge_win.outer_position(), badge_win.outer_size()) {
            let mid_x = cur_pos.x + cur_size.width as i32 / 2;
            let new_x = mid_x - pw as i32 / 2;
            let cur_bottom = cur_pos.y + cur_size.height as i32;

            let new_y = if anchor == "bottom" {
                // Keep bottom edge fixed
                direction = "up".to_string();
                cur_bottom - ph as i32
            } else if anchor == "top" {
                // Keep top edge fixed
                cur_pos.y
            } else {
                // Auto: grow upward only if expanding would go off-screen
                let mut y = cur_pos.y;
                if let Ok(Some(monitor)) = badge_win.current_monitor() {
                    let screen_bottom = monitor.position().y + monitor.size().height as i32;
                    if cur_pos.y + ph as i32 > screen_bottom {
                        y = cur_bottom - ph as i32;
                        direction = "up".to_string();
                    }
                }
                y
            };

            let _ = badge_win.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition::new(new_x, new_y),
            ));
        }

        badge_win
            .set_size(tauri::Size::Physical(tauri::PhysicalSize::new(pw, ph)))
            .map_err(|e| e.to_string())?;
    }
    Ok(direction)
}

#[tauri::command]
pub fn hide_badge(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(badge_win) = app.get_webview_window("badge") {
        badge_win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn hide_sidebar(app: tauri::AppHandle) -> Result<(), String> {
    let win = get_main_window(&app)?;
    if win.is_visible().unwrap_or(false) {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_pr_detail_window(
    app: tauri::AppHandle,
    owner: String,
    repo: String,
    number: u32,
) -> Result<(), String> {
    let label = format!("pr-detail-{}-{}-{}", owner, repo, number);

    // If the window already exists, just show and focus it
    if let Some(existing) = app.get_webview_window(&label) {
        existing.show().map_err(|e| e.to_string())?;
        existing.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let url_str = format!(
        "pr-detail.html?owner={}&repo={}&number={}",
        urlencoding::encode(&owner),
        urlencoding::encode(&repo),
        number
    );

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url_str.into()))
        .title(format!("PR #{} - {}/{}", number, owner, repo))
        .inner_size(800.0, 900.0)
        .decorations(true)
        .resizable(true)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn get_main_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())
}

fn apply_sidebar_position(win: &WebviewWindow, edge: &str, width: u32) -> Result<(), String> {
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

    win.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
        x,
        screen_pos.y,
    )))
    .map_err(|e| e.to_string())?;
    win.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
        physical_width,
        height,
    )))
    .map_err(|e| e.to_string())?;

    Ok(())
}
