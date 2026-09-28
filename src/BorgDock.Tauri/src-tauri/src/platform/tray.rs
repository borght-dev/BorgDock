use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

/// Packed representation of the last tray icon state so we can skip redundant
/// re-renders. Layout: [count: u8 | worst: u8 | dark: u8 | 0]
static LAST_ICON_STATE: AtomicU64 = AtomicU64::new(u64::MAX);

/// True while the app is still initializing. The pulse animation task checks
/// this flag on every tick; `stop_initializing_animation` flips it to false.
static IS_INITIALIZING: AtomicBool = AtomicBool::new(true);

pub fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show_flyout = MenuItemBuilder::with_id("show_flyout", "Show flyout").build(app)?;
    let show = MenuItemBuilder::with_id("show", "Show BorgDock").build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
    let whats_new = MenuItemBuilder::with_id("whats_new", "What's new…").build(app)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_flyout)
        .item(&show)
        .item(&settings)
        .item(&whats_new);

    let menu = menu.item(&separator).item(&quit).build()?;

    // Start with the initializing brand icon (no badge)
    let dark = app
        .get_webview_window("main")
        .and_then(|w| w.theme().ok())
        .map(|t| matches!(t, tauri::Theme::Dark))
        .unwrap_or(true);
    let icon = render_tray_icon(0, TrayWorstState::Initializing, dark);

    TrayIconBuilder::with_id("main")
        .icon(icon)
        .tooltip("BorgDock — loading…")
        .menu(&menu)
        // Right-click shows menu; left-click toggles flyout
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show_flyout" => {
                let app_handle = app.clone();
                let _ = app.run_on_main_thread(move || {
                    if let Err(e) = crate::platform::window::toggle_flyout(&app_handle) {
                        log::error!("tray show_flyout: {e}");
                    }
                });
            }
            "show" => {
                let app_handle = app.clone();
                let _ = app.run_on_main_thread(move || {
                    crate::platform::window::show_or_focus_main_sync(&app_handle);
                });
            }
            "settings" => {
                let app_handle = app.clone();
                let _ = app.run_on_main_thread(move || {
                    crate::platform::window::show_or_focus_main_sync(&app_handle);
                    if let Some(win) = app_handle.get_webview_window("main") {
                        let _ = win.emit("open-settings", ());
                    }
                });
            }
            "whats_new" => {
                let app_handle = app.clone();
                let _ = app.run_on_main_thread(move || {
                    let app_inner = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) =
                            crate::platform::window::open_whats_new_window(app_inner, None).await
                        {
                            log::error!("tray whats_new open failed: {e}");
                        }
                    });
                });
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Left-click shows/focuses/hides the main window (same as the
            // global hotkey). The flyout is reachable via its own hotkey or
            // the "Show flyout" tray-menu item.
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle().clone();
                let app_inner = app.clone();
                let _ = app.run_on_main_thread(move || {
                    crate::platform::window::show_or_focus_main_sync(&app_inner);
                });
            }
        })
        .build(app)?;

    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrayWorstState {
    Failing,
    Pending,
    Passing,
    Idle,
    Initializing,
}

impl TrayWorstState {
    fn as_u8(&self) -> u8 {
        match self {
            TrayWorstState::Failing => 0,
            TrayWorstState::Pending => 1,
            TrayWorstState::Passing => 2,
            TrayWorstState::Idle => 3,
            TrayWorstState::Initializing => 4,
        }
    }
}

fn tray_colors(worst: TrayWorstState, dark: bool) -> ([u8; 4], [u8; 4]) {
    let ink = [18, 18, 26, 255];
    match worst {
        TrayWorstState::Failing => ([240, 97, 109, 255], ink),
        TrayWorstState::Pending => ([229, 180, 84, 255], ink),
        TrayWorstState::Passing => ([92, 201, 143, 255], ink),
        _ if dark => ([127, 126, 255, 255], ink),
        _ => ([79, 70, 229, 255], [255, 255, 255, 255]),
    }
}

