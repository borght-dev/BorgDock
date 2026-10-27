//! The number of unread activity entries that need me, on the taskbar icon.
//! Windows draws it as an overlay icon (a red disc with the count, `9+`
//! past nine); other platforms take a badge count.

use tauri::{AppHandle, Manager};

const SIZE: usize = 32;

/// 3×5 glyphs for 0-9 and `+`, one row per entry, three bits per row.
const GLYPHS: [[u8; 5]; 11] = [
    [0b111, 0b101, 0b101, 0b101, 0b111],
    [0b010, 0b110, 0b010, 0b010, 0b111],
    [0b111, 0b001, 0b111, 0b100, 0b111],
    [0b111, 0b001, 0b111, 0b001, 0b111],
    [0b101, 0b101, 0b111, 0b001, 0b001],
    [0b111, 0b100, 0b111, 0b001, 0b111],
    [0b111, 0b100, 0b111, 0b101, 0b111],
    [0b111, 0b001, 0b010, 0b010, 0b010],
    [0b111, 0b101, 0b111, 0b101, 0b111],
    [0b111, 0b101, 0b111, 0b001, 0b111],
    [0b000, 0b010, 0b111, 0b010, 0b000],
];

/// What the badge says: the count up to nine, then `9+`.
pub fn badge_text(count: u32) -> Vec<usize> {
    match count {
        0 => Vec::new(),
        1..=9 => vec![count as usize],
        _ => vec![9, 10],
    }
}

/// A red disc with the count in white, as RGBA rows.
pub fn badge_rgba(count: u32) -> Vec<u8> {
    let mut pixels = vec![0u8; SIZE * SIZE * 4];
    let center = (SIZE as f32 - 1.0) / 2.0;
    let radius = SIZE as f32 / 2.0;
    for y in 0..SIZE {
        for x in 0..SIZE {
            let distance = ((x as f32 - center).powi(2) + (y as f32 - center).powi(2)).sqrt();
            let coverage = (radius - distance).clamp(0.0, 1.0);
            if coverage > 0.0 {
                let at = (y * SIZE + x) * 4;
                pixels[at..at + 4].copy_from_slice(&[220, 38, 38, (coverage * 255.0) as u8]);
            }
        }
    }
    let glyphs = badge_text(count);
    if glyphs.is_empty() {
        return pixels;
    }
    // Each glyph pixel is a 4×4 block; glyphs sit one block apart.
    let scale = if glyphs.len() == 1 { 4 } else { 3 };
    let width = glyphs.len() * 3 * scale + (glyphs.len() - 1) * scale;
    let left = (SIZE - width) / 2;
    let top = (SIZE - 5 * scale) / 2;
    for (index, glyph) in glyphs.iter().enumerate() {
        let origin = left + index * 4 * scale;
        for (row, bits) in GLYPHS[*glyph].iter().enumerate() {
            for column in 0..3 {
                if bits & (0b100 >> column) == 0 {
                    continue;
                }
                for dy in 0..scale {
                    for dx in 0..scale {
                        let x = origin + column * scale + dx;
                        let y = top + row * scale + dy;
                        let at = (y * SIZE + x) * 4;
                        pixels[at..at + 4].copy_from_slice(&[255, 255, 255, 255]);
                    }
                }
            }
        }
    }
    pixels
}

/// Show `count` on the main window's taskbar icon; 0 clears it. Runs on the
/// GUI thread with the shared timeout, like every window command.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn set_taskbar_badge(app: AppHandle, count: u32) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let app_for_run = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            let Some(window) = app_for_run.get_webview_window("main") else {
                return Ok(());
            };
            #[cfg(target_os = "windows")]
            {
                let icon = (count > 0).then(|| {
                    tauri::image::Image::new_owned(badge_rgba(count), SIZE as u32, SIZE as u32)
                });
                window.set_overlay_icon(icon).map_err(|e| e.to_string())
            }
            #[cfg(not(target_os = "windows"))]
            {
                window
                    .set_badge_count((count > 0).then_some(i64::from(count)))
                    .map_err(|e| e.to_string())
            }
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    crate::platform::window::main_thread_result(rx).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_badge_says_the_count_up_to_nine_then_nine_plus() {
        assert!(badge_text(0).is_empty());
        assert_eq!(badge_text(7), vec![7]);
        assert_eq!(badge_text(10), vec![9, 10]);
        assert_eq!(badge_text(250), vec![9, 10]);
    }

    #[test]
    fn the_badge_is_a_disc_with_white_digits() {
        let pixels = badge_rgba(3);
        assert_eq!(pixels.len(), SIZE * SIZE * 4);
        let at = |x: usize, y: usize| &pixels[(y * SIZE + x) * 4..(y * SIZE + x) * 4 + 4];
        assert_eq!(at(0, 0)[3], 0, "the corner is transparent");
        assert_eq!(at(SIZE / 2, 2), &[220, 38, 38, 255]);
        let white = (0..SIZE * SIZE)
            .filter(|i| pixels[i * 4..i * 4 + 4] == [255, 255, 255, 255])
            .count();
        assert!(white > 0);
        badge_rgba(42);
    }
}
