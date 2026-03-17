#[tauri::command]
pub fn get_system_theme() -> Result<String, String> {
    // Use dark-light crate logic inline since Tauri doesn't expose theme() on AppHandle.
    // On macOS: check NSApp.effectiveAppearance
    // On Windows: check registry AppsUseLightTheme
    // On Linux: check various desktop settings
    // For now, use a simple approach with std::process::Command on macOS
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("defaults")
            .args(["read", "-g", "AppleInterfaceStyle"])
            .output();

        match output {
            Ok(out) if out.status.success() => {
                let style = String::from_utf8_lossy(&out.stdout);
                if style.trim().eq_ignore_ascii_case("dark") {
                    return Ok("dark".to_string());
                }
                Ok("light".to_string())
            }
            _ => Ok("light".to_string()), // defaults to light if key doesn't exist
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Check registry: HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize\AppsUseLightTheme
        // 0 = dark, 1 = light
        let output = std::process::Command::new("reg")
            .args([
                "query",
                r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize",
                "/v",
                "AppsUseLightTheme",
            ])
            .output();

        match output {
            Ok(out) if out.status.success() => {
                let text = String::from_utf8_lossy(&out.stdout);
                if text.contains("0x0") {
                    return Ok("dark".to_string());
                }
                Ok("light".to_string())
            }
            _ => Ok("light".to_string()),
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Try to detect via gsettings (GNOME)
        let output = std::process::Command::new("gsettings")
            .args(["get", "org.gnome.desktop.interface", "color-scheme"])
            .output();

        match output {
            Ok(out) if out.status.success() => {
                let scheme = String::from_utf8_lossy(&out.stdout);
                if scheme.contains("dark") {
                    return Ok("dark".to_string());
                }
                Ok("light".to_string())
            }
            _ => Ok("light".to_string()),
        }
    }
}