/// Update the tray icon to reflect current PR state. Called from the frontend
/// via IPC whenever PR data changes.
#[tauri::command]
pub fn update_tray_icon(
    app: tauri::AppHandle,
    count: u8,
    worst_state: TrayWorstState,
) -> Result<(), String> {
    // First non-Initializing state arriving means init is done. Stop the pulse.
    if !matches!(worst_state, TrayWorstState::Initializing) {
        stop_initializing_animation();
    }

    let dark = app
        .get_webview_window("main")
        .and_then(|w| w.theme().ok())
        .map(|t| matches!(t, tauri::Theme::Dark))
        .unwrap_or(true);

    // Animated frames must not dedup — each tick re-renders even if state
    // is nominally the same.
    if matches!(worst_state, TrayWorstState::Initializing) {
        let icon = render_tray_icon(count, worst_state, dark);
        if let Some(tray) = app.tray_by_id("main") {
            tray.set_icon(Some(icon)).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    // Skip if state hasn't changed
    let packed = (count as u64) | ((worst_state.as_u8() as u64) << 8) | ((dark as u64) << 16);
    if LAST_ICON_STATE.swap(packed, Ordering::Relaxed) == packed {
        return Ok(());
    }

    let icon = render_tray_icon(count, worst_state, dark);
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_icon(Some(icon)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn update_tray_tooltip(app: tauri::AppHandle, tooltip: String) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_tooltip(Some(&tooltip))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn render_tray_icon(count: u8, worst: TrayWorstState, dark: bool) -> tauri::image::Image<'static> {
    const SIZE: u32 = 64;
    let mut buf = vec![0u8; (SIZE * SIZE * 4) as usize];
    let show_count =
        count > 0 && !matches!(worst, TrayWorstState::Idle | TrayWorstState::Initializing);
    let (background, ink) = tray_colors(worst, dark);

    for y in 0..60 {
        for x in 0..60 {
            if in_rounded_rect(x as f32, y as f32, 60.0, 60.0, 13.0) {
                let i = (((y + 2) * SIZE + x + 2) * 4) as usize;
                buf[i..i + 4].copy_from_slice(&background);
            }
        }
    }

    if show_count {
        draw_brand_mark(&mut buf, SIZE, 20, 2, true, &ink);
        let text = if count > 99 {
            "99+".to_string()
        } else {
            count.to_string()
        };
        let scale = if text.len() > 2 { 3 } else { 4 };
        draw_scaled_text(&mut buf, SIZE, 32.0, 43.0, &text, scale, &ink);
    } else {
        draw_brand_mark(&mut buf, SIZE, 0, 0, false, &ink);
    }

    tauri::image::Image::new_owned(buf, SIZE, SIZE)
}

pub(crate) fn render_initializing_icon(dark: bool, phase: f32) -> tauri::image::Image<'static> {
    let image = render_tray_icon(0, TrayWorstState::Initializing, dark);
    let mut rgba = image.rgba().to_vec();
    let brightness = phase.sin().abs() * 0.24;
    for pixel in rgba.chunks_exact_mut(4).filter(|pixel| pixel[3] > 0) {
        for channel in &mut pixel[..3] {
            *channel = (*channel as f32 + (255.0 - *channel as f32) * brightness).round() as u8;
        }
    }
    tauri::image::Image::new_owned(rgba, image.width(), image.height())
}

/// Spawn a tokio task that updates the tray icon while IS_INITIALIZING is
/// true. The dedup cache (LAST_ICON_STATE) is bypassed for this duration —
/// animated frames are not "state" and each tick must render. On init
/// completion, stop_initializing_animation() flips the flag and the task
/// exits on its next tick.
pub fn start_initializing_animation(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let dark = app
            .get_webview_window("main")
            .and_then(|w| w.theme().ok())
            .map(|t| matches!(t, tauri::Theme::Dark))
            .unwrap_or(true);
        let mut phase: f32 = 0.0;
        while IS_INITIALIZING.load(Ordering::SeqCst) {
            phase += 0.35; // roughly one full sine cycle every ~18 ticks
            if let Some(tray) = app.tray_by_id("main") {
                let icon = render_initializing_icon(dark, phase);
                let _ = tray.set_icon(Some(icon));
            }
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
    });
}

pub fn stop_initializing_animation() {
    IS_INITIALIZING.store(false, Ordering::SeqCst);
}

fn brand_mask(compact: bool) -> &'static [u8] {
    static FULL: std::sync::OnceLock<Vec<u8>> = std::sync::OnceLock::new();
    static COMPACT: std::sync::OnceLock<Vec<u8>> = std::sync::OnceLock::new();
    let (cache, bytes): (_, &[u8]) = if compact {
        (&COMPACT, include_bytes!("../../icons/tray-mark-small.png"))
    } else {
        (&FULL, include_bytes!("../../icons/tray-light.png"))
    };
    cache.get_or_init(|| {
        let mut reader = png::Decoder::new(bytes)
            .read_info()
            .expect("embedded brand PNG");
        let mut rgba = vec![0; reader.output_buffer_size()];
        let info = reader.next_frame(&mut rgba).expect("embedded brand pixels");
        assert_eq!(info.color_type, png::ColorType::Rgba);
        rgba[..info.buffer_size()]
            .chunks_exact(4)
            .map(|pixel| pixel[3])
            .collect()
    })
}

