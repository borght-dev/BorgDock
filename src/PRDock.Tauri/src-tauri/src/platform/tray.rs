use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

pub fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItemBuilder::with_id("show", "Show").build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show)
        .item(&settings)
        .item(&separator)
        .item(&quit)
        .build()?;

    // Theme-aware tray icon: use light icon on dark OS theme, dark on light.
    // Decode the embedded PNG at startup. Falls back to default icon on error.
    let icon = {
        let theme = app
            .get_webview_window("main")
            .and_then(|w| w.theme().ok())
            .unwrap_or(tauri::Theme::Light);

        let png_bytes: &[u8] = match theme {
            tauri::Theme::Dark => include_bytes!("../../icons/tray-light.png"),
            _ => include_bytes!("../../icons/tray-dark.png"),
        };

        decode_png_to_rgba(png_bytes).unwrap_or_else(|| app.default_window_icon().cloned().unwrap())
    };

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            "settings" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                    let _ = win.emit("open-settings", ());
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

/// Decode a PNG byte slice into a Tauri `Image` (RGBA).
fn decode_png_to_rgba(png_bytes: &[u8]) -> Option<tauri::image::Image<'static>> {
    let decoder = png::Decoder::new(std::io::Cursor::new(png_bytes));
    let mut reader = decoder.read_info().ok()?;
    let mut buf = vec![0u8; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).ok()?;
    buf.truncate(info.buffer_size());

    // Convert to RGBA if needed
    let rgba = match info.color_type {
        png::ColorType::Rgba => buf,
        png::ColorType::Rgb => {
            let mut rgba = Vec::with_capacity(buf.len() / 3 * 4);
            for chunk in buf.chunks_exact(3) {
                rgba.extend_from_slice(chunk);
                rgba.push(255);
            }
            rgba
        }
        _ => return None,
    };

    Some(tauri::image::Image::new_owned(
        rgba,
        info.width,
        info.height,
    ))
}
