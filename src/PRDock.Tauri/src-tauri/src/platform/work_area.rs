use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
struct WorkAreaState {
    original_work_area: RectDto,
    has_reserved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
struct RectDto {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

fn state_path() -> PathBuf {
    dirs::config_dir()
        .expect("could not determine config directory")
        .join("PRDock")
        .join("workarea.json")
}

#[cfg(target_os = "windows")]
mod win32 {
    use std::mem;

    #[repr(C)]
    #[derive(Copy, Clone, Debug)]
    pub struct RECT {
        pub left: i32,
        pub top: i32,
        pub right: i32,
        pub bottom: i32,
    }

    const SPI_GETWORKAREA: u32 = 0x0030;
    const SPI_SETWORKAREA: u32 = 0x002F;
    const SPIF_SENDCHANGE: u32 = 0x0002;

    extern "system" {
        fn SystemParametersInfoW(
            ui_action: u32,
            ui_param: u32,
            pv_param: *mut RECT,
            f_win_ini: u32,
        ) -> i32;
    }

    pub fn get_work_area() -> RECT {
        unsafe {
            let mut rect: RECT = mem::zeroed();
            SystemParametersInfoW(SPI_GETWORKAREA, 0, &mut rect, 0);
            rect
        }
    }

    pub fn set_work_area(rect: &mut RECT) {
        unsafe {
            SystemParametersInfoW(SPI_SETWORKAREA, 0, rect, SPIF_SENDCHANGE);
        }
    }
}

#[tauri::command]
pub fn reserve_work_area(width: i32, edge: String) -> Result<(), String> {
    if edge != "left" && edge != "right" {
        return Err("Edge must be \"left\" or \"right\"".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let original = win32::get_work_area();

        let mut adjusted = original;
        match edge.as_str() {
            "right" => adjusted.right -= width,
            "left" => adjusted.left += width,
            _ => unreachable!(),
        }

        win32::set_work_area(&mut adjusted);

        // Persist state for crash recovery
        let state = WorkAreaState {
            original_work_area: RectDto {
                left: original.left,
                top: original.top,
                right: original.right,
                bottom: original.bottom,
            },
            has_reserved: true,
        };

        let path = state_path();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let json = serde_json::to_string(&state).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| format!("Failed to save work area state: {e}"))?;

        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        // TODO: macOS does not support programmatic work area reservation
        // The window manager handles this via window positioning
        let _ = (width, edge);
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        // TODO: Linux — set _NET_WM_STRUT_PARTIAL X11 property
        let _ = (width, edge);
        Ok(())
    }
}

#[tauri::command]
pub fn restore_work_area() -> Result<(), String> {
    let path = state_path();

    #[cfg(target_os = "windows")]
    {
        if path.exists() {
            let json = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            if let Ok(state) = serde_json::from_str::<WorkAreaState>(&json) {
                if state.has_reserved {
                    let orig = &state.original_work_area;
                    let mut rect = win32::RECT {
                        left: orig.left,
                        top: orig.top,
                        right: orig.right,
                        bottom: orig.bottom,
                    };
                    win32::set_work_area(&mut rect);
                }
            }
        }

        let _ = fs::remove_file(&path);
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = fs::remove_file(&path);
        Ok(())
    }
}