fn draw_brand_mark(buf: &mut [u8], stride: u32, x: u32, y: u32, compact: bool, ink: &[u8; 4]) {
    let size = if compact { 24 } else { 64 };
    for (i, &alpha) in brand_mask(compact).iter().enumerate() {
        if alpha == 0 {
            continue;
        }
        let px = x + i as u32 % size;
        let py = y + i as u32 / size;
        let offset = ((py * stride + px) * 4) as usize;
        let pixel = &mut buf[offset..offset + 4];
        for channel in 0..3 {
            pixel[channel] = ((ink[channel] as u32 * alpha as u32
                + pixel[channel] as u32 * (255 - alpha as u32)
                + 127)
                / 255) as u8;
        }
        pixel[3] = pixel[3].max(alpha);
    }
}

/// Draw text using the 5x7 bitmap font scaled up by `scale`, with one blank
/// column of inter-character spacing. Each set bit becomes a solid scale×scale
/// block — pixelated edges downscale cleanly in the taskbar.
fn draw_scaled_text(
    buf: &mut [u8],
    stride: u32,
    cx: f32,
    cy: f32,
    text: &str,
    scale: i32,
    ink: &[u8; 4],
) {
    let glyphs = get_glyph_data();
    let chars: Vec<char> = text.chars().collect();
    if chars.is_empty() {
        return;
    }

    let glyph_widths: Vec<i32> = chars.iter().map(|c| glyph_width(&glyphs, *c)).collect();
    // Total width = sum(glyph widths * scale) + spacing between chars (scale wide, n-1 gaps)
    let total_width: i32 =
        glyph_widths.iter().sum::<i32>() * scale + scale * (chars.len() as i32 - 1);
    let total_height = 7 * scale;

    let start_x = cx as i32 - total_width / 2;
    let start_y = cy as i32 - total_height / 2;
    let mut cursor_x = start_x;

    for (idx, ch) in chars.iter().enumerate() {
        if let Some(glyph) = glyphs.get(ch) {
            let w = glyph_widths[idx];
            for (row, bits) in glyph.iter().enumerate() {
                for col in 0..w {
                    let shift = if *ch == '1' { 3 - col } else { 4 - col };
                    if bits & (1 << shift) != 0 {
                        let bx = cursor_x + col * scale;
                        let by = start_y + row as i32 * scale;
                        for dy in 0..scale {
                            for dx in 0..scale {
                                let px = bx + dx;
                                let py = by + dy;
                                if px >= 0
                                    && py >= 0
                                    && (px as u32) < stride
                                    && (py as u32) < stride
                                {
                                    let i = ((py as u32 * stride + px as u32) * 4) as usize;
                                    buf[i..i + 4].copy_from_slice(ink);
                                }
                            }
                        }
                    }
                }
            }
            cursor_x += w * scale + scale; // advance width + 1-col spacing
        }
    }
}

fn glyph_width(glyphs: &std::collections::HashMap<char, [u8; 7]>, ch: char) -> i32 {
    match ch {
        '1' => 3,
        '+' => 5,
        _ => {
            if glyphs.contains_key(&ch) {
                5
            } else {
                0
            }
        }
    }
}

/// 5x7 bitmap font data for digits 0-9 and "+"
fn get_glyph_data() -> std::collections::HashMap<char, [u8; 7]> {
    let mut m = std::collections::HashMap::new();
    // Each row is 5 bits wide, MSB = leftmost pixel
    m.insert(
        '0',
        [
            0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110,
        ],
    );
    m.insert(
        '1',
        [
            0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110,
        ],
    );
    m.insert(
        '2',
        [
            0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111,
        ],
    );
    m.insert(
        '3',
        [
            0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110,
        ],
    );
    m.insert(
        '4',
        [
            0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010,
        ],
    );
    m.insert(
        '5',
        [
            0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110,
        ],
    );
    m.insert(
        '6',
        [
            0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110,
        ],
    );
    m.insert(
        '7',
        [
            0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000,
        ],
    );
    m.insert(
        '8',
        [
            0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110,
        ],
    );
    m.insert(
        '9',
        [
            0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100,
        ],
    );
    m.insert(
        '+',
        [
            0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000,
        ],
    );
    m
}

