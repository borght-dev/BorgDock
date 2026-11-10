#[cfg(any(windows, test))]
use std::path::Path;
use std::path::PathBuf;

pub fn resolve(program: &str) -> PathBuf {
    #[cfg(windows)]
    {
        let mut directories: Vec<PathBuf> = std::env::var_os("PATH")
            .map(|path| std::env::split_paths(&path).collect())
            .unwrap_or_default();
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            directories.push(PathBuf::from(local).join("Programs/OpenAI/Codex/bin"));
        }
        if let Some(home) = std::env::var_os("USERPROFILE") {
            directories.push(PathBuf::from(home).join(".local/bin"));
        }
        if let Some(roaming) = std::env::var_os("APPDATA") {
            directories.push(PathBuf::from(roaming).join("npm"));
        }
        return resolve_windows(program, &directories);
    }
    #[cfg(not(windows))]
    PathBuf::from(program)
}

#[cfg(any(windows, test))]
fn resolve_windows(program: &str, directories: &[PathBuf]) -> PathBuf {
    let path = Path::new(program);
    if path.components().count() > 1 || path.extension().is_some() {
        return path.to_owned();
    }
    for directory in directories.iter().filter(|dir| !dir.as_os_str().is_empty()) {
        let executable = directory.join(format!("{program}.exe"));
        if executable.is_file() {
            return executable;
        }
        if program == "codex" {
            let target = if cfg!(target_arch = "aarch64") {
                "aarch64-pc-windows-msvc"
            } else {
                "x86_64-pc-windows-msvc"
            };
            let package = if cfg!(target_arch = "aarch64") {
                "codex-win32-arm64"
            } else {
                "codex-win32-x64"
            };
            let root = directory.join("node_modules/@openai/codex");
            for vendor in [
                root.join(format!("node_modules/@openai/{package}/vendor/{target}")),
                root.join(format!("vendor/{target}")),
            ] {
                for relative in ["bin/codex.exe", "codex/codex.exe"] {
                    let native = vendor.join(relative);
                    if native.is_file() {
                        return native;
                    }
                }
            }
        }
        for extension in ["cmd", "bat"] {
            let shim = directory.join(format!("{program}.{extension}"));
            if shim.is_file() {
                return shim;
            }
        }
    }
    path.to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_npm_shims_and_prefers_their_native_codex() {
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().join("npm with spaces");
        std::fs::create_dir_all(&directory).unwrap();
        let shim = directory.join("codex.cmd");
        std::fs::write(&shim, "@echo off").unwrap();
        assert_eq!(resolve_windows("codex", &[directory.clone()]), shim);
        let package = if cfg!(target_arch = "aarch64") {
            "codex-win32-arm64"
        } else {
            "codex-win32-x64"
        };
        let target = if cfg!(target_arch = "aarch64") {
            "aarch64-pc-windows-msvc"
        } else {
            "x86_64-pc-windows-msvc"
        };
        let native = directory.join(format!("node_modules/@openai/codex/node_modules/@openai/{package}/vendor/{target}/bin/codex.exe"));
        std::fs::create_dir_all(native.parent().unwrap()).unwrap();
        std::fs::write(&native, "fixture").unwrap();
        assert_eq!(resolve_windows("codex", &[directory]), native);
    }

    #[test]
    fn preserves_overrides_and_missing_program_errors() {
        assert_eq!(
            resolve_windows("C:/custom/codex.exe", &[]),
            PathBuf::from("C:/custom/codex.exe")
        );
        assert_eq!(resolve_windows("missing", &[]), PathBuf::from("missing"));
        assert_eq!(
            resolve_windows("codex.cmd", &[]),
            PathBuf::from("codex.cmd")
        );
    }

    #[test]
    fn follows_path_order_and_prefers_exe_over_shim() {
        let root = tempfile::tempdir().unwrap();
        let first = root.path().join("first");
        let second = root.path().join("second");
        for directory in [&first, &second] {
            std::fs::create_dir_all(directory).unwrap();
        }
        let shim = first.join("claude.cmd");
        std::fs::write(&shim, "fixture").unwrap();
        std::fs::write(second.join("claude.exe"), "fixture").unwrap();
        let directories = [first.clone(), second];
        assert_eq!(resolve_windows("claude", &directories), shim);
        let native = first.join("claude.exe");
        std::fs::write(&native, "fixture").unwrap();
        assert_eq!(resolve_windows("claude", &directories), native);
    }
}
