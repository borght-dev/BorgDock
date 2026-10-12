//! The T3 Code desktop app: where it is installed and how to bring it forward.

use crate::git::hidden_command;
use std::path::{Path, PathBuf};

/// A T3 Code build's own executable: "T3 Code (Nightly).exe", "T3 Code (Alpha).exe",
/// "T3 Code.exe". The uninstaller in the same folder is not one.
fn is_app_executable(file_name: &str) -> bool {
    let lower = file_name.to_ascii_lowercase();
    lower.starts_with("t3 code") && !lower.starts_with("uninstall")
}

fn first_app_executable(dir: &Path, extension: Option<&str>) -> Option<PathBuf> {
    let mut found: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            let has_extension = match extension {
                Some(wanted) => path
                    .extension()
                    .and_then(|e| e.to_str())
                    .is_some_and(|e| e.eq_ignore_ascii_case(wanted)),
                None => true,
            };
            has_extension && is_app_executable(name)
        })
        .collect();
    found.sort();
    found.into_iter().next()
}

#[cfg(target_os = "windows")]
fn installed_executable() -> Option<PathBuf> {
    let local = std::env::var_os("LOCALAPPDATA")?;
    let dir = PathBuf::from(local)
        .join("Programs")
        .join("t3-code-desktop");
    first_app_executable(&dir, Some("exe"))
}

#[cfg(target_os = "macos")]
fn installed_executable() -> Option<PathBuf> {
    let bundle = first_app_executable(Path::new("/Applications"), Some("app"))?;
    first_app_executable(&bundle.join("Contents").join("MacOS"), None)
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn installed_executable() -> Option<PathBuf> {
    None
}

/// The executable to launch: the configured path, else the installed build
/// (whatever its channel), else `t3` on the PATH.
pub fn executable(configured: Option<&str>) -> PathBuf {
    if let Some(path) = configured.filter(|path| !path.trim().is_empty()) {
        return PathBuf::from(path);
    }
    installed_executable().unwrap_or_else(|| PathBuf::from("t3"))
}

/// Bring T3 Code to the front (or start it).
pub fn activate(configured: Option<&str>) -> Result<(), String> {
    launch(configured, None)
}

/// The link T3 Code opens a thread from. A second launch hands its arguments
/// to the running app, so passing the link works without the `t3code:` scheme
/// being registered with the OS.
pub fn thread_link(environment_id: &str, thread_id: &str) -> String {
    format!(
        "t3code://threads/{}/{}",
        urlencoding::encode(environment_id),
        urlencoding::encode(thread_id)
    )
}

/// Bring T3 Code to the front on one thread.
pub fn open_thread(
    configured: Option<&str>,
    environment_id: &str,
    thread_id: &str,
) -> Result<(), String> {
    launch(configured, Some(&thread_link(environment_id, thread_id)))
}

fn launch(configured: Option<&str>, argument: Option<&str>) -> Result<(), String> {
    let mut command = hidden_command(executable(configured).to_string_lossy().as_ref());
    if let Some(argument) = argument {
        command.arg(argument);
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open T3 Code: {e}"))
}

/// The server bundle next to the app: where T3's own `t3` CLI lives.
fn server_archive(app_executable: &Path) -> Option<PathBuf> {
    let app_dir = app_executable.parent()?;
    // Windows and Linux keep `resources` beside the executable; a macOS
    // bundle has `Contents/MacOS/<app>` and `Contents/Resources`.
    let resource_dirs = [
        app_dir.join("resources"),
        app_dir.parent()?.join("Resources"),
    ];
    resource_dirs
        .iter()
        .flat_map(|dir| [dir.join("server.asar"), dir.join("app.asar")])
        .find(|archive| archive.is_file())
}

/// Run T3's bundled CLI (`t3 <arguments>`) and return what it printed.
pub fn run_cli(configured: Option<&str>, arguments: &[&str]) -> Result<String, String> {
    let app = executable(configured);
    let archive = server_archive(&app)
        .ok_or_else(|| format!("T3 Code's server was not found next to {}", app.display()))?;
    let entry = archive
        .join("apps")
        .join("server")
        .join("dist")
        .join("bin.mjs");
    let output = hidden_command(app.to_string_lossy().as_ref())
        .env("ELECTRON_RUN_AS_NODE", "1")
        .arg(entry)
        .args(arguments)
        .output()
        .map_err(|e| format!("Failed to run T3 Code's CLI: {e}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr);
        return Err(format!("T3 Code's CLI failed: {}", detail.trim()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_server_bundle_beside_the_app() {
        let dir = tempfile::tempdir().unwrap();
        let resources = dir.path().join("resources");
        std::fs::create_dir_all(&resources).unwrap();
        std::fs::write(resources.join("server.asar"), b"").unwrap();
        let app = dir.path().join("T3 Code (Nightly).exe");
        assert_eq!(server_archive(&app).unwrap(), resources.join("server.asar"));
    }

    #[test]
    fn recognises_every_release_channel_and_skips_the_uninstaller() {
        assert!(is_app_executable("T3 Code (Nightly).exe"));
        assert!(is_app_executable("T3 Code (Alpha).exe"));
        assert!(is_app_executable("T3 Code.exe"));
        assert!(!is_app_executable("Uninstall T3 Code (Nightly).exe"));
        assert!(!is_app_executable("elevate.exe"));
    }

    #[test]
    fn finds_the_app_among_other_files() {
        let dir = tempfile::tempdir().unwrap();
        for name in [
            "Uninstall T3 Code (Nightly).exe",
            "T3 Code (Nightly).exe",
            "ffmpeg.dll",
        ] {
            std::fs::write(dir.path().join(name), b"").unwrap();
        }
        let found = first_app_executable(dir.path(), Some("exe")).unwrap();
        assert_eq!(found.file_name().unwrap(), "T3 Code (Nightly).exe");
    }

    #[test]
    fn a_thread_link_names_the_environment_and_the_thread() {
        assert_eq!(
            thread_link("env 1", "thread-9"),
            "t3code://threads/env%201/thread-9"
        );
    }

    #[test]
    fn a_configured_path_wins() {
        assert_eq!(
            executable(Some("C:/tools/t3.exe")),
            PathBuf::from("C:/tools/t3.exe")
        );
    }
}