/// Check if point is inside a rounded rectangle
fn in_rounded_rect(x: f32, y: f32, w: f32, h: f32, r: f32) -> bool {
    if x < r && y < r {
        let dx = x - r;
        let dy = y - r;
        return dx * dx + dy * dy <= r * r;
    }
    if x > w - r - 1.0 && y < r {
        let dx = x - (w - r - 1.0);
        let dy = y - r;
        return dx * dx + dy * dy <= r * r;
    }
    if x < r && y > h - r - 1.0 {
        let dx = x - r;
        let dy = y - (h - r - 1.0);
        return dx * dx + dy * dy <= r * r;
    }
    if x > w - r - 1.0 && y > h - r - 1.0 {
        let dx = x - (w - r - 1.0);
        let dy = y - (h - r - 1.0);
        return dx * dx + dy * dy <= r * r;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_preserve_status_color_and_transparent_corners() {
        for dark in [false, true] {
            for state in [
                TrayWorstState::Failing,
                TrayWorstState::Pending,
                TrayWorstState::Passing,
            ] {
                for count in [0, 1, 10, 99, 100, 255] {
                    let icon = render_tray_icon(count, state, dark);
                    assert_eq!((icon.width(), icon.height()), (64, 64));
                    assert_eq!(icon.rgba()[3], 0);
                    assert_eq!(&icon.rgba()[128 * 4..128 * 4 + 4], &[0, 0, 0, 0]);
                    let background = tray_colors(state, dark).0;
                    let pixel = ((32 * 64 + 3) * 4) as usize;
                    assert_eq!(&icon.rgba()[pixel..pixel + 4], &background);
                }
                assert_ne!(
                    render_tray_icon(1, state, dark).rgba(),
                    render_tray_icon(10, state, dark).rgba()
                );
                assert_eq!(
                    render_tray_icon(100, state, dark).rgba(),
                    render_tray_icon(255, state, dark).rgba()
                );
            }
        }
    }

    #[test]
    fn initializing_pulse_preserves_alpha_and_ignores_counts() {
        for dark in [false, true] {
            let base = render_initializing_icon(dark, 0.0);
            let peak = render_initializing_icon(dark, std::f32::consts::FRAC_PI_2);
            assert_ne!(base.rgba(), peak.rgba());
            for (a, b) in base.rgba().chunks_exact(4).zip(peak.rgba().chunks_exact(4)) {
                assert_eq!(a[3], b[3]);
            }
            assert_eq!(
                base.rgba(),
                render_tray_icon(24, TrayWorstState::Initializing, dark).rgba()
            );
        }
    }

    #[test]
    fn narrow_one_keeps_all_three_columns_of_its_base() {
        let mut pixels = vec![0; 16 * 16 * 4];
        draw_scaled_text(&mut pixels, 16, 8.0, 8.0, "1", 1, &[18, 18, 26, 255]);
        for x in 7..10 {
            assert_eq!(pixels[(11 * 16 + x) * 4 + 3], 255);
        }
        assert_eq!(pixels[(11 * 16 + 6) * 4 + 3], 0);
        assert_eq!(pixels[(11 * 16 + 10) * 4 + 3], 0);
    }

    #[test]
    #[ignore = "writes actual tray renderer output for visual inspection"]
    fn export_brand_previews() {
        let directory = std::path::PathBuf::from(
            std::env::var_os("BORGDOCK_TRAY_PREVIEW_DIR").expect("preview directory"),
        );
        std::fs::create_dir_all(&directory).unwrap();
        let save = |name: String, image: tauri::image::Image<'_>| {
            let file = std::fs::File::create(directory.join(format!("{name}.png"))).unwrap();
            let mut encoder = png::Encoder::new(file, image.width(), image.height());
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            encoder
                .write_header()
                .unwrap()
                .write_image_data(image.rgba())
                .unwrap();
        };
        for dark in [false, true] {
            let theme = if dark { "dark" } else { "light" };
            for (name, state) in [
                ("idle", TrayWorstState::Idle),
                ("failing", TrayWorstState::Failing),
                ("pending", TrayWorstState::Pending),
                ("passing", TrayWorstState::Passing),
            ] {
                for count in [0, 1, 7, 24, 99, 100] {
                    save(
                        format!("{theme}-{name}-{count}"),
                        render_tray_icon(count, state, dark),
                    );
                }
            }
            save(
                format!("{theme}-loading"),
                render_initializing_icon(dark, 1.0),
            );
        }
    }
}
