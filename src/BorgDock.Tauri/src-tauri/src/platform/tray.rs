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
    let show = MenuItemBuilder::with_id("show", "Show sidebar").build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
    let whats_new = MenuItemBuilder::with_id("whats_new", "What's new…").build(app)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show)
        .item(&settings)
        .item(&whats_new)
        .item(&separator)
        .item(&quit)
        .build()?;

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
            "show" => {
                let _ = crate::platform::window::show_main_window(app);
            }
            "settings" => {
                if let Ok(()) = crate::platform::window::show_main_window(app) {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.emit("open-settings", ());
                    }
                }
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
            // Left-click toggles the flyout
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle().clone();
                let app_inner = app.clone();
                let _ = app.run_on_main_thread(move || {
                    if let Err(e) = super::window::toggle_flyout(&app_inner) {
                        log::error!("toggle_flyout failed: {e}");
                    }
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

/// Gradient colors chosen to keep strong contrast with white text overlays,
/// so the digit remains legible at small taskbar sizes (16–24 px).
fn status_gradient(worst: TrayWorstState, dark: bool) -> ([u8; 4], [u8; 4]) {
    match worst {
        TrayWorstState::Failing => ([220, 38, 70, 255], [176, 24, 52, 255]),
        TrayWorstState::Pending => ([217, 119, 6, 255], [176, 88, 0, 255]),
        TrayWorstState::Passing => ([5, 150, 105, 255], [4, 110, 78, 255]),
        TrayWorstState::Idle => brand_gradient(dark),
        TrayWorstState::Initializing => brand_gradient(dark),
    }
}

fn brand_gradient(dark: bool) -> ([u8; 4], [u8; 4]) {
    if dark {
        ([124, 106, 246, 255], [147, 132, 247, 255]) // #7C6AF6 -> #9384F7
    } else {
        ([102, 85, 212, 255], [124, 106, 246, 255]) // #6655D4 -> #7C6AF6
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
    let packed =
        (count as u64) | ((worst_state.as_u8() as u64) << 8) | ((dark as u64) << 16);
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
        tray.set_tooltip(Some(&tooltip)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Normalized brand waveform points (x: 0..1, y: 0..1). Derived from the
/// favicon SVG `M2,9 L4,9 L5.5,5 L7.5,12 L9,3 L11,11 L12.5,7 L14,9` in a 16x16
/// viewBox, rescaled so the bounding box maps to [0,1] × [0,1].
const BRAND_WAVE: &[(f32, f32)] = &[
    (0.000, 0.667),
    (0.167, 0.667),
    (0.292, 0.222),
    (0.458, 1.000),
    (0.583, 0.000),
    (0.750, 0.889),
    (0.875, 0.444),
    (1.000, 0.667),
];

/// Render a 64x64 RGBA tray icon. Windows downscales this to 16–32 px in the
/// taskbar, so rendering large gives OS resampling plenty of detail to work
/// with.
///
/// The brand waveform is drawn in every state so the icon always reads as
/// BorgDock. When there are open PRs, the background switches to a status-colored
/// gradient (red / amber / green) for at-a-glance urgency, the waveform shrinks
/// to a top strip, and the count is rendered large below it.
fn render_tray_icon(
    count: u8,
    worst: TrayWorstState,
    dark: bool,
) -> tauri::image::Image<'static> {
    const SIZE: u32 = 64;
    let mut buf = vec![0u8; (SIZE * SIZE * 4) as usize];

    let show_count = count > 0 && !matches!(worst, TrayWorstState::Idle);

    // Rounded square: 60x60 centered in 64x64 (2 px margin).
    let sq_size = 60u32;
    let sq_off = (SIZE - sq_size) / 2;
    let radius = 13.0f32;

    let (c1, c2) = if show_count {
        status_gradient(worst, dark)
    } else {
        brand_gradient(dark)
    };

    for y in 0..sq_size {
        for x in 0..sq_size {
            if !in_rounded_rect(x as f32, y as f32, sq_size as f32, sq_size as f32, radius) {
                continue;
            }
            let t = ((x as f32 + y as f32) / (sq_size as f32 * 2.0 - 2.0)).min(1.0);
            let px = sq_off + x;
            let py = sq_off + y;
            let i = ((py * SIZE + px) * 4) as usize;
            buf[i] = lerp_u8(c1[0], c2[0], t);
            buf[i + 1] = lerp_u8(c1[1], c2[1], t);
            buf[i + 2] = lerp_u8(c1[2], c2[2], t);
            buf[i + 3] = 255;
        }
    }

    let ink: [u8; 4] = [255, 255, 255, 255];

    if show_count {
        // Compact waveform at the top + large count number below. The waveform
        // keeps brand identity while the status-colored background signals
        // urgency at a glance.
        draw_brand_waveform(&mut buf, SIZE, 8.0, 5.0, 56.0, 24.0, 2.6, &ink);

        let text = if count > 99 {
            "99+".to_string()
        } else {
            count.to_string()
        };
        // Digit area is y ≈ 28..58 (30 px tall).
        let scale: i32 = match text.chars().count() {
            1 => 4, // 20x28 single digit
            2 => 3, // ~33x21 two digits
            _ => 2, // "99+": ~34x14 (rare fallback)
        };
        draw_scaled_text(&mut buf, SIZE, SIZE as f32 / 2.0, 43.0, &text, scale);
    } else {
        // Idle: waveform uses most of the canvas, matching the app icon.
        draw_brand_waveform(&mut buf, SIZE, 8.0, 14.0, 56.0, 50.0, 3.6, &ink);
    }

    tauri::image::Image::new_owned(buf, SIZE, SIZE)
}

/// Render the idle brand icon with a brightness-modulated overlay driven by
/// `phase` (in radians). Reuses `render_tray_icon` and then blends a
/// translucent white layer whose alpha follows |sin(phase)| so the overall
/// brightness "breathes" during init.
pub(crate) fn render_initializing_icon(dark: bool, phase: f32) -> tauri::image::Image<'static> {
    const SIZE: u32 = 64;
    let img = render_tray_icon(0, TrayWorstState::Initializing, dark);
    // Blend a white overlay whose alpha breathes with |sin(phase)|.
    let overlay_alpha = (phase.sin().abs() * 80.0) as u8;
    if overlay_alpha == 0 {
        return img;
    }
    // image::Image doesn't expose a mutable pixel view, so we re-render
    // into a fresh buffer and apply the overlay there.
    let _ = img; // drop the original; we'll rebuild
    let base_img = render_tray_icon(0, TrayWorstState::Initializing, dark);
    // Obtain the raw bytes by encoding then re-reading — cheapest path
    // that avoids unsafe. Since render_tray_icon already allocates a vec
    // we can re-render with the overlay applied directly.
    let mut buf = vec![0u8; (SIZE * SIZE * 4) as usize];
    // Redo the gradient fill with a brightened palette.
    let sq_size = 60u32;
    let sq_off = (SIZE - sq_size) / 2;
    let radius = 13.0f32;
    let (c1, c2) = brand_gradient(dark);
    let ov = overlay_alpha as f32 / 255.0;
    let brighten = |ch: u8| -> u8 { (ch as f32 + (255.0 - ch as f32) * ov) as u8 };
    let c1b = [brighten(c1[0]), brighten(c1[1]), brighten(c1[2]), 255u8];
    let c2b = [brighten(c2[0]), brighten(c2[1]), brighten(c2[2]), 255u8];
    for y in 0..sq_size {
        for x in 0..sq_size {
            if !in_rounded_rect(x as f32, y as f32, sq_size as f32, sq_size as f32, radius) {
                continue;
            }
            let t = ((x as f32 + y as f32) / (sq_size as f32 * 2.0 - 2.0)).min(1.0);
            let px = sq_off + x;
            let py = sq_off + y;
            let i = ((py * SIZE + px) * 4) as usize;
            buf[i]     = lerp_u8(c1b[0], c2b[0], t);
            buf[i + 1] = lerp_u8(c1b[1], c2b[1], t);
            buf[i + 2] = lerp_u8(c1b[2], c2b[2], t);
            buf[i + 3] = 255;
        }
    }
    let ink: [u8; 4] = [255, 255, 255, 255];
    draw_brand_waveform(&mut buf, SIZE, 8.0, 14.0, 56.0, 50.0, 3.6, &ink);
    let _ = base_img; // silence unused warning
    tauri::image::Image::new_owned(buf, SIZE, SIZE)
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

/// Draw the BorgDock brand waveform fitted into the bounding box
/// (x0, y0) → (x1, y1), plus the small probe dot at the trailing end.
fn draw_brand_waveform(
    buf: &mut [u8],
    stride: u32,
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    thickness: f32,
    color: &[u8; 4],
) {
    let w = x1 - x0;
    let h = y1 - y0;
    for pair in BRAND_WAVE.windows(2) {
        let (nx1, ny1) = pair[0];
        let (nx2, ny2) = pair[1];
        draw_line(
            buf,
            stride,
            x0 + nx1 * w,
            y0 + ny1 * h,
            x0 + nx2 * w,
            y0 + ny2 * h,
            color,
            thickness,
        );
    }
    // Probe dot at the end of the line
    if let Some(&(nx, ny)) = BRAND_WAVE.last() {
        let cx = x0 + nx * w;
        let cy = y0 + ny * h;
        let r = thickness * 0.9;
        draw_filled_circle(buf, stride, cx, cy, r, color);
    }
}

fn draw_filled_circle(buf: &mut [u8], stride: u32, cx: f32, cy: f32, r: f32, color: &[u8; 4]) {
    let min_x = (cx - r - 1.0).floor().max(0.0) as u32;
    let max_x = (cx + r + 1.0).ceil().min(stride as f32 - 1.0) as u32;
    let min_y = (cy - r - 1.0).floor().max(0.0) as u32;
    let max_y = (cy + r + 1.0).ceil().min(stride as f32 - 1.0) as u32;
    for py in min_y..=max_y {
        for px in min_x..=max_x {
            let dx = px as f32 + 0.5 - cx;
            let dy = py as f32 + 0.5 - cy;
            let dist = (dx * dx + dy * dy).sqrt();
            if dist <= r + 0.5 {
                let alpha = if dist > r - 0.5 {
                    ((r + 0.5 - dist) * color[3] as f32) as u8
                } else {
                    color[3]
                };
                let i = ((py * stride + px) * 4) as usize;
                blend_pixel(&mut buf[i..i + 4], color, alpha);
            }
        }
    }
}

/// Draw text using the 5x7 bitmap font scaled up by `scale`, with one blank
/// column of inter-character spacing. Each set bit becomes a solid scale×scale
/// block — pixelated edges downscale cleanly in the taskbar.
fn draw_scaled_text(buf: &mut [u8], stride: u32, cx: f32, cy: f32, text: &str, scale: i32) {
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
                    if bits & (1 << (4 - col)) != 0 {
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
                                    buf[i] = 255;
                                    buf[i + 1] = 255;
                                    buf[i + 2] = 255;
                                    buf[i + 3] = 255;
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
    m.insert('0', [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110]);
    m.insert('1', [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110]);
    m.insert('2', [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111]);
    m.insert('3', [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110]);
    m.insert('4', [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010]);
    m.insert('5', [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110]);
    m.insert('6', [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110]);
    m.insert('7', [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000]);
    m.insert('8', [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110]);
    m.insert('9', [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100]);
    m.insert('+', [0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000]);
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

fn lerp_u8(a: u8, b: u8, t: f32) -> u8 {
    (a as f32 + (b as f32 - a as f32) * t) as u8
}

fn blend_pixel(dst: &mut [u8], src: &[u8; 4], alpha: u8) {
    let a = alpha as f32 / 255.0;
    let inv_a = 1.0 - a;
    dst[0] = (src[0] as f32 * a + dst[0] as f32 * inv_a) as u8;
    dst[1] = (src[1] as f32 * a + dst[1] as f32 * inv_a) as u8;
    dst[2] = (src[2] as f32 * a + dst[2] as f32 * inv_a) as u8;
    dst[3] = (alpha.max(dst[3]) as f32).min(255.0) as u8;
}

/// Bresenham-style thick line drawing
fn draw_line(buf: &mut [u8], stride: u32, x1: f32, y1: f32, x2: f32, y2: f32, color: &[u8; 4], thickness: f32) {
    let dx = x2 - x1;
    let dy = y2 - y1;
    let len = (dx * dx + dy * dy).sqrt();
    if len < 0.001 { return; }
    let steps = (len * 2.0) as i32;
    let half_t = thickness / 2.0;

    for s in 0..=steps {
        let t = s as f32 / steps as f32;
        let cx = x1 + dx * t;
        let cy = y1 + dy * t;

        // Draw a small filled circle at each point
        let min_x = (cx - half_t).floor().max(0.0) as u32;
        let max_x = (cx + half_t).ceil().min(stride as f32 - 1.0) as u32;
        let min_y = (cy - half_t).floor().max(0.0) as u32;
        let max_y = (cy + half_t).ceil().min(stride as f32 - 1.0) as u32;

        for py in min_y..=max_y {
            for px in min_x..=max_x {
                let ddx = px as f32 + 0.5 - cx;
                let ddy = py as f32 + 0.5 - cy;
                let dist = (ddx * ddx + ddy * ddy).sqrt();
                if dist <= half_t + 0.5 {
                    let alpha = if dist > half_t - 0.5 {
                        ((half_t + 0.5 - dist) * color[3] as f32) as u8
                    } else {
                        color[3]
                    };
                    let i = ((py * stride + px) * 4) as usize;
                    blend_pixel(&mut buf[i..i + 4], color, alpha);
                }
            }
        }
    }
}
